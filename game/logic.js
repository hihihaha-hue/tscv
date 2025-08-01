// game/logic.js
// ======================================================================
// CORE GAME LOGIC ("The Brain")
// Chứa bộ não của game: tạo trạng thái, xử lý luồng vòng chơi, tính toán, và kiểm tra chiến thắng.
// ======================================================================

// --- I. IMPORTS & PHỤ THUỘC ---
// Import mọi thứ cần thiết từ file cấu hình.
const {
    DECREES, ROLES, ALL_DECREE_IDS, ALL_ROLE_IDS,
    CHOICE_DURATION, CHAOS_DURATION, DECREE_REVEAL_DELAY
} = require('./config');

// --- II. HÀM KHỞI TẠO & CÀI ĐẶT GAME ---

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

    // Xáo trộn và gán vai trò
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
            // Trạng thái cho các điều kiện thắng/kỹ năng
            hasBeenNegative: false,
            successfulChallenges: 0,
            neverSabotaged: true,
            recentActions: [],
            hasReached7: false,
            hasReachedMinus7: false,
            successfulAssassination: false,
            loneWolfWins: 0,
            puppetId: null,
            isBlessed: false,
            skillUsedThisRound: false,
        })),
        currentRound: 0,
        winScore,
        loseScore,
        phase: 'waiting', // các phase: waiting, choice, decree, chaos, reveal_pending, reveal, gameover
        roundData: {},
        decreeDeck: [],
        decreeDiscard: [],
        consecutiveDraws: 0,
        rolesInGame: rolesInThisGame, // Lưu lại các vai trò có trong ván
    };

    // Gán con rối cho Kẻ Thao Túng
    const puppeteer = gameState.players.find(p => p.roleId === 'PUPPETEER');
    if (puppeteer) {
        const potentialPuppets = gameState.players.filter(p => p.id !== puppeteer.id);
        if (potentialPuppets.length > 0) {
            puppeteer.puppetId = potentialPuppets[Math.floor(Math.random() * potentialPuppets.length)].id;
        }
    }

    shuffleDecreeDeck(gameState);
    return gameState;
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
    gs.roundData = { // Reset dữ liệu vòng
        decree: null,
        chaosResult: null,
        votesToSkip: new Set(),
        choiceTimer: null,
        chaosTimer: null,
    };

    // Reset trạng thái của người chơi cho vòng mới
    gs.players.forEach(p => {
        if (!p.isDefeated) {
            p.chosenAction = null;
            p.isBlessed = false;
            p.skillUsedThisRound = false;
        }
    });

    io.to(roomCode).emit('newRound', {
        roundNumber: gs.currentRound,
        players: gs.players, // Gửi toàn bộ dữ liệu người chơi
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

function revealDecreeAndContinue(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    gs.phase = 'decree';

    if (gs.currentRound === 1) {
        io.to(roomCode).emit('logMessage', { type: 'info', message: "Đêm đầu tiên yên tĩnh, không có Tiếng Vọng." });
        startChaosPhase(roomCode, rooms, io);
        return;
    }

    if (gs.decreeDeck.length === 0) shuffleDecreeDeck(gs);
    
    const lowestPlayers = getPlayersByScore(gs.players, 'lowest');
    const drawer = lowestPlayers[Math.floor(Math.random() * lowestPlayers.length)];
    const decreeId = gs.decreeDeck.pop();
    gs.decreeDiscard.push(decreeId);
    gs.roundData.decree = { ...DECREES[decreeId], id: decreeId };

    io.to(roomCode).emit('decreeRevealed', {
        drawerName: drawer.name,
        decrees: [{ name: gs.roundData.decree.name, description: gs.roundData.decree.description }]
    });

    setTimeout(() => {
        // Thực thi hook onReveal nếu có
        if (gs.roundData.decree.onReveal) {
            gs.roundData.decree.onReveal(gs, io, roomCode, drawer.id, rooms);
        }
        // Nếu onReveal không chuyển game sang trạng thái đặc biệt, tiếp tục
        if (gs.phase !== 'special_action') {
            startChaosPhase(roomCode, rooms, io);
        }
    }, DECREE_REVEAL_DELAY);
}

function startChaosPhase(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    
    // Kiểm tra các điều kiện vô hiệu hóa chaos
    if (gs.roundData.decree?.isChaosDisabled) {
        endChaosPhase(roomCode, `Tiếng Vọng '${gs.roundData.decree.name}' khiến mọi hành động phải dừng lại!`, rooms, io);
        return;
    }

    gs.phase = 'chaos';
    io.to(roomCode).emit('chaosPhaseStarted', { duration: CHAOS_DURATION });
    gs.roundData.chaosTimer = setTimeout(() => endChaosPhase(roomCode, "Hết giờ, không có hành động nào diễn ra.", rooms, io), CHAOS_DURATION * 1000);
    triggerBotChaosAction(roomCode, rooms, io);
}

function endChaosPhase(roomCode, message, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    // Chỉ kết thúc một lần duy nhất
    if (!gs || gs.phase !== 'chaos') return;

    gs.phase = 'reveal_pending';
    clearTimeout(gs.roundData.chaosTimer);
    io.to(roomCode).emit('chaosActionResolved', { message });
    setTimeout(() => calculateScoresAndEndRound(roomCode, rooms, io), 3000);
}

function calculateScoresAndEndRound(roomCode, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    gs.phase = 'reveal';

    const { decree, chaosResult } = gs.roundData;
    const results = { messages: [], scoreChanges: {}, isDraw: false, winner: null, roundWinners: [] };
    const pointMultiplier = decree?.getPointMultiplier?.() || 1;
    const activePlayers = gs.players.filter(p => !p.isDefeated);

    if (activePlayers.length === 0) return handlePostRoundEvents(roomCode, rooms, io);

    // Tính phiếu
    const votes = { 'Giải Mã': 0, 'Phá Hoại': 0, 'Quan Sát': 0 };
    activePlayers.forEach(p => {
        if (p.chosenAction) {
            // Kỹ năng bị động của Thánh Sống
            if (p.roleId === 'SAINT' && p.chosenAction === 'Giải Mã') {
                votes['Giải Mã'] += 2;
                results.messages.push(`✨ Lá phiếu của Thánh Sống ${p.name} được nhân đôi!`);
            } else {
                votes[p.chosenAction]++;
            }
        }
    });

    if (chaosResult?.success && chaosResult.actionType === 'Phối Hợp') {
        if (votes[chaosResult.actionToReduce] > 0) {
            votes[chaosResult.actionToReduce]--;
            results.messages.push("🤝 Phối Hợp thành công, một hành động đã được che giấu!");
        }
    }

    // Xác định kết quả
    const { 'Giải Mã': c, 'Phá Hoại': t } = votes;
    results.isDraw = (c === t);
    if (results.isDraw) {
        gs.consecutiveDraws++;
        results.messages.push("⚖️ Kết quả đêm nay là **HÒA**!");
    } else {
        gs.consecutiveDraws = 0;
        // Áp dụng luật của Tiếng Vọng nếu có, nếu không thì luật mặc định
        results.winner = decree?.determineWinner ? decree.determineWinner(c, t) : (c > t ? 'Giải Mã' : 'Phá Hoại');
        if (decree?.determineWinner) results.messages.push(`📜 Tiếng Vọng '${decree.name}' có hiệu lực!`);
        results.messages.push(`Nhóm **${results.winner}** đã thành công!`);
    }

    // Tính điểm thay đổi
    activePlayers.forEach(p => {
        let change = 0;
        if (results.isDraw) {
            change = (p.chosenAction === 'Quan Sát') ? -1 : 1;
        } else {
            if (p.chosenAction === results.winner) {
                change = 2;
                results.roundWinners.push(p.id);
            } else if (p.chosenAction === 'Quan Sát') {
                change = 1;
            } else {
                change = -1;
            }
        }
        results.scoreChanges[p.id] = change * pointMultiplier;
    });

    // Áp dụng điểm và các hiệu ứng cuối vòng
    activePlayers.forEach(p => {
        let finalChange = results.scoreChanges[p.id] || 0;
        if (p.isBlessed && finalChange < 0) {
            finalChange = 0;
            results.messages.push(`🙏 **${p.name}** đã được phước lành bảo vệ khỏi bị mất Tiến Độ!`);
        }
        if (p.roleId === 'OUTLAW' && decree && finalChange < 0) {
             finalChange = 0; // Miễn nhiễm với mất điểm từ Tiếng Vọng
        }
        p.score += finalChange;
        
        if (p.roleId === 'MAGNATE') { // Kỹ năng Nhà Tài Phiệt
            if (p.score > 0) p.score++; else if (p.score < 0) p.score--;
        }
    });

    // Hook của Tiếng Vọng (ví dụ: Cống Nạp)
    if (decree?.endOfRoundEffect) {
        decree.endOfRoundEffect(gs, results, pointMultiplier);
    }

    gs.roundData.lastScoreChanges = results.scoreChanges;
    io.to(roomCode).emit('roundResult', { players: gs.players, results, finalVoteCounts: votes });
    handlePostRoundEvents(roomCode, rooms, io);
}

function handlePostRoundEvents(roomCode, rooms, io) {
    const gs = rooms[roomCode].gameState;
    // Cập nhật các trạng thái cho vai trò sau mỗi vòng
    gs.players.forEach(p => {
        if (p.score < 0) p.hasBeenNegative = true;
        if (p.score === 7) p.hasReached7 = true;
        if (p.score === -7) p.hasReachedMinus7 = true;
        if (gs.roundData.roundWinners?.includes(p.id) && gs.roundData.roundWinners.length === 1) {
            p.loneWolfWins++;
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


// --- IV. HÀM XỬ LÝ HÀNH ĐỘNG & KỸ NĂNG ---

function handlePlayerChoice(roomCode, playerId, choice, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'choice') return;
    const player = gs.players.find(p => p.id === playerId);
    if (player && !player.chosenAction) {
        player.chosenAction = choice;
        if (choice === 'Phá Hoại') player.neverSabotaged = false;
        // Cập nhật 3 hành động gần nhất cho Kẻ Lật Mặt
        player.recentActions.push(choice);
        if (player.recentActions.length > 3) player.recentActions.shift();
        
        io.to(roomCode).emit('playerChose', playerId);
    }
    // Kiểm tra nếu tất cả đã chọn
    if (gs.players.filter(p => !p.isDefeated && !p.disconnected).every(p => p.chosenAction)) {
        clearTimeout(gs.roundData.choiceTimer);
        revealDecreeAndContinue(roomCode, rooms, io);
    }
}

function handleChaosAction(roomCode, initiatorId, targetId, actionType, guess, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs || gs.phase !== 'chaos') return;
    const initiator = gs.players.find(p => p.id === initiatorId);
    const target = gs.players.find(p => p.id === targetId);
    if (!initiator || !target) return;

    let msg = "";
    const multi = gs.roundData.decree?.getPointMultiplier?.() || 1;

    if (actionType === 'Vạch Trần') {
        const success = guess === target.chosenAction;
        if (success) initiator.successfulChallenges++;
        msg = `🔥 **${initiator.name}** đã Vạch Trần **${target.name}** và phán đoán **${success ? "ĐÚNG" : "SAI"}**!`;
        const change = 2 * multi;
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

function handleUseSkill(socket, roomCode, payload, rooms, io) {
    const gs = rooms[roomCode]?.gameState;
    if (!gs) return;
    const player = gs.players.find(p => p.id === socket.id);
    if (!player || player.isDefeated) return;

    if (gs.roundData.decree?.id === 'DEM_CAM_LANG') {
        return io.to(player.id).emit('logMessage', { type: 'error', message: 'Kỹ năng đã bị vô hiệu hóa bởi Đêm Câm Lặng!' });
    }
    if (player.skillUsedThisRound) {
        return io.to(player.id).emit('logMessage', { type: 'error', message: 'Bạn đã dùng kỹ năng trong đêm nay rồi.' });
    }

    let message = '';
    switch (player.roleId) {
        case 'PROPHET':
            if (gs.phase === 'choice' || gs.phase === 'decree') {
                const target = gs.players.find(p => p.id === payload.targetId);
                if (target) {
                    const action = target.chosenAction || 'Chưa chọn';
                    io.to(player.id).emit('privateInfo', { title: 'Thiên Lý Nhãn', text: `Hành động của ${target.name} là: **${action}**.` });
                    player.skillUsedThisRound = true;
                }
            } else {
                 return io.to(player.id).emit('logMessage', { type: 'error', message: 'Chỉ có thể dùng kỹ năng trước Giờ Hoàng Hôn.' });
            }
            break;
        case 'ASSASSIN':
            const targetAssassin = gs.players.find(p => p.id === payload.targetId);
            if (targetAssassin && payload.guessedRoleId) {
                const success = targetAssassin.roleId === payload.guessedRoleId;
                if (success) {
                    player.successfulAssassination = true;
                    const originalScore = targetAssassin.score;
                    targetAssassin.score = Math.floor(originalScore / 2);
                    message = `💥 **${player.name}** đã ám sát thành công **${targetAssassin.name}**!`;
                    io.to(roomCode).emit('updatePlayerCards', [{id: targetAssassin.id, score: targetAssassin.score}]);
                } else {
                    message = `💨 Vụ ám sát của **${player.name}** đã thất bại!`;
                }
                player.skillUsedThisRound = true;
            }
            break;
        case 'PUPPETEER':
             // Logic đã viết ở các bước trước...
             break;
        case 'PRIEST':
            if (gs.phase === 'choice') {
                const targetPriest = gs.players.find(p => p.id === payload.targetId);
                if (targetPriest) {
                    targetPriest.isBlessed = true;
                    message = `🙏 ${player.name} đã ban phước cho một người trong bóng tối...`;
                    player.skillUsedThisRound = true;
                }
            } else {
                 return io.to(player.id).emit('logMessage', { type: 'error', message: 'Chỉ có thể ban phước trong giai đoạn Hành Động.' });
            }
            break;
        default:
            return io.to(player.id).emit('logMessage', { type: 'error', message: 'Vai trò của bạn không có kỹ năng kích hoạt.' });
    }

    if (message) io.to(roomCode).emit('logMessage', { type: 'info', message });
}


// --- V. HÀM KIỂM TRA ĐIỀU KIỆN & TIỆN ÍCH ---
// ==========================================================

/**
 * Kiểm tra toàn bộ người chơi để xem có ai hoàn thành điều kiện thắng theo vai trò không.
 * Đây là hàm kiểm tra chính, được gọi sau mỗi vòng đấu.
 * @param {Object} gs - GameState hiện tại.
 * @returns {Object|null} - Trả về object người chơi thắng, hoặc null nếu không có ai.
 */
function checkRoleVictory(gs) {
    for (const player of gs.players) {
        if (player.isDefeated) continue;

        // Gọi hàm con để kiểm tra điều kiện thắng cho từng người
        if (checkRoleVictorySingle(gs, player)) {
            return player;
        }
    }
    return null; // Không có ai thắng theo vai trò trong vòng này
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
    // Khởi tạo và cài đặt
    createGameState,
    // Luồng chơi
    startNewRound,
    // Hành động người chơi & Bot
    handlePlayerChoice,
    handleChaosAction,
    handleUseSkill,
    // Tiện ích và kiểm tra
    checkRoleVictory,
    handleBotAmnesia
};