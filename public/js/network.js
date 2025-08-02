// public/js/network.js
// ======================================================================
// NETWORK MODULE ("The Messenger")
// Nhiệm vụ: Đóng gói và quản lý giao tiếp Socket.IO.
// Nó cung cấp một giao diện đơn giản cho client.js để gửi và nhận sự kiện.
// ======================================================================

const Network = {
    socket: null,

    initialize() {
        if (!this.socket) {
            this.socket = io();
        }
    },

    emit(eventName, data) {
        if (this.socket) {
            this.socket.emit(eventName, data);
        } else {
            console.error("Socket chưa được khởi tạo.");
        }
    },

    on(eventName, callback) {
        if (this.socket) {
            this.socket.on(eventName, callback);
        } else {
            console.error("Socket chưa được khởi tạo.");
        }
    },

    /**
     * Thiết lập tất cả các sự kiện nhận từ server
     * @param {Object} state - Trạng thái toàn cục của client
     * @param {Object} UI - Đối tượng giao diện người dùng
     * @param {Object} Swal - Đối tượng SweetAlert (nếu dùng)
     */
    setupEventListeners(state, UI, Swal) {
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
                    obj[role.id] = role.name; return obj;
                }, {});
            }
        });

        this.socket.on('yourRoleIs', (role) => {
            state.myRole = role;
            UI.displayRole();
        });

        this.socket.on('newRound', data => {
            state.gamePhase = 'choice';
            state.players = data.players;
            UI.renderPlayerCards();
            UI.updateNewRoundUI(data);
        });

        this.socket.on('decreeRevealed', data => {
            UI.playSound('decree');
            const decree = data.decrees[0];
            let decreeHTML = `<h3>📜 Tiếng Vọng Của Đền Thờ 📜</h3><div class="decree-item"><p class="decree-title warning">${decree.name}</p><p class="decree-description">${decree.desc}</p></div>`;
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

        this.socket.on('coordinationPhaseStarted', data => {
            state.gamePhase = 'coordination';
            UI.renderCoordinationPhase(data);
        });

        this.socket.on('coordinationPhaseEnded', () => {
            // Ẩn giao diện Phối Hợp
            UI.gameElements.actionControls.innerHTML = '<p class="info">Đang chờ Tiếng Vọng...</p>';
        });

        this.socket.on('twilightPhaseStarted', data => {
            state.gamePhase = 'twilight';
            UI.renderTwilightPhase(data);
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

        this.socket.on('newMessage', (data) => {
            UI.playSound('new-message');
            UI.addChatMessage(data.senderName, data.message);
        });

        // --- D. Sự kiện Kỹ năng & Đặc biệt ---
        this.socket.on('logMessage', data => UI.logMessage(data.type, data.message));
        this.socket.on('privateInfo', data => {
            Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' });
        });

        this.socket.on('promptAmnesiaAction', (data) => {
            UI.promptAmnesiaSelection(data.players);
        });

        // SỰ KIỆN MỚI CHO KẺ TẨY NÃO
        this.socket.on('promptMindControl', (data) => {
            UI.promptMindControlSelection(data.targetId);
        });
    }
<<<<<<< HEAD
};
=======
};
>>>>>>> 988c6e1db53aaadf964b78b788804ac77fc23ef4
