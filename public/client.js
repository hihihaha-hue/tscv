// public/client.js
// ======================================================================
// MODULE ĐIỀU KHIỂN CHÍNH CỦA CLIENT ("The Conductor")
// PHIÊN BẢN ĐÃ SỬA LỖI CÚ PHÁP
// ======================================================================

// --- I. TRẠNG THÁI TOÀN CỤC (GLOBAL STATE) ---
const state = {
    myId: null,
    currentRoomCode: null,
    currentHostId: null,
    players: [],
    gamePhase: 'lobby',
    myRole: null,
    rolesInGame: [],
    gameHistory: [],
};

// --- II. KHỞI TẠO ---
Network.initialize();
UI.loadPlayerName();
UI.initEventListeners();

// --- III. SỰ KIỆN UI ---
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName();
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});
UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName();
    const code = UI.homeElements.roomCodeInput.value.trim().toUpperCase();
    if (code) {
        Network.emit('joinRoom', { roomCode: code, name: UI.homeElements.nameInput.value });
    }
});
UI.roomElements.addBotBtn.addEventListener('click', () => {
    if (state.currentRoomCode) Network.emit('addBot', state.currentRoomCode);
});
UI.roomElements.startGameBtn.addEventListener('click', () => {
    Network.emit('startGame', state.currentRoomCode);
});
UI.roomElements.readyBtn.addEventListener('click', () => {
    Network.emit('playerReady', state.currentRoomCode);
});
document.getElementById('music-toggle-btn').addEventListener('click', () => UI.toggleMasterMute());

// [FIX] Chuyển các sự kiện nút toàn cục vào initEventListeners trong UI.js để an toàn hơn
// document.getElementById('rulebook-btn').addEventListener('click', ...);
// document.getElementById('history-log-btn').addEventListener('click', ...);

// KHỐI XỬ LÝ CHAT DUY NHẤT
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message && state.currentRoomCode) {
        Network.emit('sendMessage', { roomCode: state.currentRoomCode, message: message });
    }
    chatInput.value = '';
}
if (sendChatBtn) sendChatBtn.addEventListener('click', sendChatMessage);
if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });


// --- IV. SỰ KIỆN TỪ SERVER ---
Network.on('connect', () => {
    state.myId = Network.socket.id;
    Network.emit('requestGameData');
});

// [FIX] Lưu dữ liệu game để dùng sau
Network.on('gameData', (data) => {
    UI.gameData = data;
});

Network.on('roomError', (msg) => { Swal.fire({ icon: 'error', title: 'Lỗi', text: msg }); });
Network.on('kicked', () => { Swal.fire('Bạn đã bị đuổi khỏi đoàn!').then(() => window.location.reload()); });

Network.on('joinedRoom', (data) => {
    UI.playSound('success');
    state.currentRoomCode = data.roomCode;
    state.currentHostId = data.hostId;
    state.myId = data.myId;
    state.players = data.players;
    UI.showScreen('room');
    if (UI.roomElements.roomCodeDisplay) {
        UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
    }
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addCopyToClipboard();
});

Network.on('updatePlayerList', (players, hostId) => {
    Object.assign(state, { players, currentHostId: hostId });
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
});

Network.on('gameStarted', (data) => {
    Object.assign(state, { gamePhase: 'started', rolesInGame: data.rolesInGame, players: data.players });
    UI.showScreen('game');
    UI.addLogMessage('Cuộc thám hiểm bắt đầu!', 'success');
    UI.displayRolesInGame(state.rolesInGame); 
    UI.updatePlayerCards(state.players, state.myId);
    UI.updateLeaderboard(state.players);
    UI.setupPhaseUI('wait', { title: 'Chuẩn Bị', description: 'Đang chờ ngày đầu tiên bắt đầu...' });
});

Network.on('newRound', (data) => {
    const startChoicePhase = () => {
        Object.assign(state, { gamePhase: 'choice', players: data.players });
        UI.updatePlayerCards(state.players, state.myId);
        UI.updateLeaderboard(state.players);
        UI.setupPhaseUI('choice');
        UI.startTimer(data.duration);
    };

    if (data.roundNumber > 1) {
        UI.showNightTransition(data.roundNumber);
        UI.playSound('new-round');
        setTimeout(startChoicePhase, 2500);
    } else {
        startChoicePhase();
    }
});

Network.on('roundResult', (data) => {
    state.gameHistory.push({ round: data.roundNumber, results: data.results, votes: data.finalVoteCounts });
    state.gamePhase = 'reveal';
    state.players = data.players;
    UI.clearTimer();
    UI.setupPhaseUI('reveal');
    UI.showRoundSummary(data.results, data.finalVoteCounts);
    UI.updateLeaderboard(state.players);
    setTimeout(() => {
        UI.setupPhaseUI('end_of_round', { isHost: state.myId === state.currentHostId });
    }, 6000);
});

Network.on('yourRoleIs', (roleData) => {
    state.myRole = roleData;
    UI.displayRole(roleData);

    const skillBtn = document.getElementById('skill-btn');
    if (skillBtn) {
        skillBtn.addEventListener('click', () => {
            UI.playSound('click');
            const roleId = state.myRole.id;
            let payload = {};

            const emitSkill = (p) => {
                Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: p });
                UI.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng!' });
            };

            switch (roleId) {
                case 'PROPHET': case 'PEACEMAKER': case 'MAGNATE': case 'PRIEST': case 'THIEF': case 'PHANTOM':
                    UI.promptForPlayerTarget('Chọn mục tiêu cho kỹ năng', (targetId) => {
                        payload.targetId = targetId;
                        emitSkill(payload);
                    });
                    break;
                case 'MIND_BREAKER':
                    UI.promptForPlayerTarget('Chọn người để điều khiển', (targetId) => {
                        UI.promptForMindControlAction((chosenAction) => {
                            payload.targetId = targetId;
                            payload.chosenAction = chosenAction;
                            emitSkill(payload);
                        });
                    });
                    break;
                case 'REBEL':
                    UI.promptForFactionChoice('Tuyên bố hành động', (declaredAction) => {
                        UI.promptForPlayerTarget('Chọn người để trừng phạt (nếu thành công)', (targetId) => {
                            payload.declaredAction = declaredAction;
                            payload.punishTargetId = targetId;
                            emitSkill(payload);
                        });
                    });
                    break;
                case 'GAMBLER':
                    UI.promptForFactionChoice('Đặt cược vào phe thắng', (chosenFaction) => {
                        payload.chosenFaction = chosenFaction;
                        emitSkill(payload);
                    });
                    break;
                case 'INQUISITOR': case 'BALANCER': case 'CULTIST': case 'DOUBLE_AGENT': case 'MIMIC':
                    emitSkill(payload);
                    break;
                default:
                    console.warn("Chưa có logic cho kỹ năng của vai trò:", roleId);
                    break;
            }
        });
    }
});

Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.setupPhaseUI('coordination');
    UI.startTimer(data.duration);
});

Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.setupPhaseUI('twilight');
});

Network.on('newMessage', (data) => UI.addChatMessage(data.senderName, data.message));

Network.on('promptAmnesiaAction', (data) => {
    state.gamePhase = 'amnesia_selection';
    UI.promptForPlayerSwap(data.validTargets, (selection) => {
        Network.emit('submitAmnesiaAction', { roomCode: state.currentRoomCode, ...selection });
        UI.setupPhaseUI('wait', { title: 'Đã Hoán Đổi' });
    });
});

Network.on('promptArenaPick', (data) => {
    state.gamePhase = 'arena_picking';
    UI.promptForDuelistPick(data.validTargets, (selection) => {
        Network.emit('submitArenaPick', { roomCode: state.currentRoomCode, ...selection });
        UI.setupPhaseUI('wait', { title: 'Đã Chọn Đấu Sĩ' });
    });
});

Network.on('promptArenaBet', (data) => {
    state.gamePhase = 'arena_betting';
    UI.promptForArenaBet(data, (bet) => {
        Network.emit('submitArenaBet', { roomCode: state.currentRoomCode, ...bet });
        UI.setupPhaseUI('wait', { title: 'Đã Đặt Cược' });
    });
});

Network.on('updateSkipVoteCount', (data) => {
    const btn = document.getElementById(data.buttonId);
    if (btn) {
        let baseText = btn.textContent.split('(')[0].trim();
        if (data.buttonId === 'skip-coordination-btn') {
            baseText = 'Hành động một mình';
        } else if (data.buttonId === 'twilight-rest-btn') {
            baseText = 'Nghỉ Ngơi';
        }
        btn.textContent = `${baseText} (${data.count}/${data.total})`;
    }
});