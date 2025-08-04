// game/logic.js
// ======================================================================
// CORE GAME LOGIC ("The Brain")
// Chứa bộ não của game: tạo trạng thái, xử lý luồng vòng chơi, tính toán, và kiểm tra chiến thắng.
// PHIÊN BẢN ĐÃ SỬA LỖI TÍNH ĐIỂM VÀ NÂNG CẤP AI
// ======================================================================

const config = require('./config.js');
const { ROLES, DECREES, SKILL_COSTS, GAME_CONSTANTS, ARTIFACTS } = config;

// --- [MỚI] HÀM CHO CHỨC NĂNG CHƠI LẠI ---
function resetRoomForRematch(room) {
    if (!room) return;
    
    // 1. Xóa trạng thái game cũ
    room.gameState = null;

    // 2. Reset trạng thái của từng người chơi về trạng thái phòng chờ
    room.players.forEach(player => {
        // Giữ lại thông tin cơ bản: id, name, isBot, disconnected, personality
        // Xóa hoặc reset các thuộc tính trong game
        if (!player.isBot) {
            player.isReady = false; // Yêu cầu sẵn sàng lại
        }
        // Xóa các thuộc tính không cần thiết cho phòng chờ
        delete player.score;
        delete player.chosenAction;
        delete player.roleId;
        // ... xóa các thuộc tính khác nếu có ...
    });

    console.log(`[Rematch] Đã reset phòng ${room.hostId}.`);
}


// --- CÁC HÀM TIỆN ÍCH & KHỞI TẠO ---
function getPlayersByScore(players, type) {
    const activePlayers = players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return [];
    const scores = activePlayers.map(p => p.score);
    if (scores.length === 0) return [];
    const criticalScore = type === 'highest' ? Math.max(...scores) : Math.min(...scores);
    return activePlayers.filter(p => p.score === criticalScore);
}

function initializeAssassin(assassin, allPlayers) {
    const potentialTargets = allPlayers.filter(p => p.id !== assassin.id);
    if (potentialTargets.length > 0) {
        assassin.bountyTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
    }
}

function initializeMimic(mimic, allPlayers, io) {
   const potentialTargets = allPlayers.filter(p => p.id !== mimic.id && !p.isDefeated && !p.disconnected);
    if (potentialTargets.length > 0) {
        const targetPlayer = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
        mimic.mimicTargetId = targetPlayer.id;
        io.to(mimic.id).emit('privateInfo', {title: "Sao Chép", text: `Đêm nay bạn sẽ sao chép hành động của **${targetPlayer.name}**.`});
    }
}

const roleInitializers = {
    'ASSASSIN': initializeAssassin,
    'MIMIC': initializeMimic, 
};

function initializeSpecialRoles(gs, io) {
    gs.players.forEach(player => {
        if (roleInitializers[player.roleId]) {
            roleInitializers[player.roleId](player, gs.players, io);
        }
    });
}
function createGameState(players, io) {
    const numPlayers = players.length;
    let winScore, loseScore;
    if (numPlayers <= 4) { winScore = 15; loseScore = -15; }
    else if (numPlayers <= 8) { winScore = 20; loseScore = -20; }
    else { winScore = 25; loseScore = -25; }

    const rolesToAssign = [...config.ALL_ROLE_IDS];
    for (let i = rolesToAssign.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rolesToAssign[i], rolesToAssign[j]] = [rolesToAssign[j], rolesToAssign[i]];
    }
    const rolesInThisGame = rolesToAssign.slice(0, numPlayers);
  
    const gameState = {
        players: players.map((p, index) => ({
            ...p,
            score: 0,
            chosenAction: null,
            roleId: rolesInThisGame[index % rolesInThisGame.length],
            skillUses: 0,
            artifacts: [],
            consecutiveSuccessAccusations: 0,
            hauntSuccessCount: 0,
            hasReached7: false,
            hasReachedMinus7: false,
            loneWolfWins: 0,
            bountyTargetId: null,
            mimicTargetId: null,
            isBlessed: false,
            blessedById: null,
            skillUsedThisRound: false,
            skillTargetId: null, 
            skillActive: false,
            isSkillDisabled: false,
            hasTripleVote: false,
        })),
        currentRound: 0,
        winScore, loseScore,
        phase: 'waiting',
        roundData: {},
        decreeDeck: [], decreeDiscard: [],
        consecutiveDraws: 0,
        rolesInGame: rolesInThisGame,
        nextDecreeChooser: null,
        failedAccusationsThisRound: 0,
    };

    initializeSpecialRoles(gameState, io);
    shuffleDecreeDeck(gameState);
    return gameState;
}


function shuffleDecreeDeck(gs) {
    gs.decreeDeck = [...config.ALL_DECREE_IDS];
    for (let i = gs.decreeDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gs.decreeDeck[i], gs.decreeDeck[j]] = [gs.decreeDeck[j], gs.decreeDeck[i]];
    }
    gs.decreeDiscard = [];
}

function startNewRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    gs.currentRound++;
    gs.phase = 'exploration';
    gs.roundData = {
        decrees: [], coordinationVotes: [], actedInTwilight: new Set(), failedAccusationsThisRound: 0,
    };
    gs.players.forEach(p => {
        if (!p.isDefeated) {
            p.chosenAction = null; p.isBlessed = false; p.blessedById = null;
            p.skillUsedThisRound = false; p.skillActive = false; p.skillTargetId = null;
            p.isSkillDisabled = false; p.hasTripleVote = false;
        }
    });

    const mimic = gs.players.find(p => p.roleId === 'MIMIC' && !p.isDefeated);
    if (mimic) {
        initializeMimic(mimic, gs.players, io);
    }

 io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound,
        players: gs.players,
        duration: GAME_CONSTANTS.CHOICE_DURATION
    });
    console.log(`[LOGIC] Bắt đầu vòng ${gs.currentRound} cho phòng ${roomCode}.`);

    gs.roundData.choiceTimer = setTimeout(() => {
        const currentRoom = rooms[roomCode];
        if (!currentRoom || !currentRoom.gameState) return;
        
        currentRoom.gameState.players.forEach(p => {
            if (!p.chosenAction && !p.isDefeated) {
                p.chosenAction = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                io.to(roomCode).emit('playerChose', p.id);
            }
        });
         revealDecreeAndContinue(roomCode, rooms, io);
    }, GAME_CONSTANTS.CHOICE_DURATION * 1000);

    triggerBotChoices(roomCode, rooms, io);

}
function handlePlayerChoice(roomCode, playerId, choice, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'exploration') return;
    const player = gs.players.find(p => p.id === playerId);

     if (player && !player.chosenAction && !player.isDefeated) {
        if (player.roleId === 'REBEL' && player.skillActive) {
            io.to(player.id).emit('privateInfo', { type: 'error', message: 'Hành động của bạn đã bị khóa bởi kỹ năng Khiêu Khích!' });
            return;
        }
        
        player.chosenAction = choice;
        io.to(roomCode).emit('playerChose', playerId);

        const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
        if (activePlayers.every(p => p.chosenAction)) {
            clearTimeout(gs.roundData.choiceTimer);
             startCoordinationPhase(roomCode, rooms, io);
        }
    }
}
function handleVoteToSkip(roomCode, playerId, phase, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || (gs.phase !== 'coordination' && gs.phase !== 'twilight')) return;

    gs.roundData.actedInTwilight.add(playerId);
    const voteSet = phase === 'coordination' ? gs.roundData.votesToSkipcoordination : gs.roundData.votesToSkiptwilight;
    if (!voteSet) {
        // Khởi tạo nếu chưa tồn tại
        if(phase === 'coordination') gs.roundData.votesToSkipcoordination = new Set();
        else gs.roundData.votesToSkiptwilight = new Set();
    };

    (phase === 'coordination' ? gs.roundData.votesToSkipcoordination : gs.roundData.votesToSkiptwilight).add(playerId);
    
    const buttonId = phase === 'coordination' ? 'skip-coordination-btn' : 'twilight-rest-btn';
    io.to(roomCode).emit('updateSkipVoteCount', { 
        buttonId: buttonId,
        count: (phase === 'coordination' ? gs.roundData.votesToSkipcoordination : gs.roundData.votesToSkiptwilight).size,
        total: gs.players.filter(p => !p.isDefeated && !p.disconnected).length
    });

    const activePlayersCount = gs.players.filter(p => !p.isDefeated && !p.disconnected).length;
    if (gs.roundData.actedInTwilight.size >= activePlayersCount) {
        if (phase === 'coordination') {
            clearTimeout(gs.roundData.coordinationTimer);
            io.to(roomCode).emit('logMessage', { type: 'info', message: "Giai đoạn Phối hợp kết thúc." });
            io.to(roomCode).emit('coordinationPhaseEnded');
            setTimeout(() => revealDecreeAndContinue(roomCode, rooms, io), 2000);
        } else if (phase === 'twilight') {
            endTwilightPhase("Tất cả Thợ Săn đã quyết định hành động trong hoàng hôn.", roomCode, rooms, io);
        }
    }
}

function startCoordinationPhase(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    gs.phase = 'coordination';
    gs.roundData.actedInTwilight = new Set(); // Reset hành động cho giai đoạn này
    gs.roundData.votesToSkipcoordination = new Set(); // Khởi tạo set

    const DURATION = 15; // Thời gian cho giai đoạn phối hợp
    io.to(roomCode).emit('coordinationPhaseStarted', { duration: DURATION });
    
    gs.roundData.coordinationTimer = setTimeout(() => {
        if (!rooms[roomCode] || rooms[roomCode].gameState.phase !== 'coordination') return;
        revealDecreeAndContinue(roomCode, rooms, io);
    }, DURATION * 1000);
}
function handleUseArtifact(socket, roomCode, artifactId, payload, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === socket.id);
    const artifactIndex = player.artifacts.findIndex(a => a.id === artifactId);

    if (!player || artifactIndex === -1) {
        return socket.emit('privateInfo', { type: 'error', text: 'Bạn không sở hữu cổ vật này.' });
    }
    const artifact = player.artifacts[artifactIndex];

    io.to(roomCode).emit('logMessage', { type: 'warning', message: `📜 **${player.name}** đã kích hoạt một Cổ vật bí ẩn!` });
    
    artifact.usedThisRound = true;

    if (artifact.id !== 'AMULET_OF_CLARITY') { 
        player.artifacts.splice(artifactIndex, 1);
    }
    
    io.to(player.id).emit('artifactUpdate', { artifacts: player.artifacts });
}



function handleCoordination(roomCode, initiatorId, targetId, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target) return;

    gs.roundData.coordinationVotes.push({ initiatorId, targetId });
    io.to(roomCode).emit('logMessage', { type: 'info', message: `🤝 **${initiator.name}** đã đề nghị Phối Hợp với **${target.name}**.` });

    if (target.roleId === 'ASSASSIN') {
        io.to(target.id).emit('privateInfo', { title: 'Bị Nhắm Đến', text: `**${initiator.name}** đã Phối Hợp với bạn. Hành động bí mật của họ là: **${initiator.chosenAction}**` });
    }
}




function revealDecreeAndContinue(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.phase = 'decree';
    if (gs.currentRound === 1) {
        io.to(roomCode).emit('logMessage', { type: 'info', message: "Đêm đầu tiên yên tĩnh, không có Tiếng Vọng." });
        startTwilightPhase(roomCode, rooms, io);
        return;
    }

    if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
    const decreeChooser = gs.nextDecreeChooser || getPlayersByScore(gs.players.filter(p => !p.isDefeated), 'lowest')[0];
    gs.nextDecreeChooser = null;

    let decreesToReveal = [];
    let firstDecreeId = gs.decreeDeck.pop();
    gs.decreeDiscard.push(firstDecreeId);

    if (firstDecreeId === 'DEM_SONG_TRUNG') {
        decreesToReveal.push({ ...DECREES[firstDecreeId], id: firstDecreeId });
        if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
        firstDecreeId = gs.decreeDeck.pop();
        gs.decreeDiscard.push(firstDecreeId);
    }
    decreesToReveal.push({ ...DECREES[firstDecreeId], id: firstDecreeId });
    gs.roundData.decrees = decreesToReveal;

    io.to(roomCode).emit('decreeRevealed', {
        drawerName: decreeChooser?.name || 'Ngôi đền',
        decrees: decreesToReveal.map(d => ({ name: d.name, description: d.description }))
    });

    let continueToTwilight = true;
    decreesToReveal.forEach(decree => {
        switch (decree.id) {
            case 'VU_DIEU_HON_LOAN':
               const allActions = gs.players.filter(p => !p.isDefeated && !p.disconnected).map(p => p.chosenAction);
                for (let i = allActions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allActions[i], allActions[j]] = [allActions[j], allActions[i]]; }
                gs.players.filter(p => !p.isDefeated && !p.disconnected).forEach((p, i) => { p.chosenAction = allActions[i]; });
                io.to(roomCode).emit('logMessage', { type: 'warning', message: 'Vũ Điệu Hỗn Loạn! Hành động của mọi người đã bị xáo trộn!' });
                break;
            case 'AO_GIAC_DICH_CHUYEN':
               const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
                if (activePlayers.length > 1) {
                    const lastAction = activePlayers[activePlayers.length - 1].chosenAction;
                    for (let i = activePlayers.length - 1; i > 0; i--) { activePlayers[i].chosenAction = activePlayers[i - 1].chosenAction; }
                    activePlayers[0].chosenAction = lastAction;
                }
                io.to(roomCode).emit('logMessage', { type: 'warning', message: 'Ảo Giác Dịch Chuyển! Hành động đã được chuyển cho người bên cạnh!' });
                break;
            case 'BUA_LU_LAN':
                continueToTwilight = false;
                gs.phase = 'amnesia_selection';
                if (decreeChooser) {
                    io.to(decreeChooser.id).emit('promptAmnesiaAction', { validTargets: gs.players.filter(p => !p.isDefeated).map(p => ({id: p.id, name: p.name})) });
                    io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 ${decreeChooser.name} đang hoán đổi hành động của hai người!` });
                }
                break;
            case 'DAU_TRUONG_SINH_TU':
                continueToTwilight = false;
                gs.phase = 'arena_picking';
                gs.roundData.arena = { duelist1: null, duelist2: null, bets: {} };
                if (decreeChooser) {
                    io.to(roomCode).emit('logMessage', { type: 'warning', message: `⚔️ ${decreeChooser.name} đang chọn ra hai Đấu Sĩ!` });
                    io.to(decreeChooser.id).emit('promptArenaPick', { validTargets: gs.players.filter(p => !p.isDefeated).map(p => ({ id: p.id, name: p.name })) });
                }
                break;
        }
    });
    
    if (continueToTwilight) {
        // [SỬA LỖI] Sử dụng biến đã được destructuring
        setTimeout(() => startTwilightPhase(roomCode, rooms, io), GAME_CONSTANTS.DECREE_REVEAL_DELAY);
    }
}
function handleAmnesiaAction(roomCode, data, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'amnesia_selection') return;
    const p1 = gs.players.find(p => p.id === data.player1Id);
    const p2 = gs.players.find(p => p.id === data.player2Id);
    if (p1 && p2) {
        [p1.chosenAction, p2.chosenAction] = [p2.chosenAction, p1.chosenAction];
        io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 Hành động của **${p1.name}** và **${p2.name}** đã bị hoán đổi!` });
    }
    startTwilightPhase(roomCode, rooms, io);
}

function handleArenaPick(roomCode, data, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'arena_picking') return;
    gs.roundData.arena.duelist1 = gs.players.find(p => p.id === data.player1Id);
    gs.roundData.arena.duelist2 = gs.players.find(p => p.id === data.player2Id);
    if (!gs.roundData.arena.duelist1 || !gs.roundData.arena.duelist2) return;
    io.to(roomCode).emit('logMessage', { type: 'info', message: `Hai Đấu Sĩ: **${gs.roundData.arena.duelist1.name}** và **${gs.roundData.arena.duelist2.name}**!` });
    gs.phase = 'arena_betting';
    const spectators = gs.players.filter(p => !p.isDefeated && p.id !== data.player1Id && p.id !== data.player2Id);
    spectators.forEach(s => {
        io.to(s.id).emit('promptArenaBet', {
            duelist1: { id: gs.roundData.arena.duelist1.id, name: gs.roundData.arena.duelist1.name },
            duelist2: { id: gs.roundData.arena.duelist2.id, name: gs.roundData.arena.duelist2.name },
            maxBet: Math.max(0, Math.min(2, s.score))
        });
    });
    io.to(roomCode).emit('logMessage', { type: 'info', message: `Các Khán Giả có 20 giây để đặt cược!` });
    setTimeout(() => resolveArenaDuel(roomCode, rooms, io), 20000);
}

function handleArenaBet(roomCode, playerId, betData, rooms) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'arena_betting') return;
    const player = gs.players.find(p => p.id === playerId);
    if (!player) return;
    const amount = Math.max(0, Math.min(betData.amount, 2, player.score));
    gs.roundData.arena.bets[playerId] = { targetId: betData.targetId, amount };
}

function resolveArenaDuel(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || (gs.phase !== 'arena_betting' && gs.phase !== 'arena_picking')) return;
    gs.phase = 'arena_resolved';
    const { duelist1, duelist2, bets } = gs.roundData.arena;
    if (!duelist1 || !duelist2) return;
    const d1_success = duelist1.chosenAction === duelist2.chosenAction;
    const duelWinner = d1_success ? duelist1 : duelist2;
    io.to(roomCode).emit('logMessage', { type: 'warning', message: `Trận đấu kết thúc! Hành động của ${duelist1.name}: **${duelist1.chosenAction}**, của ${duelist2.name}: **${duelist2.chosenAction}**.` });
    io.to(roomCode).emit('logMessage', { type: 'success', message: `**${duelWinner.name}** đã chiến thắng trong trận tay đôi!` });
    for (const spectatorId in bets) {
        const bet = bets[spectatorId];
        const spectator = gs.players.find(p => p.id === spectatorId);
        if (spectator) {
            if (bet.targetId === duelWinner.id) {
                spectator.score += bet.amount;
                io.to(spectatorId).emit('privateInfo', { title: "Thắng Cược!", text: `Bạn đoán đúng và nhận ${bet.amount} Tiến Độ.` });
            } else {
                spectator.score -= bet.amount;
                io.to(spectatorId).emit('privateInfo', { title: "Thua Cược!", text: `Bạn đoán sai và mất ${bet.amount} Tiến Độ.` });
            }
        }
    }
    io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({id: p.id, score: p.score})));
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 4000);
}
         
function startTwilightPhase(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    
    console.log(`[LOGIC] Bắt đầu Hoàng Hôn. CHAOS_DURATION là: ${config.CHAOS_DURATION}`);
    gs.phase = 'twilight';
    
    // =============================================================
    // --- SỬA LỖI ---
    // Khởi tạo Set để theo dõi những người bỏ phiếu trong giai đoạn Hoàng Hôn
    gs.roundData.votesToSkiptwilight = new Set();
    // =============================================================

    io.to(roomCode).emit('twilightPhaseStarted', { duration: GAME_CONSTANTS.CHAOS_DURATION });

    gs.roundData.twilightTimer = setTimeout(() => {
        console.log(`[LOGIC] Hết giờ Giai Đoạn Hoàng Hôn.`);
        endTwilightPhase("Hết giờ cho giai đoạn Hoàng Hôn.", roomCode, rooms, io);
    }, GAME_CONSTANTS.CHAOS_DURATION * 1000);
}


function endTwilightPhase(message, roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || (gs.phase !== 'twilight' && gs.phase !== 'reveal_pending')) return;
    
    if (gs.roundData.decrees.some(d => d.id === 'GIAO_UOC_BAT_BUOC')) {
        let penaltyMessage = "Những người không tuân thủ Giao Ước Bắt Buộc đã phải trả giá: ";
        let penalized = [];
        gs.players.forEach(p => {
            if(!gs.roundData.actedInTwilight.has(p.id) && !p.isDefeated && !p.isBot) {
                p.score -= 2;
                penalized.push(p.name);
            }
        });
        if(penalized.length > 0) {
             io.to(roomCode).emit('logMessage', { type: 'error', message: penaltyMessage + penalized.join(', ') });
        }
    }

    gs.phase = 'reveal_pending';
    clearTimeout(gs.roundData.twilightTimer);
    io.to(roomCode).emit('chaosActionResolved', { message });
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 3000);
}
function handleTwilightAction(roomCode, initiatorId, targetId, actionType, guess, rooms, io) {
    // [SỬA LỖI CÚ PHÁP] VIẾT LẠI HOÀN TOÀN
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'twilight') return;

    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target || initiator.id === target.id) return;
    
    gs.roundData.actedInTwilight.add(initiator.id);

    if (target.roleId === 'ASSASSIN') {
        io.to(target.id).emit('privateInfo', { title: 'Bị Nhắm Đến', text: `**${initiator.name}** đã Vạch Trần bạn. Hành động bí mật của họ là: **${initiator.chosenAction || 'Chưa chọn'}**` });
    }

    if (actionType === 'Vạch Trần') {
        const success = (guess === target.chosenAction);
        let message = `🔥 **${initiator.name}** đã Vạch Trần **${target.name}** và phán đoán **${success ? "ĐÚNG" : "SAI"}**!`;
        
        if (success) {
            // Xử lý Tiếng Vọng "Thách Thức Kẻ Dẫn Đầu" trước
            const isChallengeDecreeActive = gs.roundData.decrees.some(d => d.id === 'THACH_THUC_KE_DAN_DAU');
            const leaders = getPlayersByScore(gs.players, 'highest');
            if (isChallengeDecreeActive && leaders.some(leader => leader.id === target.id)) {
                [initiator.score, target.score] = [target.score, initiator.score];
                message = `⚔️ **${initiator.name}** đã thách thức thành công Kẻ Dẫn Đầu! Điểm số của họ đã bị hoán đổi!`;
            } else {
                // Xử lý điểm Vạch Trần thông thường
                initiator.score += 2;
                target.score -= 2;

                // Xử lý nội tại Kẻ Phán Xử
                if (initiator.roleId === 'INQUISITOR' && target.chosenAction === 'Phá Hoại') {
                    initiator.score += 1;
                }
                
                // Xử lý kỹ năng Sát Thủ
                const assassin = gs.players.find(p => p.roleId === 'ASSASSIN' && !p.isDefeated);
                if (assassin && assassin.bountyTargetId === target.id) {
                    if (initiator.id === assassin.id) {
                        target.score = Math.floor(target.score / 2);
                        io.to(roomCode).emit('logMessage', { type: 'warning', message: `💥 **${assassin.name}** đã hoàn thành hợp đồng, điểm của **${target.name}** bị chia đôi!` });
                    } else {
                        target.score -= 2; // Mất gấp đôi
                        io.to(roomCode).emit('logMessage', { type: 'error', message: `🎯 **${target.name}** là mục tiêu bị săn đuổi và phải chịu hình phạt nặng hơn!` });
                    }
                }
            }
			 if (initiator.roleId === 'PROPHET') {
                initiator.consecutiveSuccessAccusations = (initiator.consecutiveSuccessAccusations || 0) + 1;
            }
        } else { // Vạch Trần thất bại
            initiator.score -= (initiator.roleId === 'PROPHET') ? 1 : 2;
            target.score += 2;
            gs.roundData.failedAccusationsThisRound++;
			 if (initiator.roleId === 'PROPHET') {
                initiator.consecutiveSuccessAccusations = 0;
            }
        
        }
		
        
        io.to(roomCode).emit('logMessage', { type: success ? 'success' : 'error', message });
        io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({ id: p.id, score: p.score })));
    }
    
    // Kiểm tra kết thúc giai đoạn
    const activePlayersCount = gs.players.filter(p => !p.isDefeated && !p.disconnected).length;
    if (gs.roundData.actedInTwilight.size >= activePlayersCount) {
        endTwilightPhase("Tất cả Thợ Săn đã quyết định hành động trong hoàng hôn.", roomCode, rooms, io);
    }
}



function handlePostRoundEvents(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    
    // Cập nhật trạng thái cho các vai trò
    gs.players.forEach(p => {
        if (!p.isDefeated) {
            if (p.score >= 7) p.hasReached7 = true;
            if (p.score <= -7) p.hasReachedMinus7 = true;
            if (gs.roundData.roundWinners?.includes(p.id) && gs.roundData.roundWinners.length === 1) {
                p.loneWolfWins = (p.loneWolfWins || 0) + 1;
            }
        }
    });

    const winnerByRole = checkRoleVictory(gs);
    const winnersByScore = gs.players.filter(p => p.score >= gs.winScore);
    const losersByScore = gs.players.filter(p => p.score <= gs.loseScore);

    if (winnerByRole || winnersByScore.length > 0 || losersByScore.length > 0) {
        gs.phase = 'gameover';
        let winner = winnerByRole || winnersByScore[0];
        let loser = losersByScore[0];
        let reason = "Trò chơi kết thúc.";
        if (winner) reason = `Người chiến thắng là ${winner.name}! Lý do: ` + (winnerByRole ? `đã hoàn thành Thiên Mệnh "${ROLES[winner.roleId].name}"!` : `đạt ${gs.winScore} điểm.`);
        else if(loser) reason = `Người thua cuộc là ${loser.name} vì đạt ${gs.loseScore} điểm!`;
        io.to(roomCode).emit('gameOver', { winner: winner ? {name: winner.name, reason: reason} : null, loser: loser ? {name: loser.name, reason: reason} : null });
    } else {
        // Gửi tín hiệu để host có thể bắt đầu vòng mới
        const hostSocket = io.sockets.sockets.get(rooms[roomCode].hostId);
        if (hostSocket) {
             // Không cần emit sự kiện riêng, client đã có nút sau 'roundResult'
        }
    }
}

function checkRoleVictory(gs) {
    // Hoàn thiện logic kiểm tra thắng
    for (const player of gs.players) {
        if (player.isDefeated) continue;
        let isWinner = false;
        switch (player.roleId) {
            case 'PROPHET':
                isWinner = player.consecutiveSuccessAccusations >= 3 && player.score >= (gs.winScore * 2/3);
                break;
            case 'PEACEMAKER':
                isWinner = gs.consecutiveDraws >= 3;
                break;
            case 'GAMBLER':
                isWinner = player.hasReached7 && player.hasReachedMinus7;
                break;
            case 'REBEL':
                isWinner = player.loneWolfWins >= 3;
                break;
            case 'MIND_BREAKER':
                const totalFailedAccusations = gs.players.reduce((sum, p) => sum + (p.totalFailedAccusations || 0), 0);
                isWinner = totalFailedAccusations >= 5;
                break;
            case 'PHANTOM':
                isWinner = player.hauntSuccessCount >= 5;
                break;
            case 'CULTIST':
                isWinner = player.score <= gs.loseScore;
                break;
        }
        if (isWinner) return player;
    }
    return null;
}


function getPlayersByScore(players, type) {
    const activePlayers = players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return [];
    const scores = activePlayers.map(p => p.score);
    if (scores.length === 0) return [];
    const criticalScore = type === 'highest' ? Math.max(...scores) : Math.min(...scores);
    return activePlayers.filter(p => p.score === criticalScore);
}

function triggerBotChoices(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.players.forEach(p => {
        if (p.isBot && !p.isDefeated && !p.chosenAction) {
            setTimeout(() => {
                if (gs.phase === 'exploration' && !p.chosenAction) {
                    let choice;
                    const scores = gs.players.filter(x => !x.isBot).map(x => x.score);
                    const botScore = p.score;
                    const voteCounts = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
                    gs.players.forEach(pl => { if (pl.chosenAction) voteCounts[pl.chosenAction]++; });

                    if (botScore >= gs.winScore - 3) {
                        let least = Object.entries(voteCounts).filter(([k]) => k !== 'Quan Sát').sort((a, b) => a[1] - b[1]);
                        choice = least.length > 0 ? least[0][0] : 'Giải Mã';
                    } else if (botScore <= gs.loseScore + 3) {
                        choice = voteCounts['Quan Sát'] < Math.floor(gs.players.length / 2) ? 'Quan Sát' : 'Giải Mã';
                    } else {
                        switch (p.personality) {
                            case 'aggressive': choice = Math.random() < 0.7 ? 'Phá Hoại' : 'Giải Mã'; break;
                            case 'cautious': choice = Math.random() < 0.75 ? 'Giải Mã' : 'Quan Sát'; break;
                            default:
                                let most = Object.entries(voteCounts).sort((a,b) => b[1]-a[1]);
                                choice = Math.random() < 0.5 ? most[0][0] : most[most.length-1][0];
                        }
                    }

                    handlePlayerChoice(roomCode, p.id, choice, rooms, io);
                }
            }, Math.random() * 5000 + 2000);
        }
    });
}

function triggerBotPhaseAction(roomCode, rooms, io, phase) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    const bots = gs.players.filter(p => p.isBot && !p.isDefeated && !gs.roundData.actedInTwilight.has(p.id));
    const potentialTargets = gs.players.filter(p => !p.isBot && !p.isDefeated);

    bots.forEach(bot => {
        setTimeout(() => {
            if (gs.phase !== phase || gs.roundData.actedInTwilight.has(bot.id)) return;

            let decisionToAction = false;
            switch(bot.personality) {
                case 'aggressive': decisionToAction = Math.random() < 0.6; break;
                case 'cautious': decisionToAction = Math.random() < 0.2; break;
                default: decisionToAction = Math.random() < 0.4; break;
            }

            if (decisionToAction && potentialTargets.length > 0) {
                const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

                if (phase === 'coordination') {
                    io.to(roomCode).emit('logMessage', { type: 'info', message: `🤖 **${bot.name}** (Bot) đã đề nghị Phối Hợp với **${target.name}**.` });
                    handleCoordination(roomCode, bot.id, target.id, rooms, io);
                } else if (phase === 'twilight') {
                    gs.roundData.actedInTwilight.add(bot.id);
                    const guessOptions = ['Giải Mã', 'Phá Hoại', 'Quan Sát'];
                    const guess = guessOptions[Math.floor(Math.random() * guessOptions.length)];
                    
                    io.to(roomCode).emit('playerAccused', { initiatorId: bot.id, targetId: target.id });
                    io.to(roomCode).emit('logMessage', { type: 'info', message: `🤖 **${bot.name}** (Bot) đã Vạch Trần **${target.name}**!` });
                    handleTwilightAction(roomCode, bot.id, target.id, 'Vạch Trần', guess, rooms, io);
                }

            } else {
                const skipPhase = phase === 'coordination' ? 'coordination' : 'twilight';
                const skipMessage = phase === 'coordination' ? 'hành động một mình' : 'nghỉ ngơi';
                
                io.to(roomCode).emit('logMessage', { type: 'info', message: `🤖 **${bot.name}** (Bot) đã chọn ${skipMessage}.` });
                handleVoteToSkip(roomCode, bot.id, skipPhase, rooms, io);
            }
        }, Math.random() * 8000 + 3000);
    });
}


function handleUseSkill(socket, roomCode, payload, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === socket.id);
    if (!player || player.isDefeated || player.isSkillDisabled || player.skillUsedThisRound) {
        return io.to(player.id).emit('privateInfo', { title: 'Lỗi', text: 'Không thể dùng kỹ năng!' });
    }

    let cost = SKILL_COSTS[player.skillUses] || SKILL_COSTS[SKILL_COSTS.length - 1];
    if (player.roleId === 'MIMIC' || player.roleId === 'CULTIST') cost = 2;
    if (player.roleId === 'PHANTOM' && player.freeHaunt) { cost = 0; player.freeHaunt = false; }

    if (cost > 0 && player.score < cost) {
        return io.to(player.id).emit('privateInfo', { title: 'Lỗi', text: `Không đủ Tiến Độ để dùng kỹ năng (cần ${cost})!` });
    }

    player.score -= cost;
    player.skillUsedThisRound = true;
    player.skillUses++; // <-- Số lần dùng đã tăng lên

    io.to(player.id).emit('privateInfo', { title: 'Kỹ Năng Đã Dùng', text: `Bạn đã trả ${cost} Tiến Độ.` });
    io.to(roomCode).emit('updatePlayerCards', [{ id: player.id, score: player.score }]);
	 const roleData = { ...ROLES[player.roleId], id: player.roleId };

    // 2. Tính toán chi phí MỚI cho lần dùng tiếp theo
    let nextCost = SKILL_COSTS[player.skillUses] || SKILL_COSTS[SKILL_COSTS.length - 1];
    if (player.roleId === 'MIMIC' || player.roleId === 'CULTIST') nextCost = 2;

    // 3. Gán chi phí mới vào dữ liệu và gửi lại
    roleData.currentSkillCost = nextCost;
    io.to(player.id).emit('yourRoleIs', roleData); // Dùng lại sự kiện 'yourRoleIs' để client cập nhật

   
    let messageForRoom = `✨ ${player.name} đã sử dụng một kỹ năng bí ẩn...`;
    
    switch (player.roleId) {
        // CÁC CASE CẦN CHỌN MỤC TIÊU
        case 'PROPHET':
        case 'PEACEMAKER':
        case 'PRIEST':
        case 'PHANTOM':
            player.skillTargetId = payload.targetId;
            if (player.roleId === 'PROPHET') {
                const targetPlayer = gs.players.find(p => p.id === payload.targetId);
                if (targetPlayer) io.to(player.id).emit('privateInfo', { title: 'Thiên Lý Nhãn', text: `Hành động của ${targetPlayer.name} là: **${targetPlayer.chosenAction || 'Chưa chọn'}**.` });
            }
            break;
           
        case 'MIND_BREAKER':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer && payload.chosenAction) {
                targetPlayer.chosenAction = payload.chosenAction;
                messageForRoom = `🧠 Một thế lực vô hình đã điều khiển hành động của **${targetPlayer.name}**.`;
                io.to(roomCode).emit('playerChose', targetPlayer.id);
            }
            break;
			// CÁC CASE KÍCH HOẠT ĐỂ XỬ LÝ CUỐI VÒNG
        case 'MAGNATE':
        case 'THIEF':
        case 'DOUBLE_AGENT':
            player.skillActive = true;
            player.skillTargetId = payload.targetId;
            break;
            
        case 'GAMBLER':
            player.skillActive = true;
            player.gamblerBet = payload.chosenFaction;
            messageForRoom = `💰 ${player.name} đã đặt cược tất tay!`;
            break;
            
        case 'REBEL':
            player.skillActive = true;
            player.rebelDeclaration = payload.declaredAction;
            player.rebelPunishTarget = payload.punishTargetId;
            messageForRoom = `📢 ${player.name} đã đưa ra một lời tuyên bố thách thức!`;
            break;
        case 'INQUISITOR':
            const sabotageCount = gs.players.filter(p => !p.isDefeated && p.chosenAction === 'Phá Hoại').length;
            if (sabotageCount > 0) {
                gs.players.forEach(p => { if (p.chosenAction === 'Phá Hoại') p.score -= sabotageCount; });
                messageForRoom = `⚖️ **${player.name}** thực thi PHÁN QUYẾT! ${sabotageCount} kẻ Phá Hoại đã bị trừng phạt!`;
                io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({ id: p.id, score: p.score })));
            }
            break;
        case 'BALANCER':
            const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
            const highestPlayers = getPlayersByScore(activePlayers, 'highest');
            const lowestPlayers = getPlayersByScore(activePlayers, 'lowest');

            // Kiểm tra xem có cả nhóm cao nhất và thấp nhất, và hai nhóm này không phải là một
            if (highestPlayers.length > 0 && lowestPlayers.length > 0 && highestPlayers[0].score !== lowestPlayers[0].score) {
                
                // Lấy ra mức điểm cao nhất và thấp nhất
                const highestScore = highestPlayers[0].score;
                const lowestScore = lowestPlayers[0].score;

                // Tính điểm trung bình mới
                const avgScore = Math.round((highestScore + lowestScore) / 2);

                // Cập nhật điểm cho TẤT CẢ người chơi trong nhóm cao nhất
                highestPlayers.forEach(p => {
                    p.score = avgScore;
                });

                // Cập nhật điểm cho TẤT CẢ người chơi trong nhóm thấp nhất
                lowestPlayers.forEach(p => {
                    p.score = avgScore;
                });

                // Tạo thông báo và gửi cập nhật cho tất cả client
                const affectedPlayerNames = [...highestPlayers, ...lowestPlayers].map(p => p.name);
                messageForRoom = `📈📉 ${player.name} đã tái phân bố lại điểm số! Điểm của ${affectedPlayerNames.join(', ')} đã được cân bằng.`;
                io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({id: p.id, score: p.score})));
            } else {
                // Gửi phản hồi nếu không thể dùng kỹ năng
                io.to(player.id).emit('privateInfo', { title: 'Thất Bại', text: 'Không thể tái phân bố điểm số lúc này.' });
                // Hoàn lại chi phí kỹ năng cho người chơi vì kỹ năng không có tác dụng
                player.score += cost; // 'cost' là biến đã được tính ở đầu hàm handleUseSkill
                player.skillUses--; // Giảm số lần dùng lại
                io.to(roomCode).emit('updatePlayerCards', [{ id: player.id, score: player.score }]);
            }
            
            break;
        case 'CULTIST':
            const effects = ['see_role', 'disable_skill', 'triple_vote'];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const otherPlayers = gs.players.filter(p => p.id !== player.id && !p.isDefeated);
            if (otherPlayers.length > 0) {
                if (randomEffect === 'see_role') {
                    const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                    io.to(player.id).emit('privateInfo', {title: 'Nghi Lễ Hắc Ám', text: `Bạn thấy vai trò của ${randomPlayer.name} là: **${ROLES[randomPlayer.roleId].name}**`});
                } else if (randomEffect === 'disable_skill') {
                    const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                    randomPlayer.isSkillDisabled = true;
                    messageForRoom = `💀 Nghi lễ đã vô hiệu hóa kỹ năng của một người!`;
                } else {
                    player.hasTripleVote = true;
                    messageForRoom = `💀 Nghi lễ đã cường hóa lá phiếu của ${player.name}!`;
                }
            }
            break;
        
    }
    if (messageForRoom) io.to(roomCode).emit('logMessage', { type: 'info', message: messageForRoom });
}

function calculateScoresAndEndRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) {
        console.warn(`[LOGIC-WARN] Cố gắng tính điểm cho phòng không tồn tại: ${roomCode}`);
        return;
    }
    gs.phase = 'reveal';

    const results = { messages: [], roundSummary: [], isDraw: false, winner: null, roundWinners: [] };
    const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) {
        return handlePostRoundEvents(roomCode, rooms, io);
    }

    activePlayers.forEach(p => {
        results.roundSummary.push({
            id: p.id, name: p.name, oldScore: p.score, newScore: 0,
            changes: [], chosenAction: p.chosenAction,
            actionWasNullified: gs.roundData.votesToSkip?.has(p.id) || p.roleId === 'PHANTOM'
        });
    });

    const applyPointChange = (playerId, amount, reason) => {
        const summary = results.roundSummary.find(s => s.id === playerId);
        if (summary && amount !== 0) {
            summary.changes.push({ reason, amount });
        }
    };

    // BƯỚC 1 & 2: THIẾT LẬP TỔ HỢP & ĐẾM PHIẾU CUỐI CÙNG
    const successfulPairs = [];
    (gs.roundData.coordinationVotes || []).forEach(vote => {
        const initiator = activePlayers.find(p => p.id === vote.initiatorId);
        const target = activePlayers.find(p => p.id === vote.targetId);

        if (initiator && target && initiator.chosenAction === target.chosenAction) {
            successfulPairs.push([initiator.id, target.id]);
        } else if (initiator) {
            applyPointChange(initiator.id, -1, 'Phối hợp thất bại');
        }
    });

    const parent = {};
    const find = (i) => {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (i, j) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootJ] = rootI;
    };

    activePlayers.forEach(p => { parent[p.id] = p.id; });
    successfulPairs.forEach(pair => union(pair[0], pair[1]));

    const groups = {};
    activePlayers.forEach(p => {
        const root = find(p.id);
        if (!groups[root]) groups[root] = [];
        groups[root].push(p);
    });

    let finalVotes = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
    for (const rootId in groups) {
        const group = groups[rootId];
        const firstPlayerInGroup = group[0];
        
        const representativeSummary = results.roundSummary.find(s => s.id === firstPlayerInGroup.id);
        if (firstPlayerInGroup.chosenAction && !representativeSummary.actionWasNullified) {
             finalVotes[firstPlayerInGroup.chosenAction]++;
        }
       
        if (group.length > 1) {
            results.messages.push(`👥 Nhóm [${group.map(p => p.name).join(', ')}] đã hành động như một!`);
        }
    }

    // BƯỚC 3: CÔNG BỐ KẾT QUẢ ĐÊM
    const loyalVotes = finalVotes['Giải Mã'];
    const corruptVotes = finalVotes['Phá Hoại'];
    const isPhanXetDaoNguoc = gs.roundData.decrees.some(d => d.id === 'PHAN_XET_DAO_NGUOC');
    const isDraw = (loyalVotes === corruptVotes) || (loyalVotes > 0 && corruptVotes === 0) || (corruptVotes > 0 && loyalVotes === 0);

    if (isDraw) {
        results.isDraw = true;
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả là HÒA!");
    } else {
        const loyalWins = isPhanXetDaoNguoc ? (loyalVotes > corruptVotes) : (loyalVotes < corruptVotes);
        results.winner = loyalWins ? 'Giải Mã' : 'Phá Hoại'; // SỬA LỖI LOGIC NHỎ Ở ĐÂY
        results.roundWinners = activePlayers.filter(p => p.chosenAction === results.winner).map(p => p.id);
        gs.consecutiveDraws = 0;
        results.messages.push(`🏆 Phe **${results.winner}** thắng!`);
    }
    
    // BƯỚC 4: ÁP DỤNG ĐIỂM CƠ BẢN
     if (results.isDraw) {
        const observerCount = finalVotes['Quan Sát'];
        const observerThreshold = Math.floor(activePlayers.length / 2);
        if (observerCount === 0) {
            activePlayers.forEach(p => applyPointChange(p.id, -1, 'Hòa cuộc (không có Quan sát)'));
        } else if (observerCount < observerThreshold) {
            activePlayers.forEach(p => {
                if (p.chosenAction !== 'Quan Sát') applyPointChange(p.id, -1, 'Hòa cuộc (ít Quan sát)');
            });
        } else {
            activePlayers.forEach(p => {
                const amount = p.chosenAction === 'Quan Sát' ? -1 : 1;
                applyPointChange(p.id, amount, 'Hòa cuộc (nhiều Quan sát)');
            });
        }
    } else {
        const loser = results.winner === 'Giải Mã' ? 'Phá Hoại' : 'Giải Mã';
        const observerCount = finalVotes['Quan Sát'];
        const observerThreshold = Math.floor(activePlayers.length / 2);

        activePlayers.forEach(p => {
            if (p.chosenAction === results.winner) {
                applyPointChange(p.id, 2, 'Thuộc phe thắng');
                if (observerCount >= observerThreshold) {
                    applyPointChange(p.id, 1, 'Hưởng lợi từ Quan sát');
                }
            } else if (p.chosenAction === loser) {
                applyPointChange(p.id, -1, 'Thuộc phe thua');
            } else if (p.chosenAction === 'Quan Sát') {
                if (observerCount < observerThreshold) {
                    applyPointChange(p.id, 3, 'Quan sát theo phe thắng');
                } else {
                    applyPointChange(p.id, -1, 'Quan sát quá đông');
                }
            }
        });

        if (observerCount >= observerThreshold) {
            results.messages.push(`👁️ Phe Quan Sát quá đông, họ bị phạt và phe thắng được hưởng lợi!`);
        } else if (observerCount > 0) {
            results.messages.push(`👁️ Phe Quan Sát ít và đã đoán đúng, nhận được nhiều điểm thưởng!`);
        }
    }
	  activePlayers.forEach(p => {
        const rand = Math.random(); // Quay số một lần duy nhất
        if (p.chosenAction === 'Giải Mã') {
            if (rand < 0.10) { // 10% nhận cổ vật
                const artifactPool = Object.values(config.ARTIFACTS).filter(a => a.type === 'Thám Hiểm');
                const foundArtifact = artifactPool[Math.floor(Math.random() * artifactPool.length)];
                p.artifacts.push(foundArtifact); // Thêm vào túi đồ
                io.to(p.id).emit('artifactUpdate', { 
                    artifact: foundArtifact, 
                    message: `Trong lúc giải mã, bạn đã tìm thấy: ${foundArtifact.name}!`
                });
            } else if (rand < 0.40) { // 30% tiếp theo (tổng 40%) nhận 1 điểm
                applyPointChange(p.id, 1, 'May mắn khi Giải Mã');
            }
        } else if (p.chosenAction === 'Phá Hoại') {
             // Logic Phá Hoại mới sẽ cần mục tiêu
             // Tạm thời để logic tìm cổ vật ở đây
             if (rand < 0.10) { // 10% nhận cổ vật
                const artifactPool = Object.values(config.ARTIFACTS).filter(a => a.type === 'Hỗn Loạn');
                const foundArtifact = artifactPool[Math.floor(Math.random() * artifactPool.length)];
                p.artifacts.push(foundArtifact);
                io.to(p.id).emit('artifactUpdate', { 
                    artifact: foundArtifact, 
                    message: `Trong lúc phá hoại, bạn đã nhặt được: ${foundArtifact.name}!`
                });
            }
        }
    });
 // =================================================================================
    // BƯỚC 5: ÁP DỤNG ĐIỂM TỪ KỸ NĂNG, NỘI TẠI & TIẾNG VỌNG
    // =================================================================================

    // --- 5.1: XỬ LÝ CÁC KỸ NĂNG ĐÃ ĐƯỢC KÍCH HOẠT ---
    activePlayers.forEach(player => {
        if (player.skillActive) {
            switch (player.roleId) {
                case 'MAGNATE':
                    const magnateTarget = activePlayers.find(p => p.id === player.skillTargetId);
                    if (magnateTarget && !results.isDraw && magnateTarget.chosenAction === results.winner) {
                        applyPointChange(player.id, 2, 'Kỹ năng Đầu Tư');
                        applyPointChange(magnateTarget.id, 2, 'Được Đầu Tư');
                        results.messages.push(`📈 Nhà Tài Phiệt đã đầu tư thành công vào **${magnateTarget.name}**!`);
                    }
                    break;

                case 'THIEF':
                    const thiefTargetSummary = results.roundSummary.find(s => s.id === player.skillTargetId);
                    if (thiefTargetSummary) {
                        // Chỉ tính điểm CỘNG từ các bước trước
                        const targetGained = thiefTargetSummary.changes
                            .filter(c => c.amount > 0)
                            .reduce((sum, change) => sum + change.amount, 0);
                        
                        if (targetGained > 0) {
                            const stolenAmount = Math.floor(targetGained / 2);
                            if (stolenAmount > 0) {
                                applyPointChange(player.id, stolenAmount, 'Kỹ năng Móc Túi');
                                applyPointChange(thiefTargetSummary.id, -stolenAmount, 'Bị Móc Túi');
                                results.messages.push(`💸 Kẻ Trộm đã móc túi ${stolenAmount} điểm từ **${thiefTargetSummary.name}**!`);
                            }
                        }
                    }
                    break;
                
                case 'GAMBLER':
                    if (player.gamblerBet && !results.isDraw) {
                        if (player.gamblerBet === results.winner) {
                            applyPointChange(player.id, 8, 'Kỹ năng Tất Tay');
                            results.messages.push(`💰 **${player.name}** đã thắng lớn trong canh bạc của mình!`);
                        } else {
                            applyPointChange(player.id, -4, 'Kỹ năng Tất Tay');
                            results.messages.push(`💸 **${player.name}** đã thua trong canh bạc của mình!`);
                        }
                    }
                    break;

                case 'REBEL':
                    if (player.rebelDeclaration && player.rebelPunishTarget) {
                        if (finalVotes[player.rebelDeclaration] === 1 && player.chosenAction === player.rebelDeclaration && !results.roundSummary.find(s=>s.id === player.id).actionWasNullified) {
                            const costPaid = config.SKILL_COSTS[player.skillUses - 1] || config.SKILL_COSTS[config.SKILL_COSTS.length - 1];
                            const punishment = Math.max(1, costPaid);
                            const punishTarget = activePlayers.find(p => p.id === player.rebelPunishTarget);
                            if (punishTarget) {
                                applyPointChange(punishTarget.id, -punishment, 'Bị Khiêu khích');
                                results.messages.push(`📢 Tuyên bố của Kẻ Nổi Loạn **${player.name}** đã thành công! **${punishTarget.name}** bị trừng phạt.`);
                            }
                        }
                    }
                    break;
                
                case 'PHANTOM':
                    const hauntTargetSummary = results.roundSummary.find(s => s.id === player.skillTargetId);
                    if (hauntTargetSummary) {
                        const targetGained = hauntTargetSummary.changes.filter(c => c.amount > 0).reduce((sum, change) => sum + change.amount, 0);
                        if (targetGained > 0) {
                            applyPointChange(hauntTargetSummary.id, -1, 'Bị Ám Quẻ');
                            applyPointChange(player.id, 1, 'Ám Quẻ thành công');
                            player.hauntSuccessCount = (player.hauntSuccessCount || 0) + 1;
                            player.freeHaunt = true;
                            results.messages.push(`👻 **${player.name}** đã ám quẻ thành công **${hauntTargetSummary.name}**!`);
                        }
                    }
                    break;
            }
        }
    });


    // --- 5.2: XỬ LÝ CÁC NỘI TẠI BỊ ĐỘNG & TIẾNG VỌNG ẢNH HƯỞNG ĐIỂM ---
    activePlayers.forEach(player => {
        const summary = results.roundSummary.find(s => s.id === player.id);
        
        switch (player.roleId) {
            case 'PEACEMAKER':
                if (results.isDraw) applyPointChange(player.id, 1, 'Nội tại Hòa Bình');
                break;
            case 'GAMBLER':
                let totalLoss = 0;
                summary.changes.forEach(change => { if (change.amount < 0) totalLoss += change.amount; });
                if (totalLoss < 0) {
                    summary.changes = summary.changes.filter(c => c.amount >= 0); // Xóa các thay đổi âm
                    const newLoss = Math.random() < 0.5 ? Math.floor(totalLoss / 2) : totalLoss * 2;
                    applyPointChange(player.id, newLoss, 'Nội tại Đánh Cược');
                }
                break;
            case 'MAGNATE':
                const currentChangeForMagnate = summary.changes.reduce((sum, c) => sum + c.amount, 0);
                if ((player.score + currentChangeForMagnate) > 0) applyPointChange(player.id, 1, 'Nội tại Tài Phiệt');
                else if ((player.score + currentChangeForMagnate) < 0) applyPointChange(player.id, -1, 'Nội tại Tài Phiệt');
                break;
            case 'THIEF':
                let losersCount = activePlayers.filter(p => results.roundSummary.find(s => s.id === p.id).changes.reduce((sum, c) => sum + c.amount, 0) < 0).length;
                if (losersCount >= 2) applyPointChange(player.id, Math.floor(losersCount / 2), 'Nội tại Kẻ Trộm');
                break;
            case 'MIND_BREAKER':
                if (gs.roundData.failedAccusationsThisRound > 0) applyPointChange(player.id, gs.roundData.failedAccusationsThisRound * 2, 'Nội tại Tẩy Não');
                break;
            case 'CULTIST':
                summary.changes.forEach(change => { if (change.amount < 0) change.amount = Math.min(0, change.amount + 1); });
                break;
            case 'DOUBLE_AGENT':
                if (!results.isDraw && player.chosenAction !== results.winner) applyPointChange(player.id, 1, 'Nội tại Kẻ Hai Mang');
                break;
            case 'PHANTOM':
                applyPointChange(player.id, 1, 'Nội tại Bóng Ma');
                break;
        }
    });
// 5.3: CÁC TIẾNG VỌNG ẢNH HƯỞNG ĐẾN ĐIỂM
    if (gs.roundData.decrees.some(d => d.id === 'CONG_NAP')) {
        const highestPlayer = getPlayersByScore(activePlayers, 'highest')[0];
        const lowestPlayer = getPlayersByScore(activePlayers, 'lowest')[0];
        if (highestPlayer && lowestPlayer && highestPlayer.id !== lowestPlayer.id) {
            applyPointChange(highestPlayer.id, -2, 'Cống Nạp');
            applyPointChange(lowestPlayer.id, 2, 'Nhận Cống Nạp');
        }
    }
    if (gs.roundData.decrees.some(d => d.id === 'LOI_NGUYEN_HI_HA')) {
        const playersFellToNegative = activePlayers.some(p => {
            const summary = results.roundSummary.find(s => s.id === p.id);
            const change = summary.changes.reduce((sum, c) => sum + c.amount, 0);
            return (p.score > 0 && (p.score + change) < 0);
        });
        if (playersFellToNegative) {
            activePlayers.forEach(p => {
                const summary = results.roundSummary.find(s => s.id === p.id);
                const currentChange = summary.changes.reduce((sum, c) => sum + c.amount, 0);
                const finalScore = p.score + currentChange;
                if (finalScore < 0) {
                    // Reset điểm về 0 bằng cách cộng bù lại
                    applyPointChange(p.id, -finalScore, 'Lời Nguyền Hỉ Hả');
                } else if (finalScore > 0) {
                    applyPointChange(p.id, -1, 'Phạt vì "hả hê"');
                }
            });
        }
    }

	 // =================================================================================
    // BƯỚC 6: TỔNG KẾT & ÁP DỤNG CÁC MODIFIER CUỐI CÙNG
    // =================================================================================

    // --- 6.1: Áp dụng Tiếng Vọng thay đổi toàn bộ điểm số ---
    if (gs.roundData.decrees.some(d => d.id === 'VU_NO_HU_VO') && results.isDraw) {
        activePlayers.forEach(p => {
            const summary = results.roundSummary.find(s => s.id === p.id);
            summary.changes = [{ reason: 'Vụ Nổ Hư Vô', amount: -p.score }];
        });
        results.messages.push(`💥 VỤ NỔ HƯ VÔ! Điểm của mọi người đã về 0!`);
    } else if (gs.roundData.decrees.some(d => d.id === 'DEM_SUY_TAN')) {
        activePlayers.forEach(p => {
            const isLoser = !results.isDraw && p.chosenAction !== results.winner;
            if (results.isDraw || isLoser) {
                const summary = results.roundSummary.find(s => s.id === p.id);
                const currentChange = summary.changes.reduce((sum, c) => sum + c.amount, 0);
                const scoreBeforeHalving = p.score + currentChange;
                const loss = Math.floor(scoreBeforeHalving / 2) - scoreBeforeHalving;
                if (loss < 0) {
                    applyPointChange(p.id, loss, 'Đêm Suy Tàn');
                }
            }
        });
        results.messages.push(`📉 ĐÊM SUY TÀN! Những kẻ thất bại đã bị trừng phạt nặng nề!`);
    }

    // --- 6.2: Áp dụng Tiếng Vọng nhân đôi điểm (Luôn là bước cuối cùng trước khi cập nhật) ---
    if (gs.roundData.decrees.some(d => d.id === 'VONG_AM_KHUECH_DAI')) {
        results.roundSummary.forEach(summary => {
            summary.changes.forEach(change => {
                change.amount *= 2;
            });
        });
        results.messages.push(`🔊 VỌNG ÂM KHUẾCH ĐẠI! Mọi điểm số đều được nhân đôi!`);
    }

    // --- 6.3: Cập nhật điểm số cuối cùng vào state ---
    activePlayers.forEach(p => {
        const summary = results.roundSummary.find(s => s.id === p.id);
        const finalTotalChange = summary.changes.reduce((sum, change) => sum + change.amount, 0);
        p.score += finalTotalChange;
        summary.newScore = p.score;
    });

    io.to(roomCode).emit('roundResult', {
        roundNumber: gs.currentRound,
        players: gs.players,
        results,
        finalVoteCounts: finalVotes
    });

    // Kiểm tra kết thúc game
    handlePostRoundEvents(roomCode, rooms, io);
}
module.exports = {
    createGameState, startNewRound, handlePlayerChoice, handleCoordination, revealDecreeAndContinue,
    handleTwilightAction, handleUseSkill, handleAmnesiaAction, handleArenaPick, handleArenaBet,
    handleVoteToSkip, triggerBotPhaseAction, calculateScoresAndEndRound, handlePostRoundEvents, checkRoleVictory,
    resetRoomForRematch, // <-- Thêm hàm mới vào export
};