// game/logic.js
// ======================================================================
// THỢ SĂN CỔ VẬT - CORE GAME LOGIC
// Chứa "bộ não" của game: tạo trạng thái, xử lý vòng chơi, tính toán, kiểm tra chiến thắng.
// ======================================================================

const { DECREES, ROLES, ALL_DECREE_IDS, ALL_ROLE_IDS, CHOICE_DURATION, CHAOS_DURATION, DECREE_REVEAL_DELAY } = require('./config');

// --- I. HÀM KHỞI TẠO VÀ CÀI ĐẶT GAME ---

/**
 * Tạo trạng thái ban đầu cho một ván game mới.
 * @param {Array} players - Mảng người chơi từ phòng chờ.
 * @returns {Object} - Trạng thái game (gameState).
 */
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

    const gameState = {
        players: players.map((p, index) => ({
            ...p,
            score: 0,
            chosenAction: null,
            skillUsed: 0,
            roleId: rolesToAssign[index % rolesToAssign.length],
            hasBeenNegative: false,
            successfulChallenges: 0,
            neverSabotaged: true,
            recentActions: [],
            hasReached7: false,
            hasReachedMinus7: false,
            successfulAssassination: false,
            loneWolfWins: 0,
            puppetId: null,
        })),
        currentRound: 0,
        winScore,
        loseScore,
        phase: 'waiting',
        roundData: {},
        decreeDeck: [],
        decreeDiscard: [],
        consecutiveDraws: 0,
    };

    const puppeteer = gameState.players.find(p => p.roleId === 'PUPPETEER');
    if (puppeteer) {
        const potentialPuppets = gameState.players.filter(p => p.id !== puppeteer.id);
        if (potentialPuppets.length > 0) puppeteer.puppetId = potentialPuppets[Math.floor(Math.random() * potentialPuppets.length)].id;
    }

    shuffleDecreeDeck(gameState);
    return gameState;
}

/**
 * Xáo trộn bộ bài Tiếng Vọng.
 * @param {Object} gs - GameState hiện tại.
 */
function shuffleDecreeDeck(gs) {
    gs.decreeDeck = [...ALL_DECREE_IDS];
    for (let i = gs.decreeDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gs.decreeDeck[i], gs.decreeDeck[j]] = [gs.decreeDeck[j], gs.decreeDeck[i]];
    }
    gs.decreeDiscard = [];
}

// --- II. HÀM XỬ LÝ LUỒNG CHƠI (ROUND FLOW) ---

/**
 * Bắt đầu một vòng chơi mới.
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function startNewRound(roomCode, rooms, io) {
    const room = rooms[roomCode];
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    gs.currentRound++;
    gs.phase = 'choice';
    gs.players.forEach(p => { if (!p.isDefeated) p.chosenAction = null; });
    gs.roundData = { decrees: [], chaosActionTaken: false, chaosResult: null, chaosTimer: null, drawerId: null, votesToSkip: new Set(), choiceTimer: null, skillActivations: {}, roundWinners: [] };

    io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound,
        players: gs.players.map(({ id, name, score, isDefeated, disconnected }) => ({ id, name, score, isDefeated, disconnected })),
        duration: CHOICE_DURATION
    });

    gs.roundData.choiceTimer = setTimeout(() => {
        gs.players.forEach(p => {
            if (!p.chosenAction && !p.isDefeated) {
                const choices = ['Giải Mã', 'Phá Hoại', 'Quan Sát'];
                handlePlayerChoice(roomCode, p.id, choices[Math.floor(Math.random() * 3)], rooms, io);
            }
        });
    }, CHOICE_DURATION * 1000);
    triggerBotChoices(roomCode, rooms, io);
}

/**
 * Công bố Tiếng Vọng và tiếp tục sang giai đoạn Hoàng Hôn (Chaos).
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function revealDecreeAndContinue(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    gs.phase = 'decree';
    if (gs.currentRound === 1) {
        io.to(roomCode).emit('logMessage', { type: 'info', message: "Đêm đầu tiên yên tĩnh, không có Tiếng Vọng." });
        startChaosPhase(roomCode, rooms, io);
        return;
    }

    if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
    const lowest = getPlayersByScore(gs.players, 'lowest');
    const drawer = lowest[Math.floor(Math.random() * lowest.length)];
    gs.roundData.drawerId = drawer.id;
    const decreeId = gs.decreeDeck.pop();
    gs.decreeDiscard.push(decreeId);
    gs.roundData.decree = { ...DECREES[decreeId], id: decreeId };
    io.to(roomCode).emit('decreeRevealed', { drawerName: drawer.name, decrees: [gs.roundData.decree].map(d => ({ name: d.name, description: d.description })) });

    setTimeout(() => {
        let continueToChaos = true;
        if (gs.roundData.decree.onReveal) {
            // Hàm onReveal cần được sửa để nhận đủ tham số
            gs.roundData.decree.onReveal(gs, io, roomCode, drawer.id, rooms); 
            if (gs.phase === 'special_action') continueToChaos = false;
        }
        if (continueToChaos) startChaosPhase(roomCode, rooms, io);
    }, DECREE_REVEAL_DELAY);
}

/**
 * Bắt đầu giai đoạn Hoàng Hôn (Chaos).
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function startChaosPhase(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    if (gs.roundData.decree?.isChaosDisabled) {
        endChaosPhase(roomCode, `Tiếng Vọng '${gs.roundData.decree.name}' khiến mọi hành động phải dừng lại!`, rooms, io);
        return;
    }
    gs.phase = 'chaos';
    io.to(roomCode).emit('chaosPhaseStarted', { duration: CHAOS_DURATION });
    gs.roundData.chaosTimer = setTimeout(() => endChaosPhase(roomCode, "Hết giờ, không có hành động nào diễn ra.", rooms, io), CHAOS_DURATION * 1000);
    triggerBotChaosAction(roomCode, rooms, io);
}

/**
 * Kết thúc giai đoạn Hoàng Hôn.
 * @param {string} roomCode
 * @param {string} message
 * @param {Object} rooms
 * @param {Server} io
 */
function endChaosPhase(roomCode, message, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'chaos' || gs.roundData.chaosActionTaken) return;
    gs.roundData.chaosActionTaken = true;
    gs.phase = 'reveal_pending';
    clearTimeout(gs.roundData.chaosTimer);
    io.to(roomCode).emit('chaosActionResolved', { message });
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 3000);
}

/**
 * Tính toán điểm số và kết thúc vòng.
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function calculateScoresAndEndRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.phase = 'reveal';
    const { decree, chaosResult, skillActivations } = gs.roundData;
    const results = { messages: [], scoreChanges: {}, isDraw: false, winner: null };
    const pointMultiplier = decree?.getPointMultiplier?.() || 1;
    const active = gs.players.filter(p => !p.isDefeated);
    if (active.length === 0) return;

    const votes = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
    active.forEach(p => { if (p.chosenAction) votes[p.chosenAction]++; });
    if (chaosResult?.success && chaosResult.actionType === 'Phối Hợp') {
        if (votes[chaosResult.actionToReduce] > 0) {
            votes[chaosResult.actionToReduce]--;
            results.messages.push("🤝 Phối Hợp thành công, một hành động được che giấu!");
        }
    }
    if (skillActivations?.SAINT) {
        const saint = gs.players.find(p => p.id === skillActivations.SAINT.playerId);
        if (saint && saint.chosenAction === 'Giải Mã') {
            votes['Giải Mã']++;
            results.messages.push(`✨ **Thánh Quang Hộ Thể** của ${saint.name} đã tăng cường phe Giải Mã!`);
        }
    }

    const { 'Giải Mã': c, 'Phá Hoại': t, 'Quan Sát': pt } = votes;
    const totalVotes = c + t + pt;
    let isDraw = (c === t && c > 0) || (active.length > 1 && (c === 0 || t === 0)) || (pt > 0 && c === 0 && t === 0);

    results.isDraw = isDraw;
    if (isDraw) {
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả đêm nay là **HÒA**!");
    } else {
        gs.consecutiveDraws = 0;
        let winner = decree?.determineWinner ? decree.determineWinner(c, t) : (c < t ? 'Phá Hoại' : 'Giải Mã');
        results.winner = winner;
        if (decree?.determineWinner) results.messages.push(`📜 Tiếng Vọng '${decree.name}' có hiệu lực!`);
        results.messages.push(`Nhóm **${winner}** đã thành công!`);
    }

    // Tính điểm cơ bản
    active.forEach(p => {
        let change = 0;
        if (isDraw) {
            change = pt > 0 ? (p.chosenAction === 'Quan Sát' ? -1 : 1) : -1;
        } else {
            if (p.chosenAction === results.winner) {
    change = 2;
    gs.roundData.roundWinners.push(p.id);
            } else if (p.chosenAction === 'Quan Sát') {
                change = 3;
            } else {
                change = -1; // Người thua phe
            }
        }
        results.scoreChanges[p.id] = change * pointMultiplier;
    });

    // Áp dụng điểm
    active.forEach(p => p.score += (results.scoreChanges[p.id] || 0));

    // Hiệu ứng cuối vòng (ví dụ: Nhà Tài Phiệt, Kẻ Ngoại Pháp)
    active.forEach(p => {
        if (p.roleId === 'MAGNATE') {
            if (p.score > 0) p.score++;
            else if (p.score < 0) p.score--;
        }
        if (p.roleId === 'OUTLAW' && decree) {
            const change = results.scoreChanges[p.id] || 0;
            if (change < 0) p.score -= change; // Hồi lại điểm đã mất
        }
    });

    gs.roundData.lastScoreChanges = results.scoreChanges;
    io.to(roomCode).emit('roundResult', { players: gs.players, results, finalVoteCounts: votes });
    handlePostRoundEvents(roomCode, rooms, io);
}

/**
 * Xử lý các sự kiện sau khi vòng chơi kết thúc (kiểm tra thắng/thua).
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function handlePostRoundEvents(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    // Cập nhật các trạng thái cho vai trò
    gs.players.forEach(p => {
        if (p.score < 0) p.hasBeenNegative = true;
        if (p.score === 7) p.hasReached7 = true;
        if (p.score === -7) p.hasReachedMinus7 = true;
        if (gs.roundData.roundWinners.includes(p.id) && gs.roundData.roundWinners.length === 1) {
            p.loneWolfWins++;
        }
    });

    const W = gs.players.filter(p => p.score >= gs.winScore),
          L = gs.players.filter(p => p.score <= gs.loseScore);
    const roleWinner = checkRoleVictory(gs);

    if (roleWinner || W.length > 0 || L.length > 0) {
        gs.phase = 'gameover';
        let winner = W[0];
        let loser = L[0];
        if (roleWinner) {
            winner = roleWinner;
            winner.reason = `đã hoàn thành Thiên Mệnh "${ROLES[winner.roleId].name}"!`;
        }
        io.to(roomCode).emit('gameOver', { winner, loser });
    } else {
        io.to(rooms[roomCode].hostId).emit('promptNextRound');
    }
}


// --- III. HÀM XỬ LÝ HÀNH ĐỘNG NGƯỜI CHƠI & BOT ---

/**
 * Xử lý khi người chơi đưa ra lựa chọn hành động.
 * @param {string} roomCode
 * @param {string} playerId
 * @param {string} choice
 * @param {Object} rooms
 * @param {Server} io
 */
function handlePlayerChoice(roomCode, playerId, choice, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'choice') return;
    const p = gs.players.find(p => p.id === playerId);
    if (p && !p.chosenAction) {
        p.chosenAction = choice;
        if (choice === 'Phá Hoại') p.neverSabotaged = false;
        p.recentActions.push(choice);
        if (p.recentActions.length > 3) p.recentActions.shift();
        io.to(roomCode).emit('playerChose', playerId);
    }
    if (gs.players.filter(p => !p.isDefeated).every(p => p.chosenAction)) {
        clearTimeout(gs.roundData.choiceTimer);
        revealDecreeAndContinue(roomCode, rooms, io);
    }
}

/**
 * Xử lý khi người chơi thực hiện hành động trong giai đoạn Hoàng Hôn.
 * @param {string} roomCode
 * @param {string} initiatorId
 * @param {string} targetId
 * @param {string} actionType
 * @param {string|null} guess
 * @param {Object} rooms
 * @param {Server} io
 */
function handleChaosAction(roomCode, initiatorId, targetId, actionType, guess, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'chaos' || gs.roundData.chaosActionTaken) return;
    const i = gs.players.find(p => p.id === initiatorId),
          t = gs.players.find(p => p.id === targetId);
    if (!i || !t) return;

    let msg = "";
    const multi = gs.roundData.decree?.getPointMultiplier?.() || 1;

    if (actionType === 'Vạch Trần') {
        const success = guess === t.chosenAction;
        if (success) i.successfulChallenges++;
        msg = `🔥 **${i.name}** đã Vạch Trần **${t.name}** và ${success ? "phán đoán **ĐÚNG**" : "phán đoán **SAI**"}!`;
        const change = 2 * multi;
        if (success) { i.score += change; t.score -= change; }
        else { i.score -= change; t.score += change; }
    } else if (actionType === 'Phối Hợp') {
        const success = i.chosenAction === t.chosenAction;
        msg = `🤝 **${i.name}** đã Phối Hợp với **${t.name}** và ${success ? "**thành công**" : "**thất bại**"}!`;
        if (success) gs.roundData.chaosResult = { actionType, success, actionToReduce: i.chosenAction };
        else i.score -= multi;
    }

    endChaosPhase(roomCode, msg, rooms, io);
}

/**
 * Kích hoạt hành động cho các bot trong giai đoạn Lựa Chọn.
 * @param {string} roomCode
 * @param {Object} rooms
 * @param {Server} io
 */
function triggerBotChoices(roomCode, rooms, io) {
    rooms[roomCode]?.gameState?.players.forEach(p => {
        if (p.isBot && !p.isDefeated) {
            setTimeout(() => {
                if (!p.chosenAction) {
                    let choice;
                    switch(p.personality) {
                        case 'aggressive': choice = Math.random() < 0.7 ? 'Phá Hoại' : 'Giải Mã'; break;
                        case 'cautious': choice = Math.random() < 0.75 ? 'Giải Mã' : 'Quan Sát'; break;
                        default: choice = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                    }
                    handlePlayerChoice(roomCode, p.id, choice, rooms, io);
                }
            }, Math.random() * 2000 + 1500);
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
    const targets = gs.players.filter(p => !p.isDefeated);
    if (bots.length === 0 || targets.length < 2) return;

    bots.forEach(bot => {
        setTimeout(() => {
            if (gs.phase !== 'chaos' || gs.roundData.chaosActionTaken) return;
            const candidates = targets.filter(p => p.id !== bot.id);
            if (candidates.length === 0) return;
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            const actionProbability = bot.personality === 'aggressive' ? 0.6 : (bot.personality === 'cautious' ? 0.3 : 0.4);
            if (Math.random() < actionProbability) {
                const actionType = (bot.personality === 'cautious' && Math.random() < 0.8) ? 'Phối Hợp' : 'Vạch Trần';
                if (actionType === 'Vạch Trần') {
                    const guess = ['Giải Mã', 'Phá Hoại', 'Quan Sát'][Math.floor(Math.random() * 3)];
                    handleChaosAction(roomCode, bot.id, target.id, 'Vạch Trần', guess, rooms, io);
                } else {
                    handleChaosAction(roomCode, bot.id, target.id, 'Phối Hợp', null, rooms, io);
                }
            } else if (Math.random() < 0.5) {
                io.to(roomCode).emit('playerVotedToSkip', roomCode, bot.id);
            }
        }, Math.random() * 10000 + 5000);
    });
}

/**
 * Xử lý hành động Bùa Lú Lẫn của Bot.
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
            startChaosPhase(roomCode, rooms, io);
            return;
        }
        let p1Idx = Math.floor(Math.random() * activePlayers.length);
        let p2Idx;
        do { p2Idx = Math.floor(Math.random() * activePlayers.length); } while (p1Idx === p2Idx);
        const p1 = activePlayers[p1Idx], p2 = activePlayers[p2Idx];
        [p1.chosenAction, p2.chosenAction] = [p2.chosenAction, p1.chosenAction];
        io.to(roomCode).emit('logMessage', { type: 'warning', message: `🧠 Hành động của **${p1.name}** và **${p2.name}** đã bị hoán đổi!` });
        startChaosPhase(roomCode, rooms, io);
    }, 3000);
}


// --- IV. HÀM TIỆN ÍCH VÀ KIỂM TRA ĐIỀU KIỆN ---

/**
 * Kiểm tra điều kiện thắng theo vai trò cho một người chơi cụ thể.
 * @param {Object} gs - GameState.
 * @param {Object} player - Người chơi cần kiểm tra.
 * @returns {boolean} - true nếu thắng, false nếu không.
 */
function checkRoleVictorySingle(gs, player) {
    if (!player || player.isDefeated) return false;
    switch (player.roleId) {
        case 'SURVIVOR':
            const others = gs.players.filter(p => p.id !== player.id && !p.isDefeated);
            return others.length > 0 && others.every(p => p.hasBeenNegative) && !player.hasBeenNegative;
        case 'PROPHET': return player.successfulChallenges >= 3;
        case 'PEACEMAKER': return gs.consecutiveDraws >= 3;
        case 'SAINT': return player.score >= 10 && player.neverSabotaged;
        case 'TURNCOAT':
            const uniqueActions = new Set(player.recentActions);
            return player.score >= 12 && uniqueActions.size === 3;
        case 'PUPPETEER':
            // Logic cho Kẻ Thao Túng được xử lý trong hàm checkRoleVictory tổng
            return false;
        case 'GAMBLER': return player.hasReached7 && player.hasReachedMinus7;
        case 'INQUISITOR': return player.score >= 15; // Giả sử kỹ năng được xử lý riêng
        case 'MAGNATE': return player.score >= 20;
        case 'JEALOUS':
            const higherPlayers = gs.players.filter(p => p.score > player.score && !p.isDefeated);
            return higherPlayers.length > 0 && higherPlayers.every(p => (gs.roundData.lastScoreChanges[p.id] || 0) < 0);
        case 'BALANCER':
            const positive = gs.players.filter(p => p.score > 0).length;
            const negative = gs.players.filter(p => p.score < 0).length;
            return positive > 0 && positive === negative;
        case 'REBEL': return player.loneWolfWins >= 3;
        case 'OUTLAW': return player.score >= 15;
        case 'ASSASSIN': return player.score >= 15 && player.successfulAssassination;
    }
    return false;
}

/**
 * Kiểm tra xem có ai thắng theo vai trò không.
 * @param {Object} gs - GameState.
 * @returns {Object|null} - Người chơi thắng hoặc null.
 */
function checkRoleVictory(gs) {
    for (const player of gs.players) {
        if (player.isDefeated) continue;
        if (checkRoleVictorySingle(gs, player)) return player;

        // Xử lý logic thắng riêng cho Kẻ Thao Túng
        if (player.roleId === 'PUPPETEER') {
            const puppet = gs.players.find(p => p.id === player.puppetId);
            if (puppet && (puppet.score >= gs.winScore || checkRoleVictorySingle(gs, puppet))) {
                return player;
            }
        }
    }
    return null;
}

/**
 * Lấy danh sách người chơi có điểm cao nhất hoặc thấp nhất.
 * @param {Array} players - Mảng người chơi.
 * @param {string} type - 'highest' hoặc 'lowest'.
 * @returns {Array} - Mảng người chơi thỏa mãn.
 */
function getPlayersByScore(players, type) {
    const activePlayers = players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return [];
    const scores = activePlayers.map(p => p.score);
    const criticalScore = type === 'highest' ? Math.max(...scores) : Math.min(...scores);
    return activePlayers.filter(p => p.score === criticalScore);
}

// --- V. EXPORT MODULES ---

module.exports = {
    // Khởi tạo và cài đặt
    createGameState,
    shuffleDecreeDeck,
    // Luồng chơi
    startNewRound,
    revealDecreeAndContinue,
    startChaosPhase,
    endChaosPhase,
    calculateScoresAndEndRound,
    handlePostRoundEvents,
    // Hành động người chơi & Bot
    handlePlayerChoice,
    handleChaosAction,
    triggerBotChoices,
    triggerBotChaosAction,
    handleBotAmnesia,
    // Tiện ích và kiểm tra
    checkRoleVictorySingle,
    checkRoleVictory,
    getPlayersByScore
};