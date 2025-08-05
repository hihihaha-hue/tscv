// public/client.js
// ======================================================================

/**
 * Trạng thái toàn cục của client, chứa tất cả dữ liệu động của ứng dụng.
 * Đây là "nguồn sự thật duy nhất" (Single Source of Truth) cho giao diện.
 * @type {object}
 */
const state = {
    myId: null,
    currentRoomCode: null,
    currentHostId: null,
    players: [],
    gamePhase: 'lobby', // 'lobby', 'started', 'exploration', 'coordination', 'twilight', 'reveal', 'gameover'
    myRole: null,
    rolesInGame: [],
    gameHistory: [],
    myArtifacts: [],
    allGameRoles: {},
    allGameDecrees: {},
    allGameArtifacts: {},
};

const App = {
    /**
     * Khởi tạo ứng dụng: kết nối mạng, cài đặt UI, và lắng nghe sự kiện.
     */
    init() {
        Network.initialize();
        UI.init(); // UI tự quản lý toàn bộ sự kiện của nó
        this.bindChat();
        this.bindNetworkEvents();
    },
    
    /**
     * Gắn sự kiện cho khung chat.
     */
    bindChat() {
        const chatInput = document.getElementById('chat-input');
        const sendChatBtn = document.getElementById('send-chat-btn');
        const sendChatMessage = () => {
            const message = chatInput.value.trim();
            if (message && state.currentRoomCode) {
                Network.emit('sendMessage', { roomCode: state.currentRoomCode, message: message });
            }
            chatInput.value = '';
        };

        if (sendChatBtn) sendChatBtn.addEventListener('click', sendChatMessage);
        if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    },


    /**
     * Trung tâm lắng nghe tất cả các sự kiện từ server.
     * Luồng xử lý chung: Nhận dữ liệu -> Cập nhật `state` -> Gọi `UI` để hiển thị.
     */
    bindNetworkEvents() {
        Network.on('connect', () => {
            state.myId = Network.socket.id;
            Network.emit('requestGameData');
        });

        Network.on('gameData', (data) => {
            Object.assign(state, {
                allGameRoles: data.allRoles,
                allGameDecrees: data.allDecrees,
                allGameArtifacts: data.allArtifacts
            });
            Object.assign(UI.gameData, data); // Cung cấp dữ liệu cho UI (sách luật)
            document.getElementById('rulebook-btn').disabled = false;
            document.getElementById('rulebook-btn').title = "Sách Luật";
        });

        Network.on('roomError', (msg) => Swal.fire({ icon: 'error', title: 'Lỗi', text: msg }));
        
        Network.on('kicked', () => Swal.fire('Bạn đã bị đuổi khỏi đoàn!').then(() => window.location.reload()));

        Network.on('joinedRoom', (data) => {
            UI.playSound('success');
            Object.assign(state, {
                currentRoomCode: data.roomCode,
                currentHostId: data.hostId,
                myId: data.myId,
                players: data.players,
                gamePhase: 'lobby'
            });
            UI.showScreen('room');
            UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
            UI.updatePlayerList(state.players, state.currentHostId, state.myId);
            UI.addCopyToClipboard();
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
            if (state.gamePhase === 'lobby') {
                UI.updatePlayerList(state.players, newHostId, state.myId);
            } else {
                UI.setupPhaseUI('end_of_round', { isHost: state.myId === newHostId });
            }
        });

        Network.on('gameStarted', (data) => {
            Object.assign(state, {
                gamePhase: 'started',
                rolesInGame: data.rolesInGame,
                players: data.players,
                gameHistory: []
            });
            UI.showScreen('game');
            UI.addLogMessage({type: 'success', message: 'Cuộc thám hiểm bắt đầu!'});
            UI.displayRolesInGame(state.rolesInGame); 
            UI.updatePlayerCards(state.players, state.myId);
            UI.updateLeaderboard(state.players);
            UI.setupPhaseUI('wait', { title: 'Chuẩn Bị', description: 'Đang chờ ngày đầu tiên bắt đầu...' });
        });
        
       Network.on('yourRoleIs', (roleData) => {
    // [UPGRADE] Lưu thêm trạng thái cho Kẻ Bắt Chước
    state.myRole = roleData;
    UI.displayRole(state.myRole);
});

        Network.on('newRound', (data) => {
    Object.assign(state, { 
        gamePhase: 'exploration', 
        players: data.players,
        hasActedInTwilight: false 
    });
            const startChoicePhase = () => {
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

        // [FIX] Thêm trình lắng nghe sự kiện cho Tiếng Vọng
        Network.on('decreeRevealed', (data) => {
            UI.playSound('new-round'); 
            
            if (!data.decrees || data.decrees.length === 0) {
                UI.addLogMessage({
                    type: 'info',
                    message: `🌙 Đêm đầu tiên yên tĩnh, không có Tiếng Vọng.`
                });
                return;
            }

            data.decrees.forEach(decree => {
                UI.addLogMessage({
                    type: 'warning',
                    message: `📜 <b>Tiếng Vọng Vang Lên:</b> ${decree.name} <br><i>(Do ${data.drawerName} rút)</i> <br>${decree.description}`
                });
            });
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
                if(state.gamePhase === 'reveal'){
                   UI.setupPhaseUI('end_of_round', { isHost: state.myId === state.currentHostId });
                }
            }, 8000);
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
                gamePhase: 'lobby', myRole: null, rolesInGame: [],
                gameHistory: [], myArtifacts: [], players: data.players,
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
        
        // Các sự kiện hiển thị thông tin hoặc popup đơn giản
        Network.on('logMessage', (data) => UI.addLogMessage(data));
        Network.on('newMessage', (data) => UI.addChatMessage(data.senderName, data.message));
        Network.on('privateInfo', (data) => Swal.fire({ title: data.title, html: data.text, icon: 'info' }));
    }
};

// ======================================================================
// APPLICATION ENTRY POINT
// ======================================================================
App.init();