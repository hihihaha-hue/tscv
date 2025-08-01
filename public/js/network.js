// public/js/network.js
// ======================================================================
// MODULE MẠNG (NETWORK - "The Nervous System")
// Nhiệm vụ: Xử lý mọi giao tiếp với Socket.IO server.
// Lắng nghe sự kiện (socket.on) và gửi sự kiện (socket.emit).
// ======================================================================

const Network = {
    socket: null,
    state: null, // Sẽ lưu trữ tham chiếu đến state chung

    /**
     * Khởi tạo kết nối và thiết lập tất cả các trình lắng nghe sự kiện.
     * @param {Object} clientState - Object trạng thái chung của client.
     */
    initialize(clientState) {
        this.state = clientState;
        this.socket = io();

        // ==========================================================
        // --- I. LẮNG NGHE SỰ KIỆN TỪ SERVER (socket.on) ---
        // ==========================================================
        this.setupEventListeners();
    },

    /**
     * Hàm bao bọc (wrapper) để gửi sự kiện lên server.
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
     * Gói tất cả các trình lắng nghe sự kiện vào một hàm cho gọn.
     */
    setupEventListeners() {
        // --- A. Connection & Lobby Events ---
        this.socket.on('connect', () => {
            this.state.myId = this.socket.id;
            UI.showScreen('home');
        });

        this.socket.on('roomError', msg => {
            Swal.fire({ icon: 'error', title: 'Lỗi', text: msg, background: '#2d3748', color: '#e2e8f0' });
        });

        this.socket.on('joinedRoom', data => {
            this.state.currentRoomCode = data.roomCode;
            this.state.currentHostId = data.hostId;
            this.state.players = data.players;
            UI.roomElements.roomCodeDisplay.textContent = this.state.currentRoomCode;
            UI.showScreen('room');
            UI.renderPlayerList();
        });
        
        this.socket.on('updatePlayerList', (players, hostId) => {
            this.state.players = players;
            this.state.currentHostId = hostId;
            UI.renderPlayerList();
        });

        this.socket.on('kicked', () => {
            Swal.fire({ icon: 'error', title: 'Đã bị trục xuất', text: 'Bạn đã bị Trưởng Đoàn trục xuất khỏi phòng.', background: '#2d3748', color: '#e2e8f0' });
            UI.showScreen('home');
        });

        // --- B. Game Flow Events ---
        this.socket.on('gameStarted', (data) => {
            UI.showScreen('game');
            UI.gameElements.messageArea.innerHTML = '';
            UI.gameElements.roleDisplay.style.display = 'none';
            if (data && data.rolesInGame) {
                this.state.possibleRoles = data.rolesInGame.reduce((obj, role) => {
                    obj[role.id] = role.name;
                    return obj;
                }, {});
            }
        });

        this.socket.on('yourRoleIs', (role) => {
            this.state.myRole = role;
            UI.displayRole();
        });

        this.socket.on('newRound', data => {
            this.state.gamePhase = 'choice';
            this.state.players = data.players;
            UI.renderPlayerCards();
            UI.updateNewRoundUI(data);
        });

        this.socket.on('decreeRevealed', data => {
            UI.playSound('decree');
            let decreeHTML = `<h3>📜 Tiếng Vọng Của Đền Thờ 📜</h3><div class="decree-item"><p class="decree-title warning">${data.decrees[0].name}</p><p class="decree-description">${data.decrees[0].description}</p></div>`;
            UI.gameElements.decreeDisplay.innerHTML = decreeHTML;
            UI.gameElements.decreeDisplay.style.display = 'block';
            UI.logMessage('warning', `📜 **${data.drawerName}** đã nghe thấy một Tiếng Vọng!`);
        });

        this.socket.on('roundResult', data => {
            this.state.gamePhase = 'reveal';
            this.state.players = data.players; // Cập nhật state với điểm số mới
            UI.renderRoundResults(data);
        });

        this.socket.on('gameOver', data => {
            this.state.gamePhase = 'gameover';
            UI.renderGameOver(data);
        });
        
        this.socket.on('promptNextRound', () => {
            if (this.state.myId === this.state.currentHostId) {
                 UI.gameElements.actionControls.innerHTML = `<button class="skip-button" onclick="Network.emit('nextRound', state.currentRoomCode)">Đêm Tiếp Theo</button>`;
            } else {
                 UI.gameElements.actionControls.innerHTML = `<p class="info">Đang chờ Trưởng Đoàn bắt đầu đêm tiếp theo...</p>`;
            }
        });

        // --- C. In-Game Action Events ---
        this.socket.on('playerChose', playerId => {
            const player = this.state.players.find(p => p.id === playerId);
            if (player) player.chosenAction = true;
            UI.updatePlayerCard(playerId, { actionText: '<span class="success-text">✅ Đã hành động</span>' });
        });

        this.socket.on('chaosPhaseStarted', data => {
            this.state.gamePhase = 'chaos';
            UI.renderChaosPhase(data);
        });

        this.socket.on('chaosActionResolved', data => {
            this.state.gamePhase = 'reveal_pending';
            clearInterval(this.state.countdownTimer);
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
                const player_state = this.state.players.find(p => p.id === p_update.id);
                if (player_state) player_state.score = p_update.score;
                UI.updatePlayerCard(p_update.id, { score: p_update.score });
            });
        });

        this.socket.on('playerDisconnected', data => {
            const player = this.state.players.find(p => p.id === data.playerId);
            if(player) {
                player.disconnected = true;
                player.name = data.newName;
            }
            UI.logMessage('error', `Thợ săn ${data.newName} đã mất tích trong đền thờ.`);
            UI.updatePlayerCard(data.playerId, { disconnected: true, newName: data.newName });
        });

        // --- D. Miscellaneous Events ---
        this.socket.on('logMessage', data => UI.logMessage(data.type, data.message));

        this.socket.on('privateInfo', data => {
            Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' });
        });
    }
};