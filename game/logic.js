// game/logic.js
// ======================================================================
// CORE GAME LOGIC ("The Brain")
// Phiên bản đã được tinh gọn và tối ưu hóa.
// ======================================================================

const config = require('./config.js');
const { ROLES, DECREES, SKILL_COSTS, GAME_CONSTANTS, ARTIFACTS } = config;
const User = require('./models/User');

// Đối tượng chứa logic ra quyết định cho các Bot
const BotAI = {
    makeDecision(bot, gs, phase, rooms, io) {
        if (bot.isDefeated || (phase === 'twilight' && gs.roundData.actedInTwilight.has(bot.id))) {
            return;
        }

        const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
        const nonBotPlayers = activePlayers.filter(p => !p.isBot);
        const leaders = getPlayersByScore(nonBotPlayers, 'highest');
        const laggards = getPlayersByScore(nonBotPlayers, 'lowest');
        const myRole = ROLES[bot.roleId];

        // 1. QUYẾT ĐỊNH DÙNG KỸ NĂNG (một lần mỗi vòng)
        if (!bot.skillUsedThisRound && myRole.hasActiveSkill) {
            let cost = SKILL_COSTS[bot.skillUses] ?? SKILL_COSTS[SKILL_COSTS.length - 1];
            if (bot.score >= cost) {
                let useSkillChance = 0.3; 
                let payload = {};
                let target = null;

                switch (bot.roleId) {
                    case 'CULTIST': // Kẻ Hiến Tế muốn mất điểm, nên sẽ dùng skill liên tục
                        useSkillChance = 0.9;
                        break;
                    case 'INQUISITOR': // Kẻ Phán Xử dùng skill nếu có nhiều kẻ tình nghi
                        if (activePlayers.length > 4) useSkillChance = 0.6;
                        break;
                    case 'MAGNATE': // Nhà Tài Phiệt đầu tư vào người mạnh nhất
                        target = leaders[0];
                        if (target) {
                            payload.targetId = target.id;
                            useSkillChance = 0.7;
                        }
                        break;
                    case 'PRIEST': // Thầy Tế bảo vệ người yếu thế nhất
                        target = laggards[0];
                        if (target) {
                            payload.targetId = target.id;
                            useSkillChance = 0.5;
                        }
                        break;
						 case 'REBEL':
                        // Kẻ Nổi Loạn có mục tiêu thắng riêng nên rất muốn dùng kỹ năng.
                        useSkillChance = 0.8; 
                        
                        // AI Kẻ Nổi Loạn sẽ luôn tuyên bố hành động gây rối nhất là "Phá Hoại".
                        payload.declaredAction = 'Phá Hoại'; 
                        
                        // Và sẽ nhắm vào người chơi (không phải Bot) đang có điểm cao nhất.
                        target = leaders[0]; 
                        if (target) {
                            payload.punishTargetId = target.id;
                        } else {
                            // Nếu không có mục tiêu hợp lệ, không dùng kỹ năng.
                            useSkillChance = 0; 
                        }
                        break;
                }

                if (Math.random() < useSkillChance) {
                    // Tạo một socket giả để truyền vào hàm handleUseSkill
                    const fakeSocket = { id: bot.id };
                    // Bây giờ, payload đã chứa đầy đủ thông tin cần thiết cho Kẻ Nổi Loạn
                    handleUseSkill(fakeSocket, gs.roomCode, payload, rooms, io);
                    return; // Dừng lại sau khi dùng skill để tránh hành động 2 lần
                }
            }
        }
        
        // 2. QUYẾT ĐỊNH HÀNH ĐỘNG THEO GIAI ĐOẠN
        switch (phase) {
            case 'exploration':
                this.decideExplorationAction(bot, gs, nonBotPlayers, leaders, laggards, rooms, io);
                break;
            case 'coordination':
            case 'twilight':
                this.decideTwilightOrCoordinationAction(bot, gs, phase, nonBotPlayers, leaders, laggards, rooms, io);
                break;
        }
    },

    decideExplorationAction(bot, gs, nonBotPlayers, leaders, laggards, rooms, io) {
        let choice = 'Quan Sát';
        let payload = {};
        let target = null;
        
        switch (bot.roleId) {
            case 'INQUISITOR':
            case 'PEACEMAKER':
            case 'MAGNATE':
                choice = 'Giải Mã';
                break;
            case 'CULTIST':
            case 'REBEL':
                choice = 'Phá Hoại';
                target = leaders[0] || nonBotPlayers[0];
                if (target) payload.targetId = target.id;
                break;
            default:
                if (bot.score < 5) {
                    choice = 'Giải Mã';
                } else {
                    choice = (Math.random() < 0.6) ? 'Giải Mã' : 'Phá Hoại';
                    if (choice === 'Phá Hoại') {
                        target = leaders[0] || nonBotPlayers[0];
                        if (target) payload.targetId = target.id;
                    }
                }
                break;
        }
        
        if (choice === 'Phá Hoại' && !payload.targetId) {
            choice = 'Quan Sát';
        }

        handlePlayerChoice(gs.roomCode, bot.id, choice, rooms, io, payload);
    },

    decideTwilightOrCoordinationAction(bot, gs, phase, nonBotPlayers, leaders, laggards, rooms, io) {
        if (Math.random() > 0.8 || nonBotPlayers.length === 0) {
            handleVoteToSkip(gs.roomCode, bot.id, phase, rooms, io);
            return;
        }

        let target = laggards[0] || nonBotPlayers[Math.floor(Math.random() * nonBotPlayers.length)];
        if (!target) {
             handleVoteToSkip(gs.roomCode, bot.id, phase, rooms, io);
             return;
        }

        if (phase === 'coordination') {
            handleCoordination(gs.roomCode, bot.id, target.id, rooms, io);
        } else if (phase === 'twilight') {
            let guess = 'Giải Mã';
            switch (bot.roleId) {
                case 'INQUISITOR':
                    guess = 'Phá Hoại';
                    break;
                case 'CULTIST':
                    guess = 'Phá Hoại'; 
                    break;
                default:
                    if (target.score < 0) {
                        guess = 'Giải Mã';
                    } else {
                        guess = (Math.random() < 0.5) ? 'Giải Mã' : 'Phá Hoại';
                    }
                    break;
            }
            io.to(gs.roomCode).emit('playerAccused', { initiatorId: bot.id, targetId: target.id });
           io.to(gs.roomCode).emit('logMessage', { type: 'info', message: `🔥 Một người chơi đã Vạch Trần người khác!` });
            handleTwilightAction(gs.roomCode, bot.id, target.id, 'Vạch Trần', guess, rooms, io);
        }
    }
};

// --- HÀM CHO CHỨC NĂNG CHƠI LẠI ---
function resetRoomForRematch(room) {
    if (!room) return;
	 if (room.gameState) {
        room.players = room.gameState.players.filter(p => !p.disconnected);
    }
    room.gameState = null;
    room.players.forEach(player => {
        if (!player.isBot) {
            player.isReady = false;
        }
        delete player.score;
        delete player.chosenAction;
        delete player.roleId;
        delete player.artifacts;
        delete player.sabotageTargetId;
    });
    console.log(`[Rematch] Đã reset phòng.`);
}

// --- HÀM LOGIC CỔ VẬT ---
function handleFindArtifact(player, type, gs, io) {
    const availableArtifacts = Object.values(ARTIFACTS).filter(a =>
        a.type === type && gs.artifactPool.includes(a.id)
    );
    if (availableArtifacts.length === 0) return;

    const foundArtifact = availableArtifacts[Math.floor(Math.random() * availableArtifacts.length)];
    gs.artifactPool = gs.artifactPool.filter(id => id !== foundArtifact.id); 

    if (player.artifacts.length === 0) {
        player.artifacts.push(foundArtifact);
        io.to(player.id).emit('artifactUpdate', {
            artifacts: player.artifacts,
            message: `Bạn đã tìm thấy: ${foundArtifact.name}!`
        });
        io.to(player.id).emit('logMessage', {type: 'success', message: `Bạn đã tìm thấy: <b>${foundArtifact.name}</b>!`});
    } else {
        const currentArtifact = player.artifacts[0];
        io.to(player.id).emit('promptArtifactChoice', {
            currentArtifact: currentArtifact,
            newArtifact: foundArtifact
        });
    }
}

function handleArtifactDecision(roomCode, playerId, decision, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === playerId);
    if (!player) return;

    const newArtifact = ARTIFACTS[decision.newArtifactId];

    if (decision.choice === 'take_new') {
        const oldArtifactId = player.artifacts[0].id;
        gs.artifactPool.push(oldArtifactId);
        player.artifacts = [newArtifact];
        io.to(player.id).emit('logMessage', {type: 'success', message: `Bạn đã nhận <b>${newArtifact.name}</b> và trả lại <b>${ARTIFACTS[oldArtifactId].name}</b>.`});
    } else {
        gs.artifactPool.push(newArtifact.id);
        io.to(player.id).emit('logMessage', {type: 'info', message: `Bạn đã quyết định giữ lại <b>${player.artifacts[0].name}</b>.`});
    }
    io.to(player.id).emit('artifactUpdate', { artifacts: player.artifacts });
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

// [SỬA LỖI & NÂNG CẤP] Kẻ Bắt Chước giờ sẽ biết vai trò của mục tiêu
function initializeMimic(mimic, allPlayers, io) {
    const potentialTargets = allPlayers.filter(p => 
        p.id !== mimic.id && 
        !p.disconnected && 
        p.roleId !== 'MIMIC'
    );

    if (potentialTargets.length > 0) {
        const targetPlayer = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
        mimic.mimicTargetId = targetPlayer.id;
        const targetRole = ROLES[targetPlayer.roleId];
        
        mimic.canMimicSkill = targetRole.hasActiveSkill;

        io.to(mimic.id).emit('privateInfo', {
            title: "Sao Chép", 
            text: `Đêm nay bạn sẽ sao chép hành động của **${targetPlayer.name}**. ` + 
                  (targetRole.hasActiveSkill ? `Bạn có thể dùng ké kỹ năng của họ.` : `Họ không có kỹ năng kích hoạt để bạn dùng ké.`)
        });

        const updatedRoleData = { 
            ...ROLES[mimic.roleId], 
            id: mimic.roleId,
            canMimicSkill: mimic.canMimicSkill,
            currentSkillCost: SKILL_COSTS[mimic.skillUses] ?? SKILL_COSTS[SKILL_COSTS.length - 1]
        };
        io.to(mimic.id).emit('yourRoleIs', updatedRoleData);
     
    } else {
        mimic.mimicTargetId = null;
        mimic.canMimicSkill = false;
         io.to(mimic.id).emit('privateInfo', {
            title: "Lỗi Sao Chép", 
            text: `Không còn mục tiêu hợp lệ để bạn sao chép. Bạn sẽ không hành động.`
        });
    }
}

const roleInitializers = { 'ASSASSIN': initializeAssassin };

function initializeSpecialRoles(gs, io) {
    gs.players.forEach(player => {
        if (roleInitializers[player.roleId]) {
            roleInitializers[player.roleId](player, gs.players, io);
        }
    });
}
function createGameState(players, io, settings = {}) {
    console.log('[GameState] Đang tạo ván đấu mới với các cài đặt:', settings);

    // --- BƯỚC 1: THIẾT LẬP CÁC THAM SỐ CƠ BẢN CỦA GAME ---
    // Tích hợp các tùy chỉnh của Host hoặc sử dụng giá trị mặc định.

    const numPlayers = players.length;

    // Sử dụng điểm thắng từ settings, nếu không có thì tính theo số người chơi.
    // Việc giới hạn (clamp) điểm số giúp tránh các giá trị bất thường.
    const winScore = settings.winScore 
        ? Math.max(5, Math.min(50, settings.winScore)) 
        : (numPlayers <= 4 ? 15 : (numPlayers <= 8 ? 20 : 25));
    
    const loseScore = -winScore;

    // Lấy danh sách các vai trò và tiếng vọng bị cấm từ settings.
    const bannedRoles = settings.bannedRoles || [];
    const bannedDecrees = settings.bannedDecrees || [];
    
    // --- BƯỚC 2: GÁN VAI TRÒ ĐỘC NHẤT (ĐÃ LỌC CÁC VAI TRÒ BỊ CẤM) ---
    // Đây là phần cốt lõi của tính năng "Cấm Vai Trò".

    // 1. Lọc ra danh sách các vai trò có thể sử dụng.
    const availableRoles = config.ALL_ROLE_IDS.filter(id => !bannedRoles.includes(id));

    // 2. Kiểm tra một trường hợp đặc biệt: Nếu Host cấm quá nhiều vai trò.
    if (availableRoles.length < numPlayers) {
        console.error(`[GameState Error] Không đủ vai trò để chia! Cần ${numPlayers} nhưng chỉ có ${availableRoles.length} sau khi lọc.`);
        // Trong một môi trường production, bạn nên gửi lỗi về cho client.
        // Ở đây, chúng ta sẽ tiếp tục nhưng có thể sẽ gây lỗi.
    }

    // 3. Xáo trộn danh sách vai trò khả dụng bằng thuật toán Fisher-Yates.
    for (let i = availableRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableRoles[i], availableRoles[j]] = [availableRoles[j], availableRoles[i]];
    }

    // 4. Lấy đúng số lượng vai trò cần thiết từ đầu danh sách đã xáo trộn.
    const rolesInThisGame = availableRoles.slice(0, numPlayers);
    
    // --- BƯỚC 3: KHỞI TẠO ĐỐI TƯỢNG GAMESTATE HOÀN CHỈNH ---
    // Đây là "Single Source of Truth" cho toàn bộ ván đấu.

    const gameState = {
        players: players.map((p, index) => ({
            ...p,
          score: 0,
            roleId: rolesInThisGame[index], // Gán vai trò đã được xáo trộn và lọc
            artifacts: [],
            
            // Trạng thái theo dõi tiến trình dài hạn (cho điều kiện thắng riêng)
            skillUses: 0,
            consecutiveSuccessAccusations: 0, // cho Prophet
            hauntSuccessCount: 0,              // cho Phantom
            hasReached7: false,                // cho Gambler
            hasReachedMinus7: false,           // cho Gambler
            loneWolfWins: 0,                   // cho Rebel
            bountyTargetId: null,              // cho Assassin
            mimicTargetId: null,               // cho Mimic
            canMimicSkill: false,              // cho Mimic
            
            // Trạng thái tạm thời, được reset mỗi vòng
            chosenAction: null,
            sabotageTargetId: null,
            isBlessed: false,                  // bởi Priest
            skillUsedThisRound: false,
            isSkillDisabled: false,
            hasTripleVote: false,              // bởi Cultist
            
            // Đảm bảo các thuộc tính kết nối được khởi tạo
            disconnected: p.disconnected || false,
            disconnectTime: p.disconnectTime || null,
        })),
      currentRound: 0,
        winScore,       // Điểm thắng đã được tùy chỉnh
        loseScore,      // Điểm thua tương ứng
        phase: 'waiting', // Trạng thái ban đầu
        roundData: {},    // Dữ liệu tạm thời của mỗi vòng
        
        // Các bộ bài và cài đặt
        decreeDeck: [],   // Sẽ được khởi tạo ở bước 4
        decreeDiscard: [],
        artifactPool: [...config.ALL_ARTIFACT_IDS], // Bể cổ vật chung
        rolesInGame: rolesInThisGame, // Lưu lại các vai trò có trong game này
        settings: settings, // Lưu lại các cài đặt đã được sử dụng cho ván đấu
        
        // Các biến theo dõi khác
        consecutiveDraws: 0, // cho Peacemaker
        nextDecreeChooser: null, // cho Di Sản Kẻ Tiên Phong
        failedAccusationsThisRound: 0, // cho Mind Breaker
    };

    // --- BƯỚC 4: KHỞI TẠO CÁC BỘ BÀI VÀ VAI TRÒ ĐẶC BIỆT ---
    
    // 1. Khởi tạo bộ bài Tiếng Vọng, lọc các lá bị cấm và xáo trộn.
    const availableDecrees = config.ALL_DECREE_IDS.filter(id => !bannedDecrees.includes(id));
    for (let i = availableDecrees.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableDecrees[i], availableDecrees[j]] = [availableDecrees[j], availableDecrees[i]];
    }
    gameState.decreeDeck = availableDecrees;
    
    // 2. Gọi các hàm khởi tạo cho những vai trò cần thiết lập ban đầu (VD: Assassin, Mimic).
    // Hàm này sẽ duyệt qua người chơi và gọi hàm khởi tạo tương ứng với vai trò của họ.
    initializeSpecialRoles(gameState, io);

    console.log('[GameState] Tạo GameState thành công.');
    
    // --- BƯỚC 5: TRẢ VỀ ĐỐI TƯỢNG GAMESTATE HOÀN CHỈNH ---
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
      gs.roundData = { decrees: [], coordinationVotes: [], actedInTwilight: new Set(), failedAccusationsThisRound: 0, linkedPlayers: [] };
	   const RECONNECT_WINDOW_MS = 120000; // 2 phút
    gs.players.forEach(p => {
        if (p.disconnected && (Date.now() - p.disconnectTime > RECONNECT_WINDOW_MS)) {
            if (!p.isDefeated) {
                p.isDefeated = true; // Đánh dấu là đã thua
                io.to(roomCode).emit('logMessage', { type: 'error', message: `${p.name} đã ngắt kết nối quá lâu và bị loại.` });
            }
        }
    });

    // [SỬA LỖI] Kẻ Bắt Chước chỉ được khởi tạo một lần ở đầu mỗi vòng mới
    const mimic = gs.players.find(p => p.roleId === 'MIMIC' && !p.isDefeated);
    if (mimic) { initializeMimic(mimic, gs.players, io); }

    io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound, players: gs.players, duration: GAME_CONSTANTS.CHOICE_DURATION
    });
    gs.roundData.choiceTimer = setTimeout(() => {
        const currentRoom = rooms[roomCode];
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameState.phase !== 'exploration') return;
         const activePlayers = currentRoom.gameState.players.filter(p => !p.isDefeated); // Lấy cả người disconnected
        
        activePlayers.forEach(p => {
            // Nếu người chơi chưa chọn hành động (bao gồm cả người đang ngắt kết nối)
            if (!p.chosenAction) {
                // Chọn một trong 3 hành động một cách ngẫu nhiên
                const choice = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                let payload = {};
                if (choice === 'Phá Hoại') {
                    // Chọn một mục tiêu ngẫu nhiên còn sống và không phải chính mình
                    const potentialTargets = activePlayers.filter(t => t.id !== p.id && !t.isDefeated);
                    if (potentialTargets.length > 0) {
                        payload.targetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
                    }
                }
                // Gọi hàm xử lý hành động cho người chơi này
                handlePlayerChoice(roomCode, p.id, choice, rooms, io, payload);
            }
        });
    }, GAME_CONSTANTS.CHOICE_DURATION * 1000);

    triggerBotChoices(roomCode, rooms, io);
}

function handlePlayerChoice(roomCode, playerId, choice, rooms, io, payload = {}) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'exploration') return;
    const player = gs.players.find(p => p.id === playerId);

    if (player && !player.chosenAction && !player.isDefeated) {
        player.chosenAction = choice;
        if (choice === 'Phá Hoại' && payload.targetId) {
            player.sabotageTargetId = payload.targetId;
        }
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

    // === BẮT ĐẦU DÒNG KIỂM TRA MỚI ===
    // Áp dụng kiểm tra tương tự cho hành động skip/rest
    if (gs.roundData.actedInTwilight.has(playerId)) {
        return;
    }

    gs.roundData.actedInTwilight.add(playerId);

    if (phase === 'coordination') {
        if (!gs.roundData.votesToSkipcoordination) gs.roundData.votesToSkipcoordination = new Set();
        gs.roundData.votesToSkipcoordination.add(playerId);
    } else {
        if (!gs.roundData.votesToSkiptwilight) gs.roundData.votesToSkiptwilight = new Set();
        gs.roundData.votesToSkiptwilight.add(playerId);
    }
    
    const buttonId = phase === 'coordination' ? 'skip-coordination-btn' : 'twilight-rest-btn';
    const voteSet = phase === 'coordination' ? gs.roundData.votesToSkipcoordination : gs.roundData.votesToSkiptwilight;

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
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    gs.phase = 'coordination';
    gs.roundData.actedInTwilight = new Set();
    gs.roundData.votesToSkipcoordination = new Set();

    const DURATION = 15;
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

    if (!player || artifactIndex === -1) return;
    
    io.to(roomCode).emit('logMessage', { type: 'warning', message: `📜 Một Cổ vật bí ẩn đã kích hoạt!` });
    
    const artifact = player.artifacts[artifactIndex];
    artifact.usedThisRound = true;

    // Chỉ xóa và trả về bể những Cổ vật dùng 1 lần ngay lập tức
    if (artifact.is_activatable) {
        player.artifacts.splice(artifactIndex, 1);
        gs.artifactPool.push(artifactId);
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
    
    gs.phase = 'twilight';
    gs.roundData.votesToSkiptwilight = new Set();

    io.to(roomCode).emit('twilightPhaseStarted', { duration: GAME_CONSTANTS.CHAOS_DURATION });

    gs.roundData.twilightTimer = setTimeout(() => {
        endTwilightPhase("Hết giờ cho giai đoạn Hoàng Hôn.", roomCode, rooms, io);
    }, GAME_CONSTANTS.CHAOS_DURATION * 1000);
}


function endTwilightPhase(message, roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
     if (!gs || (gs.phase !== 'twilight' && gs.phase !== 'reveal_pending' && gs.phase !== 'amnesia_selection')) return;
    
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
	 io.to(roomCode).emit('forceCloseTwilightOverlay');
    io.to(roomCode).emit('chaosActionResolved', { message });
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 3000);
}

function handleTwilightAction(roomCode, initiatorId, targetId, actionType, guess, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'twilight') return;

    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target || initiator.id === target.id) return;
    
    // === BẮT ĐẦU DÒNG KIỂM TRA MỚI ===
    // Nếu người chơi này đã có trong danh sách hành động, bỏ qua yêu cầu này
    if (gs.roundData.actedInTwilight.has(initiatorId)) {
        console.log(`[Logic Warning] Player ${initiator.name} (${initiatorId}) tried to act more than once in Twilight.`);
        return; 
    }
    // === KẾT THÚC DÒNG KIỂM TRA MỚI ===

    gs.roundData.actedInTwilight.add(initiator.id);

    const amuletIndex = initiator.artifacts.findIndex(a => a.id === 'AMULET_OF_CLARITY');
    const hasAmulet = amuletIndex !== -1;

    if (target.roleId === 'ASSASSIN') {
        io.to(target.id).emit('privateInfo', { title: 'Bị Nhắm Đến', text: `**${initiator.name}** đã Vạch Trần bạn. Hành động bí mật của họ là: **${initiator.chosenAction || 'Chưa chọn'}**` });
    }

    if (actionType === 'Vạch Trần') {
        const success = (guess === target.chosenAction);
        let message = `🔥 **${initiator.name}** đã Vạch Trần **${target.name}** và phán đoán **${success ? "ĐÚNG" : "SAI"}**!`;
        
        if (success) {
            const isChallengeDecreeActive = gs.roundData.decrees.some(d => d.id === 'THACH_THUC_KE_DAN_DAU');
            const leaders = getPlayersByScore(gs.players, 'highest');

            if (isChallengeDecreeActive && leaders.some(leader => leader.id === target.id)) {
                [initiator.score, target.score] = [target.score, initiator.score];
                message = `⚔️ **${initiator.name}** đã thách thức thành công Kẻ Dẫn Đầu! Điểm số của họ đã bị hoán đổi!`;
            } else {
                const pointGain = hasAmulet ? 4 : 2;
                initiator.score += pointGain;
                target.score -= 2;

                if (initiator.roleId === 'INQUISITOR' && target.chosenAction === 'Phá Hoại') {
                    initiator.score += 1;
                }
                
                const assassin = gs.players.find(p => p.roleId === 'ASSASSIN' && !p.isDefeated);
                if (assassin && assassin.bountyTargetId === target.id) {
                    if (initiator.id === assassin.id) {
                        target.score = Math.floor(target.score / 2);
                        io.to(roomCode).emit('logMessage', { type: 'warning', message: `💥 **${assassin.name}** đã hoàn thành hợp đồng, điểm của **${target.name}** bị chia đôi!` });
                    } else {
                        target.score -= 2;
                        io.to(roomCode).emit('logMessage', { type: 'error', message: `🎯 **${target.name}** là mục tiêu bị săn đuổi và phải chịu hình phạt nặng hơn!` });
                    }
                }
            }
			 if (initiator.roleId === 'PROPHET') {
                initiator.consecutiveSuccessAccusations = (initiator.consecutiveSuccessAccusations || 0) + 1;
            }
        } else { // Vạch Trần thất bại
            let pointLoss;
            if (hasAmulet) {
                pointLoss = 1;
            } else if (initiator.roleId === 'PROPHET') {
                pointLoss = 1;
            } else {
                pointLoss = 2;
            }
            
            initiator.score -= pointLoss;
            target.score += 2;
            gs.roundData.failedAccusationsThisRound++;
            
			if (initiator.roleId === 'PROPHET') {
                initiator.consecutiveSuccessAccusations = 0;
            }
        } 
        
		if (hasAmulet) {
            initiator.artifacts.splice(amuletIndex, 1);
            gs.artifactPool.push('AMULET_OF_CLARITY');
            io.to(initiator.id).emit('artifactUpdate', { artifacts: initiator.artifacts });
            io.to(roomCode).emit('logMessage', {type: 'info', message: `Bùa Chú Minh Mẫn của ${initiator.name} đã được sử dụng!`});
        }
        
        io.to(roomCode).emit('logMessage', { type: success ? 'success' : 'error', message });
        io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({ id: p.id, score: p.score })));
    }
    
    const activePlayersCount = gs.players.filter(p => !p.isDefeated && !p.disconnected).length;
    if (gs.roundData.actedInTwilight.size >= activePlayersCount) {
        endTwilightPhase("Tất cả Thợ Săn đã quyết định hành động trong hoàng hôn.", roomCode, rooms, io);
    }
}
async function updatePlayerStats(playerObject, didWin, xpGained) {
    // Không cập nhật cho Bot hoặc người chơi không có ID trong database (khách)
    if (playerObject.isBot || !playerObject.dbId) {
        return;
    }

    try {
        const update = {
            $inc: {
                'stats.gamesPlayed': 1,
                'stats.wins': didWin ? 1 : 0,
                'xp': xpGained
            }
        };
        // Tìm và cập nhật người dùng dựa trên dbId đã được lưu khi họ tham gia phòng
        await User.findByIdAndUpdate(playerObject.dbId, update);
        
        console.log(`[Stats] Đã cập nhật chỉ số cho người dùng: ${playerObject.username}.`);
        
        // Nâng cao: Thêm logic kiểm tra và lên cấp ở đây nếu cần
        // const updatedUser = await User.findById(playerObject.dbId);
        // if (updatedUser.xp >= calculateXpForNextLevel(updatedUser.level)) { ... }

    } catch (error) {
        console.error(`[Stats Error] Lỗi cập nhật chỉ số cho người chơi ${playerObject.name}:`, error);
    }
}

async function handlePostRoundEvents(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    // --- BƯỚC 1: CẬP NHẬT TIẾN TRÌNH VAI TRÒ DÀI HẠN (GIỮ NGUYÊN) ---
    gs.players.forEach(p => {
        if (!p.isDefeated) {
            if (p.score >= 7) p.hasReached7 = true;
            if (p.score <= -7) p.hasReachedMinus7 = true;
            if (gs.roundData.roundWinners?.includes(p.id) && gs.roundData.roundWinners.length === 1) {
                p.loneWolfWins = (p.loneWolfWins || 0) + 1;
            }
        }
    });

    // --- BƯỚC 2: XÁC ĐỊNH TRẠNG THÁI KẾT THÚC GAME ---
    const allWinners = [];
    let gameEndReason = null;
    
    // Ưu tiên 1: Thắng bằng Thiên Mệnh (Vai trò)
    const winnerByRole = checkRoleVictory(gs);
    if (winnerByRole) {
        allWinners.push(winnerByRole);
        gameEndReason = `đã hoàn thành Thiên Mệnh "${ROLES[winnerByRole.roleId].name}"!`;
    }

    // Ưu tiên 2: Thắng/Thua bằng Điểm số
    // (Chỉ kiểm tra nếu chưa có ai thắng bằng vai trò, hoặc cho phép nhiều người cùng thắng)
    const winnersByScore = gs.players.filter(p => p.score >= gs.winScore);
    const losersByScore = gs.players.filter(p => p.score <= gs.loseScore);

    if (winnersByScore.length > 0) {
        winnersByScore.forEach(winner => {
            if (!allWinners.some(w => w.id === winner.id)) {
                allWinners.push(winner);
            }
        });
        if (!gameEndReason) {
             gameEndReason = `đạt ${gs.winScore} điểm.`;
        }
    }
    
    const isGameOver = allWinners.length > 0 || losersByScore.length > 0;

    // --- BƯỚC 3: XỬ LÝ KHI GAME KẾT THÚC ---
    if (isGameOver) {
        gs.phase = 'gameover';
        
        const winnerNames = allWinners.map(w => w.name).join(', ');
        const finalReason = allWinners.length > 0 
            ? `Người chiến thắng là ${winnerNames}! Lý do: ${gameEndReason}`
            : `Trò chơi kết thúc vì ${losersByScore[0].name} đạt ${gs.loseScore} điểm.`;

        // Gửi thông báo kết thúc game cho client
        io.to(roomCode).emit('gameOver', { 
            winners: allWinners.map(w => ({ name: w.name, id: w.id })),
            losers: losersByScore.map(l => ({ name: l.name, id: l.id })),
            reason: finalReason 
        });

        // --- BƯỚC 4: CẬP NHẬT DATABASE (LOGIC QUAN TRỌNG) ---
        const allLosers = gs.players.filter(p => !allWinners.some(w => w.id === p.id));
        const updates = []; // Mảng chứa các promise cập nhật

        allWinners.forEach(winner => {
            updates.push(updatePlayerStats(winner, true, 50)); // Thắng được 50 XP
        });
        
        allLosers.forEach(loser => {
            updates.push(updatePlayerStats(loser, false, 15)); // Thua được 15 XP
        });
        
        // Thực thi tất cả các cập nhật một cách song song để tăng hiệu suất
        try {
            await Promise.all(updates);
            console.log('[Stats] Hoàn tất cập nhật chỉ số cho tất cả người chơi.');
        } catch (error) {
            console.error('[Stats Error] Đã xảy ra lỗi khi cập nhật song song:', error);
        }
        
    } 
    // Nếu game chưa kết thúc, không làm gì cả, chờ Host bắt đầu vòng mới.
}




function checkRoleVictory(gs) {
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

function triggerBotPhaseAction(roomCode, rooms, io, phase) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    const bots = gs.players.filter(p => p.isBot && !p.isDefeated);
    
    bots.forEach((bot, index) => {
        setTimeout(() => {
            if(gs) gs.roomCode = roomCode;
            BotAI.makeDecision(bot, gs, phase, rooms, io);
        }, 2000 + (index * 1500) + (Math.random() * 1000));
    });
}

function triggerBotChoices(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    
    const bots = gs.players.filter(p => p.isBot && !p.isDefeated && !p.chosenAction);

    bots.forEach((bot, index) => {
        setTimeout(() => {
            if (gs.phase === 'exploration' && !bot.chosenAction) {
                if(gs) gs.roomCode = roomCode;
                BotAI.makeDecision(bot, gs, 'exploration', rooms, io);
            }
        }, 2000 + (index * 1000) + (Math.random() * 500));
    });
}

// [SỬA LỖI LOGIC] Khắc phục lỗi lặp và trừ điểm sai của Kẻ Bắt Chước.
function handleUseSkill(socket, roomCode, payload, rooms, io, _isMimicCall = false) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === socket.id);

    if (!_isMimicCall) {
        if (!player || player.isDefeated || player.isSkillDisabled || player.skillUsedThisRound) {
            return io.to(socket.id).emit('privateInfo', { title: 'Lỗi', text: 'Không thể dùng kỹ năng!' });
        }
        if (player.roleId === 'MIMIC' && !player.canMimicSkill) {
            return io.to(socket.id).emit('privateInfo', { title: 'Lỗi', text: 'Người bạn đang sao chép không có kỹ năng kích hoạt!' });
        }
        const cost = SKILL_COSTS[player.skillUses] ?? SKILL_COSTS[SKILL_COSTS.length - 1];
        if (player.score < cost) {
            return io.to(socket.id).emit('privateInfo', { title: 'Lỗi', text: `Không đủ Tiến Độ để dùng kỹ năng (cần ${cost})!` });
        }
        player.score -= cost;
        player.skillUsedThisRound = true;
        player.skillUses++;
        
        io.to(roomCode).emit('logMessage', { type: 'info', message: `✨ Một kỹ năng bí ẩn đã được kích hoạt...` });
        io.to(roomCode).emit('updatePlayerCards', [{ id: player.id, score: player.score }]);

        const roleData = { ...ROLES[player.roleId], id: player.roleId };
        roleData.currentSkillCost = SKILL_COSTS[player.skillUses] ?? SKILL_COSTS[SKILL_COSTS.length - 1];
        roleData.canMimicSkill = player.canMimicSkill;
        io.to(player.id).emit('yourRoleIs', roleData);
    }
    
    let effectiveRoleId = player.roleId;

    if (player.roleId === 'MIMIC') {
        const mimicTarget = gs.players.find(p => p.id === player.mimicTargetId);
        if (!mimicTarget || !ROLES[mimicTarget.roleId].hasActiveSkill) {
            return;
        }
        effectiveRoleId = mimicTarget.roleId;
        io.to(roomCode).emit('logMessage', { type: 'info', message: `🎭 Một người chơi đang bắt chước kỹ năng của người khác!` });
    }

    switch (effectiveRoleId) {
        case 'PROPHET':
        case 'PEACEMAKER':
        case 'PRIEST':
        case 'PHANTOM':
            player.skillTargetId = payload.targetId;
            if (effectiveRoleId === 'PROPHET') {
                const targetPlayer = gs.players.find(p => p.id === payload.targetId);
                if (targetPlayer) io.to(player.id).emit('privateInfo', { title: 'Thiên Lý Nhãn (Ké)', text: `Hành động của ${targetPlayer.name} là: **${targetPlayer.chosenAction || 'Chưa chọn'}**.` });
            }
            break;
           
        case 'MIND_BREAKER':
            const targetPlayerMB = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayerMB && payload.chosenAction) {
                targetPlayerMB.chosenAction = payload.chosenAction;
                io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 Một thế lực vô hình đã điều khiển hành động của một người chơi.` });
                io.to(roomCode).emit('playerChose', targetPlayerMB.id);
            }
            break;
		
        case 'MAGNATE':
        case 'THIEF':
        case 'DOUBLE_AGENT':
            player.skillActive = true;
            player.skillTargetId = payload.targetId;
            break;
            
        case 'GAMBLER':
            player.skillActive = true;
            player.gamblerBet = payload.chosenFaction;
            break;

        case 'REBEL':
            player.skillActive = true;
            player.rebelDeclaration = payload.declaredAction;
            player.rebelPunishTarget = payload.punishTargetId;
             io.to(roomCode).emit('logMessage', { type: 'info', message: `📢 Kẻ nổi loạn đã tuyên bố sẽ **${payload.declaredAction}**!Nếu họ là người duy nhất, một hình phạt sẽ được đưa ra.` });
            break;

        case 'INQUISITOR':
            player.skillActive = true;
            break;

        case 'BALANCER':
            const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
            const highestPlayers = getPlayersByScore(activePlayers, 'highest');
            const lowestPlayers = getPlayersByScore(activePlayers, 'lowest');
            if (highestPlayers.length > 0 && lowestPlayers.length > 0 && highestPlayers[0].score !== lowestPlayers[0].score) {
                const highestScore = highestPlayers[0].score;
                const lowestScore = lowestPlayers[0].score;
                const avgScore = Math.round((highestScore + lowestScore) / 2);
                highestPlayers.forEach(p => { p.score = avgScore; });
                lowestPlayers.forEach(p => { p.score = avgScore; });
                io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({id: p.id, score: p.score})));
            } else {
                io.to(player.id).emit('privateInfo', { title: 'Thất Bại', text: 'Không thể tái phân bố điểm số lúc này.' });
                const cost = SKILL_COSTS[player.skillUses - 1] || 0;
                player.score += cost; 
                if (player.skillUses > 0) player.skillUses--; 
                player.skillUsedThisRound = false;
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
                } else {
                    player.hasTripleVote = true;
                }
            }
            break;
    }
}
function calculateScoresAndEndRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.phase = 'reveal';

    const results = { messages: [], roundSummary: [], isDraw: false, winner: null, roundWinners: [] };
    const activePlayers = gs.players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return handlePostRoundEvents(roomCode, rooms, io);

    activePlayers.forEach(p => {
        results.roundSummary.push({
            id: p.id, name: p.name, oldScore: p.score, newScore: 0,
            changes: [], chosenAction: p.chosenAction,
            actionWasNullified: false
        });
    });
   const applyPointChange = (playerId, amount, reason) => {
        const summary = results.roundSummary.find(s => s.id === playerId);
        if (!summary || amount === 0) return;
        const player = gs.players.find(p => p.id === playerId);
        const wardIndex = player.artifacts.findIndex(a => a.id === 'GOLDEN_WARD');
        if (wardIndex !== -1 && amount < 0) {
            player.artifacts.splice(wardIndex, 1);
            gs.artifactPool.push('GOLDEN_WARD');
            io.to(player.id).emit('artifactUpdate', { artifacts: player.artifacts });
            io.to(roomCode).emit('logMessage', { type: 'info', message: `Bùa Hộ Thân đã bảo vệ một người chơi khỏi bị mất điểm!` });
            return;
        }
        summary.changes.push({ reason, amount });
    };


	  // BƯỚC A: XỬ LÝ CÁC TIẾNG VỌNG THAY ĐỔI HÀNH ĐỘNG
    gs.roundData.decrees.forEach(decree => {
        if (decree.id === 'VU_DIEU_HON_LOAN') {
            const allActions = activePlayers.map(p => p.chosenAction);
            for (let i = allActions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allActions[i], allActions[j]] = [allActions[j], allActions[i]]; }
            activePlayers.forEach((p, i) => { p.chosenAction = allActions[i]; });
            io.to(roomCode).emit('logMessage', { type: 'warning', message: 'Vũ Điệu Hỗn Loạn! Hành động của mọi người đã bị xáo trộn!' });
        } else if (decree.id === 'AO_GIAC_DICH_CHUYEN') {
            if (activePlayers.length > 1) {
                const lastAction = activePlayers[activePlayers.length - 1].chosenAction;
                for (let i = activePlayers.length - 1; i > 0; i--) { activePlayers[i].chosenAction = activePlayers[i - 1].chosenAction; }
                activePlayers[0].chosenAction = lastAction;
            }
            io.to(roomCode).emit('logMessage', { type: 'warning', message: 'Ảo Giác Dịch Chuyển! Hành động đã được chuyển cho người bên cạnh!' });
        }
    });
	  // BƯỚC B: KẺ BẮT CHƯỚC SAO CHÉP HÀNH ĐỘNG "CUỐI CÙNG"
    const mimics = activePlayers.filter(p => p.roleId === 'MIMIC' && p.mimicTargetId);
    mimics.forEach(mimic => {
        const target = gs.players.find(p => p.id === mimic.mimicTargetId);
        if (target) {
            mimic.chosenAction = target.chosenAction;
            io.to(mimic.id).emit('privateInfo', {
                title: 'Sao Chép Thành Công',
                text: `Sau mọi biến động, hành động cuối cùng bạn sao chép của ${target.name} là: **${mimic.chosenAction || 'Không làm gì'}**.`
            });
        }
    });

    // BƯỚC C: XỬ LÝ HIỆU ỨNG HÀNH ĐỘNG VÀ ĐẾM PHIẾU
    activePlayers.forEach(p => {
        if (p.chosenAction === 'Giải Mã') {
            const rand = Math.random();
            if (rand < 0.10) handleFindArtifact(p, 'Thám Hiểm', gs, io);
            else if (rand < 0.40) applyPointChange(p.id, 1, 'May mắn khi Giải Mã');
        } else if (p.chosenAction === 'Phá Hoại') {
            const rand = Math.random();
            if (rand < 0.10) handleFindArtifact(p, 'Hỗn Loạn', gs, io);
            else if (rand < 0.40) {
                const target = gs.players.find(t => t.id === p.sabotageTargetId);
                if (target) applyPointChange(target.id, -1, `Ảnh hưởng từ hành động`);
            }
        }
    });


    // BƯỚC 1 & 2: THIẾT LẬP TỔ HỢP & ĐẾM PHIẾU
    const successfulPairs = [];
    (gs.roundData.coordinationVotes || []).forEach(vote => {
        const initiator = activePlayers.find(p => p.id === vote.initiatorId);
        const target = activePlayers.find(p => p.id === vote.targetId);

        if (initiator && target && initiator.chosenAction === target.chosenAction) {
            successfulPairs.push([initiator.id, target.id]);
        } else if (initiator) {
            applyPointChange(initiator.id, -1, 'Tin tưởng nhầm người');
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
   const isDraw = loyalVotes === corruptVotes || loyalVotes === 0 || corruptVotes === 0;
 if (isDraw) {
        results.isDraw = true;
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả là HÒA!");
    } else {
        // Logic xác định phe thắng chỉ chạy khi không hòa
        results.winner = (isPhanXetDaoNguoc ? (loyalVotes > corruptVotes) : (loyalVotes < corruptVotes)) ? 'Giải Mã' : 'Phá Hoại';
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
	const inquisitor = activePlayers.find(p => p.roleId === 'INQUISITOR' && p.skillActive);
    if (inquisitor) {
        const saboteurs = activePlayers.filter(p => p.chosenAction === 'Phá Hoại');
        const sabotageCount = saboteurs.length;
        if (sabotageCount > 0) {
            saboteurs.forEach(saboteur => {
                applyPointChange(saboteur.id, -sabotageCount, 'Kỹ năng bí ẩn');
            });
        }
    }
    
    activePlayers.forEach(player => {
        if (player.skillActive) {
            switch (player.roleId) {
                case 'MAGNATE':
                    const magnateTarget = activePlayers.find(p => p.id === player.skillTargetId);
                    if (magnateTarget && !results.isDraw && magnateTarget.chosenAction === results.winner) {
                        applyPointChange(player.id, 2, 'Kỹ năng bí ẩn');
                        applyPointChange(magnateTarget.id, 2, 'Ảnh hưởng từ kỹ năng');
                    }
                    break;
                case 'THIEF':
                    const thiefTargetSummary = results.roundSummary.find(s => s.id === player.skillTargetId);
                    if (thiefTargetSummary) {
                        const targetGained = thiefTargetSummary.changes.filter(c => c.amount > 0).reduce((sum, change) => sum + change.amount, 0);
                        if (targetGained > 0) {
                            const stolenAmount = Math.floor(targetGained / 2);
                            if (stolenAmount > 0) {
                                applyPointChange(player.id, stolenAmount, 'Kỹ năng bí ẩn');
                                applyPointChange(thiefTargetSummary.id, -stolenAmount, 'Ảnh hưởng từ kỹ năng');
                            }
                        }
                    }
                    break;
                case 'GAMBLER':
                    if (player.gamblerBet && !results.isDraw) {
                        if (player.gamblerBet === results.winner) applyPointChange(player.id, 8, 'Kỹ năng bí ẩn');
                        else applyPointChange(player.id, -4, 'Kỹ năng bí ẩn');
                    }
                    break;
                case 'REBEL':
                    if (player.rebelDeclaration && player.rebelPunishTarget) {
                        if (finalVotes[player.rebelDeclaration] === 1 && player.chosenAction === player.rebelDeclaration) {
                            const costPaid = config.SKILL_COSTS[player.skillUses - 1] || 0;
                            const punishment = Math.max(1, costPaid);
                            const punishTarget = activePlayers.find(p => p.id === player.rebelPunishTarget);
                            if (punishTarget) applyPointChange(punishTarget.id, -punishment, 'Ảnh hưởng từ kỹ năng');
                        }
                    }
                    break;
                case 'PHANTOM':
                    const hauntTargetSummary = results.roundSummary.find(s => s.id === player.skillTargetId);
                    if (hauntTargetSummary) {
                        const targetGained = hauntTargetSummary.changes.filter(c => c.amount > 0).reduce((sum, change) => sum + change.amount, 0);
                        if (targetGained > 0) {
                            applyPointChange(hauntTargetSummary.id, -1, 'Ảnh hưởng từ kỹ năng');
                            applyPointChange(player.id, 1, 'Kỹ năng bí ẩn');
                            player.hauntSuccessCount = (player.hauntSuccessCount || 0) + 1;
                        }
                    }
                    break;
            }
        }
    });
    
    // BƯỚC 5: ÁP DỤNG ĐIỂM TỪ KỸ NĂNG, NỘI TẠI & TIẾNG VỌNG
    // --- 5.1: Xử lý kỹ năng đã kích hoạt
     activePlayers.forEach(player => {
        const summary = results.roundSummary.find(s => s.id === player.id);
        switch (player.roleId) {
            // ĐỔI LÝ DO THÀNH "Nội tại" chung chung
            case 'PEACEMAKER':
                if (results.isDraw) applyPointChange(player.id, 1, 'Nội tại');
                break;
            case 'GAMBLER':
                let totalLoss = 0;
                summary.changes.forEach(change => { if (change.amount < 0) totalLoss += change.amount; });
                if (totalLoss < 0) {
                    summary.changes = summary.changes.filter(c => c.amount >= 0);
                    const newLoss = Math.random() < 0.5 ? Math.floor(totalLoss / 2) : totalLoss * 2;
                    applyPointChange(player.id, newLoss, 'Nội tại');
                }
                break;
            case 'MAGNATE':
                const currentChangeForMagnate = summary.changes.reduce((sum, c) => sum + c.amount, 0);
                if ((player.score + currentChangeForMagnate) > 0) applyPointChange(player.id, 1, 'Nội tại');
                else if ((player.score + currentChangeForMagnate) < 0) applyPointChange(player.id, -1, 'Nội tại');
                break;
            case 'THIEF':
                let losersCount = activePlayers.filter(p => results.roundSummary.find(s => s.id === p.id).changes.reduce((sum, c) => sum + c.amount, 0) < 0).length;
                if (losersCount >= 2) applyPointChange(player.id, Math.floor(losersCount / 2), 'Nội tại');
                break;
            case 'MIND_BREAKER':
                if (gs.roundData.failedAccusationsThisRound > 0) applyPointChange(player.id, gs.roundData.failedAccusationsThisRound * 2, 'Nội tại');
                break;
            case 'CULTIST':
                summary.changes.forEach(change => { if (change.amount < 0) change.amount = Math.min(0, change.amount + 1); });
                break;
            case 'DOUBLE_AGENT':
                if (!results.isDraw && player.chosenAction !== results.winner) applyPointChange(player.id, 1, 'Nội tại');
                break;
            case 'PHANTOM':
                applyPointChange(player.id, 1, 'Nội tại');
                break;
        }
    });
    // --- 5.2: Xử lý nội tại và Tiếng Vọng
    activePlayers.forEach(player => {
        const summary = results.roundSummary.find(s => s.id === player.id);
        
        switch (player.roleId) {
            case 'PEACEMAKER':
                if (results.isDraw) applyPointChange(player.id, 1, 'Nội tại');
                break;
            case 'GAMBLER':
                let totalLoss = 0;
                summary.changes.forEach(change => { if (change.amount < 0) totalLoss += change.amount; });
                if (totalLoss < 0) {
                    summary.changes = summary.changes.filter(c => c.amount >= 0);
                    const newLoss = Math.random() < 0.5 ? Math.floor(totalLoss / 2) : totalLoss * 2;
                    applyPointChange(player.id, newLoss, 'Nội tại ');
                }
                break;
            case 'MAGNATE':
                const currentChangeForMagnate = summary.changes.reduce((sum, c) => sum + c.amount, 0);
                if ((player.score + currentChangeForMagnate) > 0) applyPointChange(player.id, 1, 'Nội tại');
                else if ((player.score + currentChangeForMagnate) < 0) applyPointChange(player.id, -1, 'Nội tại');
                break;
            case 'THIEF':
                let losersCount = activePlayers.filter(p => results.roundSummary.find(s => s.id === p.id).changes.reduce((sum, c) => sum + c.amount, 0) < 0).length;
                if (losersCount >= 2) applyPointChange(player.id, Math.floor(losersCount / 2), 'Nội tại');
                break;
            case 'MIND_BREAKER':
                if (gs.roundData.failedAccusationsThisRound > 0) applyPointChange(player.id, gs.roundData.failedAccusationsThisRound * 2, 'Nội tại');
                break;
            case 'CULTIST':
                summary.changes.forEach(change => { if (change.amount < 0) change.amount = Math.min(0, change.amount + 1); });
                break;
            case 'DOUBLE_AGENT':
                if (!results.isDraw && player.chosenAction !== results.winner) applyPointChange(player.id, 1, 'Nội tại');
                break;
            case 'PHANTOM':
                applyPointChange(player.id, 1, 'Nội tại');
                break;
        }
    });

    // --- 5.3: Tiếng Vọng ảnh hưởng điểm
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
                    applyPointChange(p.id, -finalScore, 'Lời Nguyền Hỉ Hả');
                } else if (finalScore > 0) {
                    applyPointChange(p.id, -1, 'Phạt vì "hả hê"');
                }
            });
        }
    }

    // BƯỚC 6: TỔNG KẾT & ÁP DỤNG MODIFIER CUỐI CÙNG
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

    // Tiếng Vọng nhân đôi điểm luôn được áp dụng cuối cùng
    if (gs.roundData.decrees.some(d => d.id === 'VONG_AM_KHUECH_DAI')) {
        results.roundSummary.forEach(summary => {
            summary.changes.forEach(change => {
                change.amount *= 2;
            });
        });
        results.messages.push(`🔊 VỌNG ÂM KHUẾCH ĐẠI! Mọi điểm số đều được nhân đôi!`);
    }

    // Cập nhật điểm số cuối cùng
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

    handlePostRoundEvents(roomCode, rooms, io);
}

module.exports = {
    createGameState, startNewRound, handlePlayerChoice, handleCoordination, revealDecreeAndContinue,
    handleTwilightAction, handleUseSkill, handleAmnesiaAction, handleArenaPick, handleArenaBet,
    handleVoteToSkip, triggerBotPhaseAction, calculateScoresAndEndRound, handlePostRoundEvents, checkRoleVictory,
    resetRoomForRematch,
    handleArtifactDecision,
};