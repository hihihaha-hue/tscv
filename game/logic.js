// game/logic.js
// ======================================================================
// CORE GAME LOGIC ("The Brain")
// Chứa bộ não của game: tạo trạng thái, xử lý luồng vòng chơi, tính toán, và kiểm tra chiến thắng.
// ======================================================================

// --- I. IMPORTS & PHỤ THUỘC ---
const {
    DECREES, ROLES, ALL_DECREE_IDS, ALL_ROLE_IDS,
    CHOICE_DURATION, CHAOS_DURATION, DECREE_REVEAL_DELAY
} = require('./config');

// --- Hằng số chi phí kỹ năng ---
const SKILL_COSTS = [0, 1, 2, 3, 5, 10]; // Index 0: Lần 1 (miễn phí), Index 1: Lần 2 (1 điểm), ...

// --- II. HÀM KHỞI TẠO & CÀI ĐẶT GAME ---

function createGameState(players) {
    const numPlayers = players.length;
    let winScore, loseScore;
    if (numPlayers <= 4) { winScore = 15; loseScore = -15; }
    else if (numPlayers <= 8) { winScore = 20; loseScore = -20; }
    else { winScore = 25; loseScore = -25; }

    const rolesToAssign = [...ALL_ROLE_IDS];
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
            // Trạng thái cho vai trò
            skillUses: 0, // Đếm số lần dùng kỹ năng
            consecutiveChallenges: 0, // Cho Nhà Tiên Tri
            hasBeenNegative: false,
            successfulChallenges: 0,
            neverSabotaged: true,
            recentActions: [],
            hasReached7: false,
            hasReachedMinus7: false,
            loneWolfWins: 0,
            bountyTargetId: null, // Cho Sát Thủ
            mimicTargetId: null, // Cho Kẻ Bắt Chước
            isHaunted: false, // Cho Kẻ Gieo Rắc Dịch Bệnh
            isBlessed: false, // Cho Thầy Tế
            skillUsedThisRound: false,
        })),
        currentRound: 0,
        winScore, loseScore,
        phase: 'waiting',
        roundData: {},
        decreeDeck: [], decreeDiscard: [],
        consecutiveDraws: 0,
        rolesInGame: rolesInThisGame,
        nextDecreeChooser: null, // Cho Tiếng Vọng "Di Sản Kẻ Tiên Phong"
    };

    // Thiết lập riêng cho các vai trò khi bắt đầu game
    initializeSpecialRoles(gameState);
    shuffleDecreeDeck(gameState);
    return gameState;
}

function initializeSpecialRoles(gs) {
    // Sát Thủ nhận mục tiêu
    const assassin = gs.players.find(p => p.roleId === 'ASSASSIN');
    if (assassin) {
        const potentialTargets = gs.players.filter(p => p.id !== assassin.id);
        if (potentialTargets.length > 0) {
            assassin.bountyTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
        }
    }
}

function shuffleDecreeDeck(gs) {
    gs.decreeDeck = [...ALL_DECREE_IDS];
    for (let i = gs.decreeDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gs.decreeDeck[i], gs.decreeDeck[j]] = [gs.decreeDeck[j], gs.decreeDeck[i]];
    }
    gs.decreeDiscard = [];
}

// --- III. HÀM XỬ LÝ LUỒNG CHƠI (ROUND FLOW) ---
function startNewRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    gs.currentRound++;
    gs.phase = 'choice';
    
    // Kẻ Bắt Chước nhận mục tiêu mới
    const mimic = gs.players.find(p => p.roleId === 'MIMIC' && !p.isDefeated);
    if (mimic) {
        const potentialTargets = gs.players.filter(p => p.id !== mimic.id && !p.isDefeated);
        if (potentialTargets.length > 0) {
            mimic.mimicTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
            const targetPlayer = potentialTargets.find(p => p.id === mimic.mimicTargetId);
            if(targetPlayer) {
                io.to(mimic.id).emit('privateInfo', {title: "Mô Phỏng", text: `Đêm nay bạn sẽ sao chép hành động của **${targetPlayer.name}**.`});
            }
        }
    }

    gs.players.forEach(p => {
        if (!p.isDefeated) {
            p.chosenAction = null;
            p.isBlessed = false;
            p.skillUsedThisRound = false;
            if (p.roleId === 'MIMIC') p.chosenAction = 'mimicking';
        }
    });
    
    gs.roundData = {
        decrees: null,
        chaosResult: null,
        votesToSkip: new Set(),
        choiceTimer: null,
        chaosTimer: null,
    };

    io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound,
        players: gs.players,
        duration: CHOICE_DURATION
    });

    gs.roundData.choiceTimer = setTimeout(() => {
        gs.players.forEach(p => {
            if (!p.chosenAction && !p.isDefe-ated) {
                const choices = ['Giải Mã', 'Phá Hoại', 'Quan Sát'];
                handlePlayerChoice(roomCode, p.id, choices[Math.floor(Math.random() * 3)], rooms, io);
            }
        });
    }, CHOICE_DURATION * 1000); // Dấu ngoặc đóng của setTimeout ở đây là đúng

    triggerBotChoices(roomCode, rooms, io); // Hàm này phải nằm ngoài setTimeout
}
function handlePlayerChoice(roomCode, playerId, choice, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'choice') return;
    const player = gs.players.find(p => p.id === playerId);
    if (player && !player.chosenAction) {
        player.chosenAction = choice;
        if (choice === 'Phá Hoại') player.neverSabotaged = false;
        player.recentActions.push(choice);
        if (player.recentActions.length > 3) player.recentActions.shift();
        io.to(roomCode).emit('playerChose', playerId);
    }
    if (gs.players.filter(p => !p.isDefeated && !p.disconnected).every(p => p.chosenAction)) {
        const mimic = gs.players.find(p => p.roleId === 'MIMIC');
        if (mimic) {
            const target = gs.players.find(p => p.id === mimic.mimicTargetId);
            mimic.chosenAction = target?.chosenAction || ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
        }
        clearTimeout(gs.roundData.choiceTimer);
        revealDecreeAndContinue(roomCode, rooms, io);
    }
}
function revealDecreeAndContinue(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    gs.phase = 'decree';

    // Đêm đầu tiên không có Tiếng Vọng
    if (gs.currentRound === 1) {
        io.to(roomCode).emit('logMessage', { type: 'info', message: "Đêm đầu tiên yên tĩnh, không có Tiếng Vọng." });
        startChaosPhase(roomCode, rooms, io);
        return;
    }

    if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
    
    // Xác định người rút Tiếng Vọng
    const drawer = gs.nextDecreeChooser || getPlayersByScore(gs.players, 'lowest')[0];
    gs.nextDecreeChooser = null; // Reset lại quyền chọn

    // Rút Tiếng Vọng
    let decreesToReveal = [];
    const firstDecreeId = gs.decreeDeck.pop();
    gs.decreeDiscard.push(firstDecreeId);
    decreesToReveal.push({ ...DECREES[firstDecreeId], id: firstDecreeId });
    
    // Logic cho "Đêm Song Trùng"
    if(firstDecreeId === 'DEM_SONG_TRUNG'){
        if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
        const secondDecreeId = gs.decreeDeck.pop();
        gs.decreeDiscard.push(secondDecreeId);
        decreesToReveal.push({ ...DECREES[secondDecreeId], id: secondDecreeId });
    }
    gs.roundData.decrees = decreesToReveal;

    io.to(roomCode).emit('decreeRevealed', {
        drawerName: drawer.name,
        decrees: decreesToReveal.map(d => ({ name: d.name, description: d.description }))
    });

    setTimeout(() => {
        // Thực thi các hook onReveal
        decreesToReveal.forEach(decree => {
            if (decree.onReveal) {
                // Các hàm onReveal này cần được định nghĩa trong config.js
                // Ví dụ: Vũ Điệu Hỗn Loạn, Ảo Giác Dịch Chuyển...
                decree.onReveal(gs, io, roomCode, drawer.id, rooms);
            }
        });
        
        // Nếu không có Tiếng Vọng nào chuyển game sang phase đặc biệt, tiếp tục
        if (gs.phase !== 'special_action' && gs.phase !== 'arena_betting') {
            startChaosPhase(roomCode, rooms, io);
        }
    }, DECREE_REVEAL_DELAY);
}

/**
 * Bắt đầu giai đoạn Hoàng Hôn (Twilight Phase).
 */
function startChaosPhase(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    
    // Kiểm tra các điều kiện vô hiệu hóa chaos
    if (gs.roundData.decrees.some(d => d.isChaosDisabled)) {
        const disablingDecree = gs.roundData.decrees.find(d => d.isChaosDisabled);
        endChaosPhase(roomCode, `Tiếng Vọng '${disablingDecree.name}' khiến mọi hành động phải dừng lại!`, rooms, io);
        return;
    }

    gs.phase = 'chaos';
    io.to(roomCode).emit('chaosPhaseStarted', { duration: CHAOS_DURATION });
    gs.roundData.chaosTimer = setTimeout(() => endChaosPhase(roomCode, "Hết giờ, không có hành động nào diễn ra.", rooms, io), CHAOS_DURATION * 1000);
    triggerBotChaosAction(roomCode, rooms, io);
}

/**
 * Kết thúc giai đoạn Hoàng Hôn và chuẩn bị cho việc công bố kết quả.
 */
function endChaosPhase(roomCode, message, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'chaos') return;

    gs.phase = 'reveal_pending';
    clearTimeout(gs.roundData.chaosTimer);
    io.to(roomCode).emit('chaosActionResolved', { message });
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 3000);
}

/**
 * Hàm tính toán cốt lõi: xác định kết quả đêm và cập nhật điểm số.
 */
function calculateScoresAndEndRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.phase = 'reveal';

    const { decrees, chaosResult } = gs.roundData;
    const results = { messages: [], scoreChanges: {}, isDraw: false, winner: null, roundWinners: [] };
    const pointMultiplier = decrees.reduce((multi, d) => multi * (d.getPointMultiplier ? d.getPointMultiplier() : 1), 1);
    const activePlayers = gs.players.filter(p => !p.isDefeated);

    if (activePlayers.length === 0) return handlePostRoundEvents(roomCode, rooms, io);

    // 1. TÍNH PHIẾU BẦU CƠ BẢN
    const votes = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
    activePlayers.forEach(p => {
        if (p.chosenAction && p.roleId !== 'PHANTOM') { // Bóng Ma không có phiếu
            votes[p.chosenAction]++;
        }
    });

    // 2. ÁP DỤNG CÁC HIỆU ỨNG THAY ĐỔI PHIẾU
    if (chaosResult?.success && chaosResult.actionType === 'Phối Hợp') {
        if (votes[chaosResult.actionToReduce] > 0) {
            votes[chaosResult.actionToReduce]--;
            results.messages.push("🤝 Phối Hợp thành công, một hành động đã được che giấu!");
        }
    }
    if(decrees.some(d => d.id === 'LUA_CHON_CUA_KE_YEU')) {
        if (votes['Giải Mã'] < votes['Phá Hoại']) votes['Giải Mã'] += votes['Quan Sát'];
        else if (votes['Phá Hoại'] < votes['Giải Mã']) votes['Phá Hoại'] += votes['Quan Sát'];
    }
    const doubleAgent = gs.players.find(p => p.roleId === 'DOUBLE_AGENT' && p.skillUsedThisRound);
    if(doubleAgent) {
        if(doubleAgent.chosenAction === 'Phá Hoại') votes['Giải Mã'] += votes['Quan Sát'];
        else votes['Phá Hoại'] += votes['Quan Sát'];
        votes['Quan Sát'] = 0;
        results.messages.push(`🎭 Kẻ Hai Mang đã xuyên tạc các phiếu Quan Sát!`);
    }

    // 3. XÁC ĐỊNH KẾT QUẢ (THẮNG/THUA/HÒA)
    const { 'Giải Mã': c, 'Phá Hoại': t } = votes;
    let winner = (c > t) ? 'Giải Mã' : 'Phá Hoại';
    results.isDraw = (c === t);
    
    if (decrees.some(d => d.id === 'PHAN_XET_DAO_NGUOC')) {
        results.isDraw = false;
        winner = (c <= t) ? 'Giải Mã' : 'Phá Hoại'; // Đảo ngược luật
    }

    if (results.isDraw) {
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả đêm nay là **HÒA**!");
    } else {
        gs.consecutiveDraws = 0;
        results.winner = winner;
        results.messages.push(`Nhóm **${winner}** đã thành công!`);
    }

    // 4. TÍNH ĐIỂM THAY ĐỔI CƠ BẢN
    activePlayers.forEach(p => {
        let change = 0;
        if (results.isDraw) {
            change = 1;
        } else {
            if (p.chosenAction === winner) {
                change = 2;
                results.roundWinners.push(p.id);
            } else if (p.chosenAction === 'Quan Sát') {
                change = 3;
            } else {
                change = -1;
            }
        }
        if(decrees.some(d => d.id === 'GIA_CUA_SU_THO_O') && p.chosenAction === 'Quan Sát'){
            change = -votes['Phá Hoại'];
        }
        results.scoreChanges[p.id] = change * pointMultiplier;
    });

    // 5. ÁP DỤNG ĐIỂM VÀ CÁC HIỆU ỨNG CUỐI VÒNG
    activePlayers.forEach(p => {
        let finalChange = results.scoreChanges[p.id] || 0;

        if (p.roleId === 'PHANTOM') finalChange = 1; // Nội tại Bóng Ma

        const mimic = gs.players.find(m => m.roleId === 'MIMIC' && m.skillUsedThisRound && m.id === p.id);
        if (mimic) {
            const target = gs.players.find(t => t.id === mimic.mimicTargetId);
            finalChange = results.scoreChanges[target.id] || 0;
        }

        const thief = gs.players.find(t => t.roleId === 'THIEF' && t.skillUsedThisRound && t.thiefTargetId === p.id);
        if (thief && finalChange > 0) {
            const stolen = Math.floor(finalChange / 2);
            finalChange -= stolen;
            thief.score += stolen;
        }
        
        const phantom = gs.players.find(ph => ph.roleId === 'PHANTOM' && ph.skillUsedThisRound && ph.hauntTargetId === p.id);
        if (phantom && finalChange > 0) {
            finalChange -= 1;
            phantom.score += 1;
            phantom.hauntSuccessCount = (phantom.hauntSuccessCount || 0) + 1;
            phantom.freeHaunt = true;
        }

        if (p.isBlessed && finalChange < 0) finalChange = 0;

        p.score += finalChange;

        // Các nội tại khác
        if (p.roleId === 'MAGNATE') { if (p.score > 0) p.score++; else if (p.score < 0) p.score--; }
        if (p.roleId === 'PEACEMAKER' && results.isDraw) p.score++;
        if (p.roleId === 'DOUBLE_AGENT' && !results.isDraw && !results.roundWinners.includes(p.id)) p.score++;
        if (p.roleId === 'THIEF') {
            const losers = activePlayers.filter(pl => (results.scoreChanges[pl.id] || 0) < 0).length;
            if (losers >= 2) p.score += Math.floor(losers / 2);
        }
    });

    // 6. ÁP DỤNG HIỆU ỨNG TIẾNG VỌNG CUỐI CÙNG
    decrees.forEach(d => {
        if (d.endOfRoundEffect) d.endOfRoundEffect(gs, results, pointMultiplier, rooms, io);
    });

    gs.roundData.lastScoreChanges = results.scoreChanges;
    io.to(roomCode).emit('roundResult', { players: gs.players, results, finalVoteCounts: votes });
    handlePostRoundEvents(roomCode, rooms, io);
}

function handlePostRoundEvents(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    // Cập nhật các trạng thái cho vai trò sau mỗi vòng
    gs.players.forEach(p => {
        if (!p.isDefeated) {
            if (p.score < 0) p.hasBeenNegative = true;
            if (p.score === 7) p.hasReached7 = true;
            if (p.score === -7) p.hasReachedMinus7 = true;
            if (gs.roundData.roundWinners?.includes(p.id) && gs.roundData.roundWinners.length === 1) {
                p.loneWolfWins = (p.loneWolfWins || 0) + 1;
            }
        }
    });

    const winnersByScore = gs.players.filter(p => p.score >= gs.winScore);
    const losersByScore = gs.players.filter(p => p.score <= gs.loseScore);
    const winnerByRole = checkRoleVictory(gs);

    if (winnerByRole || winnersByScore.length > 0 || losersByScore.length > 0) {
        gs.phase = 'gameover';
        let winner = winnersByScore[0] || winnerByRole;
        let loser = losersByScore[0];
        
        if (winnerByRole) {
            winner = winnerByRole;
            winner.reason = `đã hoàn thành Thiên Mệnh "${ROLES[winner.roleId].name}"!`;
        }
        io.to(roomCode).emit('gameOver', { winner, loser });
    } else {
        io.to(rooms[roomCode].hostId).emit('promptNextRound');
    }
}

// ==========================================================
// --- IV. HÀM XỬ LÝ HÀNH ĐỘNG & KỸ NĂNG ---
// ==========================================================

/**
 * Xử lý khi người chơi thực hiện hành động trong giai đoạn Hoàng Hôn.
 */
function handleChaosAction(roomCode, initiatorId, targetId, actionType, guess, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'chaos') return;
    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target) return;

    let msg = "";
    const multi = gs.roundData.decrees?.reduce((m, d) => m * (d.getPointMultiplier ? d.getPointMultiplier() : 1), 1) || 1;

    if (actionType === 'Vạch Trần') {
        const success = guess === target.chosenAction;
        if (success) {
             initiator.successfulChallenges = (initiator.successfulChallenges || 0) + 1;
             initiator.consecutiveChallenges = (initiator.consecutiveChallenges || 0) + 1;
             if (initiator.roleId === 'INQUISITOR' && target.chosenAction === 'Phá Hoại') initiator.score++; // Nội tại Kẻ Phán Xử
        } else {
            initiator.consecutiveChallenges = 0; // Reset chuỗi thắng
        }

        msg = `🔥 **${initiator.name}** đã Vạch Trần **${target.name}** và phán đoán **${success ? "ĐÚNG" : "SAI"}**!`;
        let change = 2 * multi;
        
        // Nội tại Nhà Tiên Tri
        if (!success && initiator.roleId === 'PROPHET') change = 1 * multi;
        
        // Hiệu ứng Sát Thủ
        if (success && target.id === initiator.bountyTargetId) {
             target.score = Math.floor(target.score / 2);
        } else if (success && target.id === target.bountyTargetId) {
            change *= 2; // Người khác vạch trần mục tiêu của Sát Thủ
        }

        if (success) { initiator.score += change; target.score -= change; }
        else { initiator.score -= change; target.score += change; }
    } else if (actionType === 'Phối Hợp') {
        const success = initiator.chosenAction === target.chosenAction;
        msg = `🤝 **${initiator.name}** đã Phối Hợp với **${target.name}** và **${success ? "thành công" : "thất bại"}**!`;
        if (success) gs.roundData.chaosResult = { actionType, success, actionToReduce: initiator.chosenAction };
        else initiator.score -= multi;
    }
    
    io.to(roomCode).emit('updatePlayerCards', [{id: initiator.id, score: initiator.score}, {id: target.id, score: target.score}]);
    endChaosPhase(roomCode, msg, rooms, io);
}

/**
 * Xử lý yêu cầu sử dụng kỹ năng của người chơi.
 */
function handleUseSkill(socket, roomCode, payload, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === socket.id);
    if (!player || player.isDefeated) return;

    if (gs.roundData.decrees?.some(d => d.id === 'DEM_CAM_LANG')) {
        return io.to(player.id).emit('logMessage', { type: 'error', message: 'Kỹ năng đã bị vô hiệu hóa bởi Đêm Câm Lặng!' });
    }
    if (player.skillUsedThisRound) {
        return io.to(player.id).emit('logMessage', { type: 'error', message: 'Bạn đã dùng kỹ năng trong đêm nay rồi.' });
    }

    // Tính chi phí
    let cost = SKILL_COSTS[player.skillUses] || SKILL_COSTS[SKILL_COSTS.length - 1];
    if (player.roleId === 'PHANTOM' && player.freeHaunt) { cost = 0; player.freeHaunt = false; }
    if (player.roleId === 'MIMIC') { cost = 2; }

    if (player.score < cost) {
        return io.to(player.id).emit('logMessage', {type: 'error', message: `Không đủ Tiến Độ để dùng kỹ năng (cần ${cost})!`});
    }
    player.score -= cost;
    player.skillUsedThisRound = true;

    let message = '';
    let targetPlayer;

    switch(player.roleId) {
        case 'PROPHET':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer) {
                const action = targetPlayer.chosenAction || 'Chưa chọn';
                io.to(player.id).emit('privateInfo', { title: 'Thiên Lý Nhãn', text: `Hành động của ${targetPlayer.name} là: **${action}**.` });
            }
            break;
        case 'PEACEMAKER':
             // Kỹ năng này cần một phase đặc biệt, tạm thời log ra trước
             message = `${player.name} đã dùng Hòa Giải...`;
             break;
        case 'INQUISITOR':
            const sabotageCount = gs.players.filter(p => p.chosenAction === 'Phá Hoại').length;
            gs.players.forEach(p => {
                if(p.chosenAction === 'Phá Hoại'){
                    p.score -= sabotageCount;
                }
            });
            message = `⚖️ **${player.name}** thực thi PHÁN QUYẾT! ${sabotageCount} kẻ Phá Hoại đã bị trừng phạt!`;
            io.to(roomCode).emit('updatePlayerCards', gs.players.map(p => ({id: p.id, score: p.score})));
            break;
        case 'REBEL':
             if (gs.roundData.roundWinners?.includes(player.id) && gs.roundData.roundWinners.length === 1) {
                targetPlayer = gs.players.find(p => p.id === payload.targetId);
                if(targetPlayer){
                    const damage = cost > 0 ? cost : 1;
                    targetPlayer.score -= damage;
                    message = `🔥 ${player.name} đã dùng Khiêu Khích, trừng phạt ${targetPlayer.name}!`;
                    io.to(roomCode).emit('updatePlayerCards', [{id: targetPlayer.id, score: targetPlayer.score}]);
                }
             }
             break;
        case 'PRIEST':
            targetPlayer = gs.players.find(p => p.id === payload.targetId);
            if (targetPlayer) {
                targetPlayer.isBlessed = true;
                message = `🙏 ${player.name} đã ban phước cho một người trong bóng tối...`;
            }
            break;
        case 'THIEF':
            player.thiefTargetId = payload.targetId; // Lưu lại để dùng trong calculateScores
            message = `${player.name} đã nhắm vào một mục tiêu...`;
            break;
        case 'MIND_BREAKER':
            // Yêu cầu client hiển thị modal chọn hành động cho Kẻ Tẩy Não
            io.to(player.id).emit('promptMindControl', { targetId: payload.targetId });
            message = `${player.name} đang cố gắng điều khiển tâm trí của người khác...`;
            break;
        case 'CULTIST':
             player.score -= 2; // Chi phí cố định
             const effect = Math.floor(Math.random() * 3);
             if(effect === 0) message = `${player.name} đã thực hiện nghi thức và nhìn thấy một vai trò!`;
             if(effect === 1) message = `${player.name} đã thực hiện nghi thức và vô hiệu hóa một kỹ năng!`;
             if(effect === 2) message = `${player.name} đã thực hiện nghi thức và tăng cường lá phiếu!`;
             break;
        case 'PHANTOM':
             player.hauntTargetId = payload.targetId;
             message = `👻 ${player.name} đã ám một người...`;
             break;
        case 'MIMIC':
            // Logic phức tạp này được xử lý bởi client, server chỉ cần biết là kỹ năng đã được dùng
            message = `${player.name} đã sao chép một năng lực!`;
            break;
    }

    if (cost > 0) io.to(player.id).emit('privateInfo', {title:'Kỹ Năng', text:`Bạn đã trả ${cost} Tiến Độ để sử dụng.`});
    player.skillUses++;
    io.to(roomCode).emit('updatePlayerCards', [{id: player.id, score: player.score}]);
    if (message) io.to(roomCode).emit('logMessage', { type: 'info', message });
}


// ==========================================================
// --- V. HÀM KIỂM TRA ĐIỀU KIỆN & TIỆN ÍCH ---
// ==========================================================

function checkRoleVictory(gs) {
    for (const player of gs.players) {
        if (player.isDefeated) continue;
        let isWinner = false;
        switch (player.roleId) {
            case 'PROPHET':
                isWinner = player.consecutiveChallenges >= 3 && player.score >= (gs.winScore * 2/3);
                break;
            case 'PEACEMAKER':
                isWinner = gs.consecutiveDraws >= 3;
                break;
            case 'GAMBLER':
                isWinner = player.hasReached7 && player.hasReachedMinus7;
                break;
            case 'INQUISITOR': case 'THIEF': case 'ASSASSIN':
                isWinner = player.score >= 15;
                break;
            case 'MAGNATE': case 'DOUBLE_AGENT':
                isWinner = player.score >= gs.winScore; // 20, 25, or 30
                break;
            case 'BALANCER':
                const activePlayers = gs.players.filter(p => !p.isDefeated);
                const positiveSum = activePlayers.filter(p => p.score > 0).reduce((sum, p) => sum + p.score, 0);
                const negativeSum = activePlayers.filter(p => p.score < 0).reduce((sum, p) => sum + p.score, 0);
                isWinner = positiveSum > 0 && activePlayers.every(p=>p.score !== 0) && positiveSum === -negativeSum;
                break;
            case 'REBEL':
                isWinner = player.loneWolfWins >= 3;
                break;
            case 'PRIEST':
                isWinner = player.score >= gs.winScore;
                break;
            case 'MIND_BREAKER':
                isWinner = (gs.failedChallengesCount || 0) >= 5;
                break;
            case 'CULTIST':
                isWinner = player.score <= -15;
                break;
            case 'PHANTOM':
                isWinner = (player.hauntSuccessCount || 0) >= 5;
                break;
            case 'MIMIC':
                isWinner = player.score >= gs.winScore;
                break;
        }
        if (isWinner) return player;
    }
    return null;
}

/**
 * Hàm con, kiểm tra điều kiện thắng cho MỘT người chơi cụ thể.
 * Được tách ra để có thể gọi đệ quy (ví dụ: Kẻ Thao Túng kiểm tra Con Rối).
 * @param {Object} gs - GameState hiện tại.
 * @param {Object} player - Người chơi cần kiểm tra.
 * @returns {boolean} - True nếu người chơi này thắng, ngược lại là false.
 */
function checkRoleVictorySingle(gs, player) {
    if (!player || player.isDefeated) return false;

    switch (player.roleId) {
        case 'SURVIVOR':
            const otherPlayers = gs.players.filter(p => p.id !== player.id && !p.isDefeated);
            // Điều kiện: có người khác còn sống, tất cả họ đã từng âm điểm, và bản thân thì chưa.
            return otherPlayers.length > 0 && otherPlayers.every(p => p.hasBeenNegative) && !player.hasBeenNegative;
        
        case 'PROPHET':
            return player.successfulChallenges >= 3;
        
        case 'PEACEMAKER':
            return gs.consecutiveDraws >= 3;
        
        case 'SAINT':
            return player.score >= 10 && player.neverSabotaged;
        
        case 'TURNCOAT':
            // recentActions là một mảng, ví dụ: ['Giải Mã', 'Phá Hoại', 'Quan Sát']
            // Dùng Set để lấy các giá trị duy nhất. Nếu size của Set là 3, tức là đã dùng đủ 3 hành động.
            return player.score >= 12 && new Set(player.recentActions).size === 3;
        
        case 'GAMBLER':
            return player.hasReached7 && player.hasReachedMinus7;
        
        case 'MAGNATE':
            return player.score >= 20;
        
        case 'JEALOUS':
            // Tìm những người có điểm cao hơn.
            const higherPlayers = gs.players.filter(p => p.score > player.score && !p.isDefeated);
            // Điều kiện: Phải có người cao điểm hơn, và TẤT CẢ họ đều bị trừ điểm trong vòng vừa rồi.
            return higherPlayers.length > 0 && higherPlayers.every(p => (gs.roundData.lastScoreChanges[p.id] || 0) < 0);
        
        case 'BALANCER':
            const positivePlayers = gs.players.filter(p => p.score > 0).length;
            const negativePlayers = gs.players.filter(p => p.score < 0).length;
            // Điều kiện: Phải có người điểm dương, và số người dương bằng số người âm.
            return positivePlayers > 0 && positivePlayers === negativePlayers;
        
        case 'REBEL':
            return player.loneWolfWins >= 3;
        
        case 'OUTLAW': case 'INQUISITOR':
            return player.score >= 15;
        
        case 'ASSASSIN':
            return player.score >= 15 && player.successfulAssassination;
        
        case 'PUPPETEER':
            const puppet = gs.players.find(p => p.id === player.puppetId);
            if (!puppet) return false;
            // Điều kiện thắng của Kẻ Thao Túng là Con Rối của họ thắng.
            // Có thể thắng bằng điểm, hoặc thắng bằng vai trò riêng của Con Rối (gọi đệ quy).
            return (puppet.score >= gs.winScore) || checkRoleVictorySingle(gs, puppet);

        // Các vai trò khác (như Thầy Tế) không có điều kiện thắng riêng.
        default:
            return false;
    }
}

/**
 * Lấy danh sách người chơi có điểm cao nhất hoặc thấp nhất.
 * @param {Array} players - Mảng người chơi.
 * @param {'highest' | 'lowest'} type - Loại cần tìm.
 * @returns {Array} - Mảng người chơi thỏa mãn.
 */
function getPlayersByScore(players, type) {
    const activePlayers = players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return [];
    
    const scores = activePlayers.map(p => p.score);
    const criticalScore = type === 'highest' ? Math.max(...scores) : Math.min(...scores);
    
    return activePlayers.filter(p => p.score === criticalScore);
}


// --- LOGIC CHO BOT (Trí tuệ nhân tạo) ---
// Tách logic AI ra đây để giữ cho các hàm luồng game sạch sẽ.

/**
 * Kích hoạt hành động cho các bot trong giai đoạn Lựa Chọn.
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function triggerBotChoices(roomCode, rooms, io) {
    rooms[roomCode]?.gameState?.players.forEach(p => {
        if (p.isBot && !p.isDefeated) {
            // Bot sẽ chọn sau một khoảng thời gian ngẫu nhiên để mô phỏng người thật.
            setTimeout(() => {
                if (!p.chosenAction) {
                    let choice;
                    // Hành vi của bot dựa trên "tính cách" được gán lúc tạo.
                    switch(p.personality) {
                        case 'aggressive': // Ưu tiên Phá Hoại
                            choice = Math.random() < 0.7 ? 'Phá Hoại' : 'Giải Mã';
                            break;
                        case 'cautious': // Ưu tiên Giải Mã và Quan Sát
                            choice = Math.random() < 0.75 ? 'Giải Mã' : 'Quan Sát';
                            break;
                        default: // Ngẫu nhiên hoàn toàn
                            choice = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                    }
                    handlePlayerChoice(roomCode, p.id, choice, rooms, io);
                }
            }, Math.random() * 5000 + 2000); // Chọn sau 2-7 giây
        }
    });
}

/**
 * Kích hoạt hành động cho các bot trong giai đoạn Hoàng Hôn.
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function triggerBotChaosAction(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;

    const bots = gs.players.filter(p => p.isBot && !p.isDefeated);
    const potentialTargets = gs.players.filter(p => !p.isDefeated);
    if (bots.length === 0 || potentialTargets.length < 2) return;

    bots.forEach(bot => {
        setTimeout(() => {
            // Kiểm tra lại trạng thái trước khi hành động, vì có thể người khác đã kết thúc phase
            if (gs.phase !== 'chaos') return;

            const validTargets = potentialTargets.filter(p => p.id !== bot.id);
            if (validTargets.length === 0) return;

            const target = validTargets[Math.floor(Math.random() * validTargets.length)];
            const actionProbability = bot.personality === 'aggressive' ? 0.6 : (bot.personality === 'cautious' ? 0.3 : 0.4);

            if (Math.random() < actionProbability) {
                // Bot hiếu chiến sẽ ưu tiên Vạch Trần, bot cẩn trọng ưu tiên Phối Hợp.
                const actionType = (bot.personality === 'cautious' && Math.random() < 0.8) ? 'Phối Hợp' : 'Vạch Trần';
                
                if (actionType === 'Vạch Trần') {
                    const guess = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                    handleChaosAction(roomCode, bot.id, target.id, 'Vạch Trần', guess, rooms, io);
                } else {
                    handleChaosAction(roomCode, bot.id, target.id, 'Phối Hợp', null, rooms, io);
                }
            } else {
                // Đôi khi bot sẽ chọn bỏ qua
                gs.roundData.votesToSkip.add(bot.id);
                io.to(roomCode).emit('updateSkipVoteCount', gs.roundData.votesToSkip.size, potentialTargets.length);
            }
        }, Math.random() * 10000 + 5000); // Hành động sau 5-15 giây
    });
}

/**
 * Xử lý hành động Bùa Lú Lẫn của Bot (nếu nó rút phải Tiếng Vọng này).
 * @param {string} roomCode
 * @param {string} botId
 * @param {Object} rooms
 * @param {Server} io
 */
function handleBotAmnesia(roomCode, botId, rooms, io) {
    const gs = rooms[roomCode].gameState;
    const bot = gs.players.find(p => p.id === botId);
    io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 ${bot.name} (Bot) đang sử dụng Bùa Lú Lẫn...` });

    setTimeout(() => {
        const activePlayers = gs.players.filter(p => !p.isDefeated);
        if (activePlayers.length < 2) {
            startChaosPhase(roomCode, rooms, io); // Không đủ người để hoán đổi
            return;
        }
        
        // Chọn ngẫu nhiên 2 người khác nhau
        let p1Idx = Math.floor(Math.random() * activePlayers.length);
        let p2Idx;
        do {
            p2Idx = Math.floor(Math.random() * activePlayers.length);
        } while (p1Idx === p2Idx);
        
        const p1 = activePlayers[p1Idx];
        const p2 = activePlayers[p2Idx];
        
        // Hoán đổi hành động
        [p1.chosenAction, p2.chosenAction] = [p2.chosenAction, p1.chosenAction];
        
        io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 Hành động của **${p1.name}** và **${p2.name}** đã bị hoán đổi!` });
        startChaosPhase(roomCode, rooms, io); // Tiếp tục sang giai đoạn Hoàng Hôn
    }, 3000); // Giả vờ suy nghĩ 3 giây
}


// --- VI. EXPORTS ---
module.exports = {
    createGameState,
    startNewRound,
    handlePlayerChoice, 
    revealDecreeAndContinue,
    handleChaosAction,
    handleUseSkill,
    checkRoleVictory,
    handleBotAmnesia
};