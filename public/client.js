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
    gamePhase: 'lobby',
    myRole: null,
    rolesInGame: [],
    gameHistory: [],
    myArtifacts: [],
    allGameRoles: {},
    allGameDecrees: {},
    allGameArtifacts: {},
    currentUser: null,
	roomSettings: {},
};

const App = {
    /**
     * Khởi tạo ứng dụng: kết nối mạng, cài đặt UI, và lắng nghe sự kiện.
     */
    init() {
        Network.initialize();
        UI.init();
        
        // <<< SỬA LỖI: Di chuyển logic lắng nghe sự kiện vào đây để đảm bảo nó chỉ chạy một lần >>>
        this.bindCoreNetworkEvents();
        this.bindAuthEvents();
        this.bindGameActionEvents(); // Gắn các sự kiện của người dùng trong lobby
        this.bindChat();

        this.checkInitialAuthState();
    },

    // <<< PHẦN THÊM MỚI: Tách các hàm xử lý xác thực >>>
    bindAuthEvents() {
		console.log("Đang chạy hàm bindAuthEvents để gắn sự kiện...");
        if(UI.homeElements.loginBtn) {
            UI.homeElements.loginBtn.addEventListener('click', () => this.handleLogin());
        }
        if(UI.homeElements.registerBtn) {
			 console.log("Tìm thấy nút đăng ký:", UI.homeElements.registerBtn); 
            UI.homeElements.registerBtn.addEventListener('click', () => this.handleRegister());
        } else {
         console.error("KHÔNG TÌM THẤY NÚT ĐĂNG KÝ (register-btn)!"); 
		}
    },
    
    // Gắn các sự kiện hành động của người dùng (tạo phòng, tham gia phòng)
bindGameActionEvents() {
    // Gỡ lỗi nút "Mở Cuộc Thám Hiểm Mới"
    const createBtn = UI.homeElements.createRoomBtn;
    if (createBtn) {
        console.log("Tìm thấy nút 'Mở Cuộc Thám Hiểm Mới'. Đang gắn sự kiện...");
        createBtn.addEventListener('click', () => {
            console.log("Nút 'Mở Cuộc Thám Hiểm Mới' ĐÃ ĐƯỢC NHẤN!");

            // Tái tạo lại logic của handleLobbyAction ở đây
            UI.playSound('click');
            UI.startMusic();
            UI.savePlayerName();

            const token = localStorage.getItem('authToken');
            if (!token) {
                console.error("Không tìm thấy authToken! Người dùng chưa đăng nhập?");
                return Swal.fire('Lỗi', 'Bạn cần đăng nhập để thực hiện hành động này.', 'error');
            }

            console.log("Đang gửi sự kiện 'createRoom' với token:", token);
            Network.emit('createRoom', { 
                name: UI.homeElements.nameInput.value,
                token: token 
            });
        });
    } else {
        console.error("KHÔNG TÌM THẤY NÚT 'Mở Cuộc Thám Hiểm Mới'!");
    }

    // Gỡ lỗi nút "Tham Gia Đoàn" (làm tương tự)
    const joinBtn = UI.homeElements.joinRoomBtn;
    if (joinBtn) {
        console.log("Tìm thấy nút 'Tham Gia Đoàn'. Đang gắn sự kiện...");
        joinBtn.addEventListener('click', () => {
            console.log("Nút 'Tham Gia Đoàn' ĐÃ ĐƯỢC NHẤN!");

            UI.playSound('click');
            UI.startMusic();
            UI.savePlayerName();
            
            const code = UI.homeElements.roomCodeInput.value.trim().toUpperCase();
            if (code) {
                 const token = localStorage.getItem('authToken');
                 if (!token) {
                     console.error("Không tìm thấy authToken! Người dùng chưa đăng nhập?");
                     return Swal.fire('Lỗi', 'Bạn cần đăng nhập để thực hiện hành động này.', 'error');
                 }

                 console.log(`Đang gửi sự kiện 'joinRoom' cho phòng ${code} với token:`, token);
                 Network.emit('joinRoom', { 
                     roomCode: code, 
                     name: UI.homeElements.nameInput.value,
                     token: token
                 });
            }
        });
    } else {
        console.error("KHÔNG TÌM THẤY NÚT 'Tham Gia Đoàn'!");
    }
},
displayRoomSettings(settings) {
    const container = document.getElementById('custom-rules-display');
    if (!container) return;

    let html = '<h4>Luật Tùy Chỉnh:</h4><ul>';
    let hasCustomRules = false;

    if (settings.winScore && settings.winScore !== 20) { // Giả sử 20 là mặc định
        html += `<li>Điểm thắng: <strong>${settings.winScore}</strong></li>`;
        hasCustomRules = true;
    }
    if (settings.bannedRoles && settings.bannedRoles.length > 0) {
        const bannedRoleNames = settings.bannedRoles.map(id => this.gameData.allRoles[id]?.name || id).join(', ');
        html += `<li>Vai trò bị cấm: ${bannedRoleNames}</li>`;
        hasCustomRules = true;
    }
     if (settings.bannedDecrees && settings.bannedDecrees.length > 0) {
        const bannedDecreeNames = settings.bannedDecrees.map(id => this.gameData.allDecrees[id]?.name || id).join(', ');
        html += `<li>Tiếng Vọng bị cấm: ${bannedDecreeNames}</li>`;
        hasCustomRules = true;
    }
    html += '</ul>';

    container.innerHTML = hasCustomRules ? html : '';
},

    async handleLogin() {
        const username = UI.homeElements.loginUsernameInput.value.trim();
        const password = UI.homeElements.loginPasswordInput.value.trim();
        if (!username || !password) {
            return Swal.fire('Lỗi', 'Vui lòng nhập đầy đủ thông tin.', 'error');
        }
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Đăng nhập thất bại.');
            this.handleSuccessfulLogin(data);
        } catch (error) {
            Swal.fire('Lỗi Đăng Nhập', error.message, 'error');
        }
    },

    async handleRegister() {
		 console.log("Hàm handleRegister ĐÃ ĐƯỢC GỌI!");
        const username = UI.homeElements.registerUsernameInput.value.trim();
        const password = UI.homeElements.registerPasswordInput.value.trim();
        if (!username || !password) {
            return Swal.fire('Lỗi', 'Vui lòng nhập đầy đủ thông tin.', 'error');
        }
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const message = await response.text();
            if (!response.ok) throw new Error(message);
            Swal.fire('Thành công!', 'Đăng ký thành công! Vui lòng đăng nhập.', 'success');
            UI.showAuthForm('login');
        } catch(error) {
            Swal.fire('Lỗi Đăng Ký', error.message, 'error');
        }
    },

    handleSuccessfulLogin(data) {
        localStorage.setItem('authToken', data.token);
        state.currentUser = data.user;
        UI.setLoggedInState(data.user);
    },

    logout() {
        localStorage.removeItem('authToken');
        state.currentUser = null;
        UI.setLoggedOutState();
    },

    checkInitialAuthState() {
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp * 1000 < Date.now()) {
                    throw new Error("Token đã hết hạn.");
                }
                const user = { username: payload.username, id: payload.userId };
                this.handleSuccessfulLogin({ token, user });
            } catch (e) {
                console.error("Lỗi xác thực token:", e.message);
                this.logout();
            }
        } else {
             UI.setLoggedOutState();
        }
    },

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
     */
    bindCoreNetworkEvents() {
        Network.on('connect', () => {
            state.myId = Network.socket.id;
            const reconToken = localStorage.getItem('reconnectionToken');
            const roomCode = localStorage.getItem('roomCode');
            if (reconToken && roomCode) {
                 Network.emit('attemptReconnection', { reconnectionToken: reconToken, roomCode: roomCode });
            }
            Network.emit('requestGameData');
        });
        
        // <<< SỬA LỖI: Thêm sự kiện authError >>>
        Network.on('authError', (message) => {
            Swal.fire('Lỗi Xác Thực', message, 'error').then(() => {
                this.logout();
            });
        });

        Network.on('gameData', (data) => {
            Object.assign(state, {
                allGameRoles: data.allRoles,
                allGameDecrees: data.allDecrees,
                allGameArtifacts: data.allArtifacts
            });
            Object.assign(UI.gameData, data);
            document.getElementById('rulebook-btn').disabled = false;
            document.getElementById('rulebook-btn').title = "Sách Luật";
        });

        Network.on('reconnectionSuccessful', (data) => {
            console.log("Kết nối lại thành công!", data);
            localStorage.removeItem('reconnectionToken');
            localStorage.removeItem('roomCode');
            Object.assign(state, {
                gamePhase: data.gameState.phase, players: data.gameState.players,
                myId: Network.socket.id, currentHostId: data.gameState.hostId,
                myRole: data.myRole,
                myArtifacts: data.gameState.players.find(p => p.id === Network.socket.id).artifacts,
            });
            UI.showScreen('game');
            UI.updatePlayerCards(state.players, state.myId);
            UI.updateLeaderboard(state.players);
            UI.displayRole(state.myRole);
            UI.setupPhaseUI(state.gamePhase, { isHost: state.myId === state.currentHostId });
            UI.addLogMessage({type: 'success', message: 'Bạn đã kết nối lại ván đấu!'});
        });

        Network.on('reconnectionFailed', (reason) => {
            console.log("Kết nối lại thất bại:", reason);
            localStorage.removeItem('reconnectionToken');
            localStorage.removeItem('roomCode');
            Swal.fire('Kết nối lại thất bại', reason || 'Không thể vào lại ván đấu trước.', 'error');
        });

        Network.on('roomError', (msg) => Swal.fire({ icon: 'error', title: 'Lỗi', text: msg }));
        
        Network.on('kicked', () => Swal.fire('Bạn đã bị đuổi khỏi đoàn!').then(() => window.location.reload()));

        Network.on('joinedRoom', (data) => {
            UI.playSound('success');
            Object.assign(state, {
                currentRoomCode: data.roomCode, currentHostId: data.hostId,
                myId: data.myId, players: data.players, gamePhase: 'lobby'
            });
            localStorage.setItem('reconnectionToken', data.reconnectionToken);
            localStorage.setItem('roomCode', data.roomCode);

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
	Network.on('roomSettingsUpdated', (settings) => {
    console.log("Cài đặt phòng đã được cập nhật:", settings);
    state.roomSettings = settings;
    UI.displayRoomSettings(settings); // Gọi hàm UI để hiển thị
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

        // === BẮT ĐẦU SỬA LỖI ===
        // Lắng nghe lệnh đóng overlay từ server
        Network.on('forceCloseTwilightOverlay', () => {
            // Gọi hàm trong UI để thực hiện việc đóng
            UI.hideTwilightOverlay();
        });
    }
};

// ======================================================================
// APPLICATION ENTRY POINT
// ======================================================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});