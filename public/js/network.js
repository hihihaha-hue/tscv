// public/js/network.js
// ======================================================================
// MODULE MẠNG (NETWORK - "The Nervous System")
// Nhiệm-vụ: Xử lý mọi giao tiếp với Socket.IO server.
// Lắng nghe sự kiện (socket.on) và gửi sự kiện (socket.emit).
// ======================================================================

const Network = {
    socket: null,
    state: null, // Sẽ lưu trữ tham chiếu đến state chung từ client.js

    /**
     * Khởi tạo kết nối và thiết lập tất cả các trình lắng nghe sự kiện.
     * @param {Object} clientState - Object trạng thái chung của client.
     */
    initialize(clientState) {
        this.state = clientState;
        this.socket = io();

        // Gói tất cả các trình lắng nghe sự kiện vào một hàm cho gọn.
        this.setupEventListeners();
    },

    /**
     * Hàm bao bọc (wrapper) để gửi sự kiện lên server.
     * Đây là hàm DUY NHẤT mà các module khác nên dùng để gửi dữ liệu.
     * @param {string} eventName - Tên sự kiện.
     * @param {Object} data - Dữ liệu cần gửi.
     */
    emit(eventName, data) {
        if (this.socket) {
            this.socket.emit(eventName, data);
        } else {
            console.error("Socket not initialized. Cannot emit event.");
        }
    },

    /**
     * Nơi tập trung tất cả các trình lắng nghe sự kiện từ server.
     */
    setupEventListeners() {
        const state = this.state; // Tạo một tham chiếu ngắn gọn để dùng bên trong

        // --- A. Sự kiện Kết nối & Phòng chờ ---
        this.socket.on('connect', () => {
            state.myId = this.socket.id;
            UI.showScreen('home');
        });

        this.socket.on('roomError', msg => {
            Swal.fire({ icon: 'error', title: 'Lỗi', text: msg, background: '#2d3748', color: '#e2e8f0' });
        });

        this.socket.on('joinedRoom', data => {
            state.currentRoomCode = data.roomCode;
            state.currentHostId = data.hostId;
            state.players = data.players;
            UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
            UI.showScreen('room');
            UI.renderPlayerList();
        });
        
        this.socket.on('updatePlayerList', (players, hostId) => {
            state.players = players;
            state.currentHostId = hostId;
            UI.renderPlayerList();
        });

        this.socket.on('kicked', () => {
            Swal.fire({ icon: 'error', title: 'Đã bị trục xuất', text: 'Bạn đã bị Trưởng Đoàn trục xuất khỏi phòng.', background: '#2d3748', color: '#e2e8f0' });
            UI.showScreen('home');
        });

        // --- B. Sự kiện Luồng Game Chính ---
        this.socket.on('gameStarted', (data) => {
            UI.showScreen('game');
            UI.gameElements.messageArea.innerHTML = '';
            
            if (data && data.rolesInGame) {
                state.possibleRoles = data.rolesInGame.reduce((obj, role) => {
                    obj[role.id] = role.name;
                    return obj;
                }, {});
            }
        });

        this.socket.on('yourRoleIs', (role) => {
            state.myRole = role;
            UI.displayRole();
        });

        this.socket.on('newRound', data => {
            state.gamePhase = 'choice';
            state.players = data.players; // Cập nhật state với dữ liệu người chơi mới nhất
            UI.renderPlayerCards(); // Vẽ lại thẻ bài cho vòng mới
            UI.updateNewRoundUI(data);
        });

        this.socket.on('decreeRevealed', data => {
            UI.playSound('decree');
            const decree = data.decrees[0];
            let decreeHTML = `<h3>📜 Tiếng Vọng Của Đền Thờ 📜</h3><div class="decree-item"><p class="decree-title warning">${decree.name}</p><p class="decree-description">${decree.description}</p></div>`;
            UI.gameElements.decreeDisplay.innerHTML = decreeHTML;
            UI.gameElements.decreeDisplay.style.display = 'block';
            UI.logMessage('warning', `📜 **${data.drawerName}** đã nghe thấy một Tiếng Vọng!`);
        });

        this.socket.on('roundResult', data => {
            state.gamePhase = 'reveal';
            state.players = data.players; // Cập nhật state với điểm số mới
            UI.renderRoundResults(data);
        });

        this.socket.on('gameOver', data => {
            state.gamePhase = 'gameover';
            UI.renderGameOver(data);
        });
        
        this.socket.on('promptNextRound', () => {
            if (state.myId === state.currentHostId) {
                 UI.gameElements.actionControls.innerHTML = `<button class="skip-button" onclick="Network.emit('nextRound', state.currentRoomCode)">Đêm Tiếp Theo</button>`;
            } else {
                 UI.gameElements.actionControls.innerHTML = `<p class="info">Đang chờ Trưởng Đoàn bắt đầu đêm tiếp theo...</p>`;
            }
        });

        // --- C. Sự kiện Hành động Trong Game ---
        this.socket.on('playerChose', playerId => {
            const player = state.players.find(p => p.id === playerId);
            if (player) player.chosenAction = true;
            UI.updatePlayerCard(playerId, { actionText: '<span class="success-text">✅ Đã hành động</span>' });
        });

        this.socket.on('chaosPhaseStarted', data => {
            state.gamePhase = 'chaos';
            UI.renderChaosPhase(data);
        });

        this.socket.on('chaosActionResolved', data => {
            state.gamePhase = 'reveal_pending';
            clearInterval(state.countdownTimer);
            UI.gameElements.actionControls.innerHTML = '';
            UI.gameElements.phaseTitle.textContent = "Bình minh lên...";
            UI.logMessage('warning', data.message);
        });

        this.socket.on('updateSkipVoteCount', (count, total) => {
            const countEl = document.getElementById('skip-vote-count');
            if(countEl) countEl.textContent = `(${count}/${total})`;
        });

        this.socket.on('updatePlayerCards', (updatedPlayers) => {
            updatedPlayers.forEach(p_update => {
                const player_state = state.players.find(p => p.id === p_update.id);
                if (player_state) player_state.score = p_update.score;
                UI.updatePlayerCard(p_update.id, { score: p_update.score });
            });
        });

        this.socket.on('playerDisconnected', data => {
            const player = state.players.find(p => p.id === data.playerId);
            if(player) {
                player.disconnected = true;
                player.name = data.newName;
            }
            UI.logMessage('error', `Thợ săn ${data.newName} đã mất tích trong đền thờ.`);
            UI.updatePlayerCard(data.playerId, { disconnected: true, newName: data.newName });
        });

        // --- D. Sự kiện Kỹ năng & Đặc biệt ---
        this.socket.on('logMessage', data => UI.logMessage(data.type, data.message));

        this.socket.on('privateInfo', data => {
            Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' });
        });
        
        this.socket.on('promptAmnesiaAction', (data) => {
            UI.promptAmnesiaSelection(data.players);
        });
    }
};