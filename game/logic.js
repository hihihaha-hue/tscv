// game/logic.js
// ======================================================================
// CORE GAME LOGIC ("The Brain")
// Chứa bộ não của game: tạo trạng thái, xử lý luồng vòng chơi, tính toán, và kiểm tra chiến thắng.
// PHIÊN BẢN ĐÃ SỬA LỖI TÍNH ĐIỂM VÀ NÂNG CẤP AI
// ======================================================================

const config = require('./config.js');
const { ROLES, SKILL_COSTS } = require('./config.js'); // Đảm bảo đã import đầy đủ

// --- CÁC HÀM KHỞI TẠO VÀ TIỆN ÍCH ---
function initializeAssassin(assassin, allPlayers) {
    const potentialTargets = allPlayers.filter(p => p.id !== assassin.id);
    if (potentialTargets.length > 0) {
        assassin.bountyTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
        console.log(`[LOGIC] Sát Thủ ${assassin.name} đã được gán mục tiêu ID: ${assassin.bountyTargetId}`);
    }
}

// Hàm dành riêng cho Kẻ Bắt Chước (ví dụ cho tương lai)
function initializeMimic(mimic, allPlayers) {
    const potentialTargets = allPlayers.filter(p => p.id !== mimic.id && !p.isDefeated);
    if (potentialTargets.length > 0) {
        const targetPlayer = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
        mimic.mimicTargetId = targetPlayer.id;
        // Có thể thêm logic thông báo cho Kẻ Bắt Chước ở đây nếu cần
    }
}const roleInitializers = {
    'ASSASSIN': initializeAssassin,
     'MIMIC': initializeMimic, 
	};
	function initializeSpecialRoles(gs) {
    // Lặp qua tất cả người chơi trong game
    gs.players.forEach(player => {
        // Kiểm tra xem vai trò của người chơi này có trong "bảng chỉ dẫn" của chúng ta không
        if (roleInitializers[player.roleId]) {
            // Nếu có, gọi hàm khởi tạo tương ứng
            // và truyền vào chính người chơi đó cùng danh sách tất cả người chơi
            roleInitializers[player.roleId](player, gs.players);
        }
    });
}
function createGameState(players) {
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
            // --- THÊM CÁC BIẾN THEO DÕI CHO VAI TRÒ ---
            consecutiveSuccessAccusations: 0, // Cho Nhà Tiên Tri
            hauntSuccessCount: 0,           // Cho Bóng Ma
            hasReached7: false,             // Cho Kẻ Đánh Cược
            hasReachedMinus7: false,        // Cho Kẻ Đánh Cược
            loneWolfWins: 0,                // Cho Kẻ Nổi Loạn
            // ------------------------------------------
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
        failedAccusationsThisRound: 0, // Theo dõi cho Kẻ Tẩy Não
    };

    initializeSpecialRoles(gameState);
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
    // [GIA CỐ] Kiểm tra ngay từ đầu
    const gs = rooms[roomCode]?.gameState;
    if (!gs) {
        console.warn(`[LOGIC-WARN] Cố gắng bắt đầu vòng mới cho phòng không tồn tại: ${roomCode}`);
        return;
    }

    console.log(`[LOGIC] Bắt đầu vòng mới. CHOICE_DURATION là: ${config.CHOICE_DURATION}`);

    gs.currentRound++;
    gs.phase = 'exploration';
    gs.roundData = {
        decrees: [],
        coordinationResult: null,
        twilightResult: null,
        votesToSkip: new Set(),
        actedInTwilight: new Set(),
    };
    gs.failedAccusationsThisRound = 0; // Reset mỗi vòng

    gs.players.forEach(p => {
        if (!p.isDefeated) {
            p.chosenAction = null;
            p.isBlessed = false;
            p.blessedById = null;
            p.skillUsedThisRound = false;
            p.skillActive = false;
            p.skillTargetId = null;
            p.isSkillDisabled = false;
            p.hasTripleVote = false;
        }
    });
     const mimic = gs.players.find(p => p.roleId === 'MIMIC' && !p.isDefeated);
    if (mimic) {
        const potentialTargets = gs.players.filter(p => p.id !== mimic.id && !p.isDefeated);
        if (potentialTargets.length > 0) {
            const targetPlayer = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
            mimic.mimicTargetId = targetPlayer.id;
            io.to(mimic.id).emit('privateInfo', {title: "Mô Phỏng", text: `Đêm nay bạn sẽ sao chép hành động của **${targetPlayer.name}**.`});
        }
    }

      io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound,
        players: gs.players,
        duration: config.CHOICE_DURATION
    });

      gs.roundData.choiceTimer = setTimeout(() => {
        // [LÍNH GÁC] Kiểm tra lại sự tồn tại của phòng TRƯỚC KHI thực thi.
        const currentRoom = rooms[roomCode];
        if (!currentRoom || !currentRoom.gameState) {
            console.log(`[LOGIC] Hết giờ nhưng phòng ${roomCode} không còn tồn tại. Hủy bỏ hành động.`);
            return; // Thoát ra một cách an toàn
        }
        
        console.log(`[LOGIC] Hết giờ Giai Đoạn Lựa Chọn cho phòng ${roomCode}.`);

        // Đoạn mã còn lại giờ đây đã an toàn
        currentRoom.gameState.players.forEach(p => {
            if (!p.chosenAction && !p.isDefeated) {
                p.chosenAction = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                io.to(roomCode).emit('playerChose', p.id);
            }
        });
        startCoordinationPhase(roomCode, rooms, io);

    }, config.CHOICE_DURATION * 1000);

    triggerBotChoices(roomCode, rooms, io);
}
function handlePlayerChoice(roomCode, playerId, choice, rooms, io) {
    // [GIA CỐ]
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'exploration') return;
    const player = gs.players.find(p => p.id === playerId);

    if (player && !player.chosenAction && !player.isDefeated) {
        if (player.roleId === 'REBEL' && player.skillActive) {
             io.to(player.id).emit('privateInfo', { type: 'error', message: 'Hành động của Kẻ Nổi Loạn không thể bị thay đổi!' });
             return;
        }
        player.chosenAction = choice;
        io.to(roomCode).emit('playerChose', playerId);

        const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
        if (activePlayers.every(p => p.chosenAction)) {
            clearTimeout(gs.roundData.choiceTimer);
            const mimic = gs.players.find(p => p.roleId === 'MIMIC' && !p.isDefeated && p.mimicTargetId);
            if (mimic) {
                const target = gs.players.find(p => p.id === mimic.mimicTargetId);
                mimic.chosenAction = target?.chosenAction || ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                io.to(roomCode).emit('playerChose', mimic.id);
            }
            startCoordinationPhase(roomCode, rooms, io);
        }
    }
}
function handleVoteToSkip(roomCode, playerId, phase, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || (gs.phase !== 'coordination' && gs.phase !== 'twilight')) return;

    gs.roundData.actedInTwilight.add(playerId); // Dùng chung set để đảm bảo mỗi người chỉ hành động 1 lần
    const voteSet = phase === 'coordination' ? gs.roundData.votesToSkipcoordination : gs.roundData.votesToSkiptwilight;
    if (!voteSet) return; 

    voteSet.add(playerId);
    
    const buttonId = phase === 'coordination' ? 'skip-coordination-btn' : 'skip-twilight-btn';
    io.to(roomCode).emit('updateSkipVoteCount', { 
        buttonId: buttonId,
        count: voteSet.size,
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
    // [LÍNH GÁC] Đây là nơi lỗi đã xảy ra. Thêm kiểm tra an toàn.
    const gs = rooms[roomCode]?.gameState;
    if (!gs) {
        console.warn(`[LOGIC-WARN] Cố gắng bắt đầu Coordination Phase cho phòng không tồn tại: ${roomCode}`);
        return;
    }

    gs.roundData.votesToSkipcoordination = new Set();
    gs.phase = 'coordination';
    if (gs.roundData.decrees.some(d => d.id === 'DEM_TINH_LANG')) {
        // ... (logic hiện có)
        return;
    }
    const DURATION = 15;
    io.to(roomCode).emit('coordinationPhaseStarted', { duration: DURATION });

    // KÍCH HOẠT BOT
    triggerBotPhaseAction(roomCode, rooms, io, 'coordination');

    // [GIA CỐ] Cũng nên bọc callback của timer này
    gs.roundData.coordinationTimer = setTimeout(() => {
        if (!rooms[roomCode]) return; // Kiểm tra an toàn
        console.log(`[LOGIC] Hết giờ Giai Đoạn Phối Hợp.`);
        revealDecreeAndContinue(roomCode, rooms, io);
    }, DURATION * 1000);
}



function handleCoordination(roomCode, initiatorId, targetId, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'coordination' || gs.roundData.coordinationResult || gs.roundData.actedInTwilight.has(initiatorId)) return;

    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target || initiator.id === target.id) return;
    
    // Đánh dấu người chơi này đã hành động
    gs.roundData.actedInTwilight.add(initiator.id);

    // Xử lý kết quả Phối Hợp
    const success = initiator.chosenAction === target.chosenAction && (initiator.chosenAction === 'Giải Mã' || initiator.chosenAction === 'Phá Hoại');
    gs.roundData.coordinationResult = { success };

    if (success) {
        gs.roundData.coordinationResult.actionToReduce = initiator.chosenAction;
        io.to(roomCode).emit('logMessage', { type: 'success', message: `🤝 **${initiator.name}** và **${target.name}** đã Phối Hợp thành công!` });
    } else {
        initiator.score -= 1;
        io.to(roomCode).emit('logMessage', { type: 'error', message: `👎 Phối Hợp giữa **${initiator.name}** và **${target.name}** đã thất bại!` });
        io.to(roomCode).emit('updatePlayerCards', [{ id: initiator.id, score: initiator.score }]);
    }

    // Kết thúc giai đoạn Phối hợp ngay lập tức
    clearTimeout(gs.roundData.coordinationTimer);
    io.to(roomCode).emit('coordinationPhaseEnded');

    // ================================================================
    // --- ĐÂY LÀ DÒNG CẦN SỬA ---
    // Đảm bảo nó gọi `revealDecreeAndContinue` chứ không phải `startTwilightPhase`
    setTimeout(() => {
        revealDecreeAndContinue(roomCode, rooms, io);
    }, 2000); // Chờ 2 giây trước khi sang giai đoạn Tiếng Vọng
    // ================================================================
}


function revealDecreeAndContinue(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    if (gs.currentRound === 1) {
        io.to(roomCode).emit('logMessage', { type: 'info', message: "Đêm đầu tiên yên tĩnh, không có Tiếng Vọng." });
        // Sau đó mới bắt đầu giai đoạn Hoàng Hôn
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
                const allActions = gs.players.filter(p => !p.isDefeated).map(p => p.chosenAction);
                for (let i = allActions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allActions[i], allActions[j]] = [allActions[j], allActions[i]]; }
                gs.players.filter(p => !p.isDefeated).forEach((p, i) => { p.chosenAction = allActions[i]; });
                io.to(roomCode).emit('logMessage', { type: 'warning', message: 'Vũ Điệu Hỗn Loạn! Hành động của mọi người đã bị xáo trộn!' });
                break;
            case 'AO_GIAC_DICH_CHUYEN':
                const activePlayers = gs.players.filter(p => !p.isDefeated);
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
        setTimeout(() => startTwilightPhase(roomCode, rooms, io), DECREE_REVEAL_DELAY);
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

    io.to(roomCode).emit('twilightPhaseStarted', { duration: config.CHAOS_DURATION });

    gs.roundData.twilightTimer = setTimeout(() => {
        console.log(`[LOGIC] Hết giờ Giai Đoạn Hoàng Hôn.`);
        endTwilightPhase("Hết giờ cho giai đoạn Hoàng Hôn.", roomCode, rooms, io);
    }, config.CHAOS_DURATION * 1000);
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
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'twilight') return;

    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target || initiator.id === target.id) return;
    
    gs.roundData.actedInTwilight.add(initiator.id);

    if (actionType === 'Vạch Trần') {
        const success = (guess === target.chosenAction);
        
        if (success) {
            initiator.score += 2;
            target.score -= 2;
            initiator.consecutiveSuccessAccusations = (initiator.consecutiveSuccessAccusations || 0) + 1;

            // Nội tại Kẻ Phán Xử
            if (initiator.roleId === 'INQUISITOR' && target.chosenAction === 'Phá Hoại') {
                initiator.score += 1;
            }
			const assassin = gs.players.find(p => p.roleId === 'ASSASSIN' && !p.isDefeated);
            // Nếu mục tiêu bị vạch trần ĐÚNG LÀ mục tiêu của Sát Thủ
            if (assassin && assassin.bountyTargetId === target.id) {
                if (initiator.id === assassin.id) {
                    // 1. Nếu chính Sát Thủ vạch trần, mục tiêu bị chia đôi điểm
                    target.score = Math.floor(target.score / 2);
                    io.to(roomCode).emit('logMessage', { type: 'warning', message: `💥 **${assassin.name}** đã hoàn thành hợp đồng, điểm của **${target.name}** bị chia đôi!` });
                } else {
                    // 2. Nếu người khác vạch trần, mục tiêu bị mất gấp đôi điểm (thêm -2 nữa)
                    target.score -= 2;
                    io.to(roomCode).emit('logMessage', { type: 'error', message: `🎯 **${target.name}** là mục tiêu bị săn đuổi và phải chịu hình phạt nặng hơn!` });
                }
            }
        } else {
            initiator.score -= (initiator.roleId === 'PROPHET') ? 1 : 2;
            target.score += 1;
            initiator.consecutiveSuccessAccusations = 0; // Reset chuỗi thắng
            gs.failedAccusationsThisRound++; // Tăng biến đếm cho Kẻ Tẩy Não
        }
        
        io.to(roomCode).emit('logMessage', { type: success ? 'success' : 'error', message: `🔥 **${initiator.name}** đã Vạch Trần **${target.name}** và phán đoán **${success ? "ĐÚNG" : "SAI"}**!` });
        io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({ id: p.id, score: p.score })));
    }
    
    const activePlayersCount = gs.players.filter(p => !p.isDefeated && !p.disconnected).length;
    if (gs.roundData.actedInTwilight.size >= activePlayersCount) {
        endTwilightPhase("Tất cả Thợ Săn đã quyết định hành động trong hoàng hôn.", roomCode, rooms, io);
    }
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

    // --- KHỞI TẠO ---
    // Khởi tạo bảng tóm tắt cho tất cả người chơi
    activePlayers.forEach(p => {
        results.roundSummary.push({
            id: p.id, name: p.name, oldScore: p.score, newScore: 0,
            changes: [], chosenAction: p.chosenAction,
            actionWasNullified: gs.roundData.votesToSkip?.has(p.id) || p.roleId === 'PHANTOM'
        });
    });

    // Khai báo hàm trợ giúp DUY NHẤT MỘT LẦN ở đầu hàm
    const applyPointChange = (playerId, amount, reason) => {
        const summary = results.roundSummary.find(s => s.id === playerId);
        if (summary && amount !== 0) {
            summary.changes.push({ reason, amount });
        }
    };

    // --- BƯỚC 1: TÍNH TOÁN & THAO TÚNG PHIẾU BẦU ---
    let votes = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
    activePlayers.forEach(p => {
        const summary = results.roundSummary.find(s => s.id === p.id);
        if (p.chosenAction && !summary.actionWasNullified) {
            votes[p.chosenAction] += p.hasTripleVote ? 3 : 1;
        }
    });

    // Áp dụng kỹ năng ảnh hưởng đến phiếu bầu (Kẻ Hai Mang)
    const doubleAgent = activePlayers.find(p => p.roleId === 'DOUBLE_AGENT' && p.skillActive);
    if (doubleAgent) {
        const observerVotes = votes['Quan Sát'];
        if (observerVotes > 0) {
            const oppositeFaction = doubleAgent.chosenAction === 'Giải Mã' ? 'Phá Hoại' : 'Giải Mã';
            votes[oppositeFaction] += observerVotes;
            votes['Quan Sát'] = 0;
            results.messages.push(`🎭 Kẻ Hai Mang đã xuyên tạc, ${observerVotes} phiếu Quan Sát đã bị chuyển sang phe ${oppositeFaction}!`);
        }
    }

    // Giảm phiếu từ Phối Hợp thành công
    if (gs.roundData.coordinationResult?.success) {
        const action = gs.roundData.coordinationResult.actionToReduce;
        if (votes[action] > 0) {
            votes[action]--;
            results.messages.push(`🤝 Phối Hợp thành công đã loại bỏ 1 phiếu ${action}!`);
        }
    }

    // --- BƯỚC 2: XÁC ĐỊNH KẾT QUẢ VÒNG ĐẤU ---
    const loyalVotes = votes['Giải Mã'];
    const corruptVotes = votes['Phá Hoại'];
    const observerCount = votes['Quan Sát'];
    const isDrawCondition = (loyalVotes === corruptVotes) || (loyalVotes > 0 && corruptVotes === 0) || (corruptVotes > 0 && loyalVotes === 0);

    if (isDrawCondition) {
        results.isDraw = true;
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả là HÒA!");
    } else {
        results.winner = loyalVotes < corruptVotes ? 'Giải Mã' : 'Phá Hoại';
        results.roundWinners = activePlayers.filter(p => p.chosenAction === results.winner).map(p => p.id);
        gs.consecutiveDraws = 0;
        results.messages.push(`🏆 Phe **${results.winner}** thắng!`);
    }

    // --- BƯỚC 3: ÁP DỤNG ĐIỂM CƠ BẢN ---
    activePlayers.forEach(p => {
        if (results.isDraw) {
            // Logic khi HÒA
            const amount = p.chosenAction === 'Quan Sát' ? -1 : 1;
            applyPointChange(p.id, amount, 'Hòa có Quan sát');
        } else {
            // Logic khi có phe THẮNG/THUA
            const loser = results.winner === 'Giải Mã' ? 'Phá Hoại' : 'Giải Mã';
            if (p.chosenAction === results.winner) {
                applyPointChange(p.id, 2, 'Thuộc phe thắng');
            } else if (p.chosenAction === loser) {
                applyPointChange(p.id, -1, 'Thuộc phe thua');
            } else if (p.chosenAction === 'Quan Sát') {
                const observerThreshold = Math.floor(activePlayers.length / 2);
                const amount = observerCount < observerThreshold ? 3 : -1;
                const reason = observerCount < observerThreshold ? 'Quan sát theo phe thắng' : 'Quan sát quá đông';
                applyPointChange(p.id, amount, reason);
            }
        }
    });

    // --- BƯỚC 4: ÁP DỤNG KỸ NĂNG ẢNH HƯỞNG ĐẾN ĐIỂM SỐ ---
    activePlayers.forEach(player => {
        if (player.skillActive) {
            switch (player.roleId) {
                case 'MAGNATE':
                    const magnateTarget = activePlayers.find(p => p.id === player.skillTargetId);
                    if (magnateTarget && !results.isDraw && magnateTarget.chosenAction === results.winner) {
                        applyPointChange(player.id, 2, 'Đầu tư thành công');
                        applyPointChange(magnateTarget.id, 2, 'Được đầu tư');
                        results.messages.push(`📈 Nhà Tài Phiệt đã đầu tư thành công vào **${magnateTarget.name}**!`);
                    }
                    break;
                case 'THIEF':
                    const thiefTargetSummary = results.roundSummary.find(s => s.id === player.skillTargetId);
                    if (thiefTargetSummary) {
                        const targetGained = thiefTargetSummary.changes.reduce((sum, change) => sum + change.amount, 0);
                        if (targetGained > 0) {
                            const stolenAmount = Math.floor(targetGained / 2);
                            if (stolenAmount > 0) {
                                applyPointChange(player.id, stolenAmount, 'Móc túi');
                                applyPointChange(thiefTargetSummary.id, -stolenAmount, 'Bị móc túi');
                                results.messages.push(`💸 Kẻ Trộm đã móc túi ${stolenAmount} điểm từ **${thiefTargetSummary.name}**!`);
                            }
                        }
                    }
                    break;
                case 'GAMBLER':
                    if (player.gamblerBet && !results.isDraw) {
                        if (player.gamblerBet === results.winner) {
                            applyPointChange(player.id, 8, 'Tất tay thành công');
                            results.messages.push(`💰 **${player.name}** đã thắng lớn trong canh bạc của mình!`);
                        } else {
                            applyPointChange(player.id, -4, 'Tất tay thất bại');
                            results.messages.push(`💸 **${player.name}** đã thua trong canh bạc của mình!`);
                        }
                    }
                    break;
                case 'REBEL':
                    if (player.rebelDeclaration && player.rebelPunishTarget) {
                        if (votes[player.rebelDeclaration] === 1 && player.chosenAction === player.rebelDeclaration) {
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
            }
        }
    });

    // --- BƯỚC 5: TỔNG KẾT, ÁP DỤNG NỘI TẠI & CẬP NHẬT ĐIỂM ---
    activePlayers.forEach(p => {
        const summary = results.roundSummary.find(s => s.id === p.id);
        let currentTotalChange = summary.changes.reduce((sum, change) => sum + change.amount, 0);

        // Áp dụng các hiệu ứng nội tại cuối cùng
        if (p.roleId === 'MAGNATE') {
            if (p.score + currentTotalChange > 0) applyPointChange(p.id, 1, 'Nội tại Nhà Tài Phiệt');
            else if (p.score + currentTotalChange < 0) applyPointChange(p.id, -1, 'Nội tại Nhà Tài Phiệt');
        } else if (p.roleId === 'DOUBLE_AGENT' && !results.isDraw && p.chosenAction !== results.winner) {
            applyPointChange(p.id, 1, 'Nội tại Kẻ Hai Mang');
        }

        // Tính lại tổng điểm thay đổi lần cuối
        const finalTotalChange = summary.changes.reduce((sum, change) => sum + change.amount, 0);
        
        // Cập nhật điểm
        p.score += finalTotalChange;
        summary.newScore = p.score;
    });

    // --- BƯỚC 6: GỬI KẾT QUẢ & KIỂM TRA KẾT THÚC GAME ---
    io.to(roomCode).emit('roundResult', {
        roundNumber: gs.currentRound,
        players: gs.players,
        results,
        finalVoteCounts: votes
    });

    handlePostRoundEvents(roomCode, rooms, io);
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
    let targetPlayer;

    switch (player.roleId) {
        case 'PROPHET':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer) {
                io.to(player.id).emit('privateInfo', { title: 'Thiên Lý Nhãn', text: `Hành động của ${targetPlayer.name} là: **${targetPlayer.chosenAction || 'Chưa chọn'}**.` });
            }
            break;
        case 'PEACEMAKER':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer) {
                gs.roundData.votesToSkip.add(targetPlayer.id);
                messageForRoom = `☮️ ${player.name} đã can thiệp, phiếu của ${targetPlayer.name} sẽ không được tính.`;
            }
            break;
        case 'PRIEST':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer) {
                targetPlayer.isBlessed = true;
                targetPlayer.blessedById = player.id;
                messageForRoom = `🙏 Một phước lành đã được ban xuống cho ${targetPlayer.name}...`;
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
        case 'INQUISITOR':
            const sabotageCount = gs.players.filter(p => !p.isDefeated && p.chosenAction === 'Phá Hoại').length;
            if (sabotageCount > 0) {
                gs.players.forEach(p => { if (p.chosenAction === 'Phá Hoại') p.score -= sabotageCount; });
                messageForRoom = `⚖️ **${player.name}** thực thi PHÁN QUYẾT! ${sabotageCount} kẻ Phá Hoại đã bị trừng phạt!`;
                io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({ id: p.id, score: p.score })));
            }
            break;
        case 'BALANCER':
             const highestPlayers = getPlayersByScore(gs.players.filter(p=>!p.isDefeated), 'highest');
             const lowestPlayers = getPlayersByScore(gs.players.filter(p=>!p.isDefeated), 'lowest');
             if (highestPlayers.length > 0 && lowestPlayers.length > 0 && highestPlayers[0].id !== lowestPlayers[0].id) {
                 const avg = Math.round((highestPlayers[0].score + lowestPlayers[0].score) / 2);
                 highestPlayers[0].score = avg;
                 lowestPlayers[0].score = avg;
                 messageForRoom = `📈📉 ${player.name} đã tái phân bố lại điểm số!`;
                 io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({id: p.id, score: p.score})));
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
        case 'GAMBLER':
            player.skillActive = true;
            player.gamblerBet = payload.chosenFaction; // Lưu lại lựa chọn cược
            messageForRoom = `💰 ${player.name} đã đặt cược tất tay!`;
            break;
        case 'MAGNATE':
 case 'REBEL':
            player.skillActive = true;
            player.rebelDeclaration = payload.declaredAction; // Lưu tuyên bố
            player.rebelPunishTarget = payload.punishTargetId; // Lưu mục tiêu trừng phạt
            messageForRoom = `📢 ${player.name} đã đưa ra một lời tuyên bố thách thức!`;
            break;
        case 'THIEF':
        case 'DOUBLE_AGENT':
        case 'PHANTOM':
            player.skillActive = true;
            player.skillTargetId = payload.targetId;
            messageForRoom = `✨ ${player.name} đã kích hoạt một năng lực đặc biệt...`;
            break;
    }
    if (messageForRoom) io.to(roomCode).emit('logMessage', { type: 'info', message: messageForRoom });
}


module.exports = {
    createGameState,
    startNewRound,
    handlePlayerChoice,
    handleCoordination,
    revealDecreeAndContinue,
    handleTwilightAction,
    handleUseSkill,
    handleAmnesiaAction,
    handleArenaPick,
    handleArenaBet,
    handleVoteToSkip,
    triggerBotPhaseAction,
};