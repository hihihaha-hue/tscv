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
	myArtifacts: [],
	allGameRoles: {},
    allGameDecrees: {},
    allGameArtifacts: {},
};

// --- II. KHỞI TẠO ---
Network.initialize();
UI.loadPlayerName();
UI.initEventListeners();

// --- III. SỰ KIỆN UI ---
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click'); // Phát âm thanh sau cú nhấp chuột đầu tiên
    UI.startMusic();      // Bật nhạc nền sau cú nhấp chuột đầu tiên
    UI.savePlayerName();
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});

UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click'); // Phát âm thanh sau cú nhấp chuột đầu tiên
    UI.startMusic();      // Bật nhạc nền sau cú nhấp chuột đầu tiên
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
document.getElementById('history-log-btn').addEventListener('click', () => UI.showGameHistory(state.gameHistory));

document.getElementById('rulebook-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.showRulebook();
});

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

Network.on('gameData', (data) => {
    state.allGameRoles = data.allRoles;
    state.allGameDecrees = data.allDecrees;
    state.allGameArtifacts = data.allArtifacts; 
    
    UI.gameData.allRoles = data.allRoles;
    UI.gameData.allDecrees = data.allDecrees;
    UI.gameData.allArtifacts = data.allArtifacts;
});

Network.on('roomError', (msg) => {
    UI.playSound('error'); 
    Swal.fire({ icon: 'error', title: 'Lỗi', text: msg });
});
Network.on('kicked', () => { Swal.fire('Bạn đã bị đuổi khỏi đoàn!').then(() => window.location.reload()); });

Network.on('joinedRoom', (data) => {
    UI.playSound('success');
    state.currentRoomCode = data.roomCode;
    state.currentHostId = data.hostId;
    state.myId = data.myId;
    state.players = data.players;
    state.gamePhase = 'lobby'; 
    UI.showScreen('room');
    if (UI.roomElements.roomCodeDisplay) {
        UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
    }
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addCopyToClipboard();
});
Network.on('promptArtifactChoice', (data) => {
    UI.promptForArtifactChoice(data, (decision) => {
        Network.emit('submitArtifactChoice', {
            roomCode: state.currentRoomCode,
            decision: decision
        });
    });
});

Network.on('updatePlayerList', (players, hostId) => {
    Object.assign(state, { players, currentHostId: hostId });
    if (state.gamePhase === 'lobby') {
        UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    } else {
        UI.updatePlayerCards(state.players, state.myId);
        UI.updateLeaderboard(state.players);
    }
});

Network.on('hostChanged', (newHostId) => {
    state.currentHostId = newHostId;
    if(state.gamePhase === 'lobby') {
        UI.updatePlayerList(state.players, newHostId, state.myId);
    } else {
         UI.setupPhaseUI(state.gamePhase, { isHost: state.myId === newHostId });
    }
});

Network.on('gameStarted', (data) => {
    Object.assign(state, { gamePhase: 'started', rolesInGame: data.rolesInGame, players: data.players, gameHistory: [] });
    UI.showScreen('game');
    UI.addLogMessage({type: 'success', message: 'Cuộc thám hiểm bắt đầu!'});
    UI.displayRolesInGame(state.rolesInGame); 
    UI.updatePlayerCards(state.players, state.myId);
    UI.updateLeaderboard(state.players);
    UI.setupPhaseUI('wait', { title: 'Chuẩn Bị', description: 'Đang chờ ngày đầu tiên bắt đầu...' });
});

Network.on('newRound', (data) => {
    const startChoicePhase = () => {
        Object.assign(state, { gamePhase: 'exploration', players: data.players });
        UI.updatePlayerCards(state.players, state.myId);
        UI.updateLeaderboard(state.players);
        UI.setupPhaseUI('choice');
        UI.startTimer(data.duration);
        UI.updateArtifactDisplay(state.myArtifacts);
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
    UI.attachSkillButtonListener();
});


Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.setupPhaseUI('coordination');
    UI.startTimer(data.duration);
});

Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.setupPhaseUI('twilight');
    UI.startTimer(data.duration);
});

Network.on('logMessage', (data) => UI.addLogMessage(data));
Network.on('privateInfo', (data) => Swal.fire({ title: data.title, html: data.text, icon: 'info' }));
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
        btn.textContent = `${baseText} (${data.count}/${data.total})`;
    }
});
Network.on('artifactUpdate', (data) => {
    state.myArtifacts = data.artifacts;
    UI.updateArtifactDisplay(state.myArtifacts);
    if (data.message) {
        Swal.fire({ title: 'Cổ Vật!', text: data.message, icon: 'success' });
    }
});

Network.on('gameOver', (data) => {
    state.gamePhase = 'gameover';
    UI.showGameOver(data, state.myId === state.currentHostId);
});

Network.on('returnToLobby', (data) => {
    UI.playSound('success');
    
    Object.assign(state, {
        gamePhase: 'lobby',
        myRole: null,
        rolesInGame: [],
        gameHistory: [],
        myArtifacts: [],
        players: data.players,
        currentHostId: data.hostId
    });

    UI.showScreen('room');
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    
    UI.gameElements.roleDisplay.innerHTML = '';
    UI.gameElements.leaderboardList.innerHTML = '';
    UI.gameElements.messageArea.innerHTML = '';
    UI.gameElements.rolesInGameList.innerHTML = '';
    UI.updateArtifactDisplay(null);
});