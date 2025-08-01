// public/js/network.js
// ======================================================================
// MODULE MẠNG (NETWORK - "The Nervous System")
// Nhiệm vụ: Xử lý mọi giao tiếp với Socket.IO server.
// Lắng nghe sự kiện (socket.on) và gửi sự kiện (socket.emit).
// ======================================================================

const Network = {
    socket: null,

    /**
     * Khởi tạo kết nối và thiết lập tất cả các trình lắng nghe sự kiện.
     * @param {Object} state - Object trạng thái chung của client, được truyền từ client.js.
     */
    initialize(state) {
        this.socket = io();

        // ==========================================================
        // --- I. LẮNG NGHE SỰ KIỆN TỪ SERVER (socket.on) ---
        // ==========================================================

        // --- A. Connection & Lobby Events ---
        this.socket.on('connect', () => {
            state.myId = this.socket.id;
            console.log(`Connected to server with ID: ${state.myId}`);
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
            UI.renderPlayerList(); // UI sẽ đọc state để render
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

        // --- B. Game Flow Events ---
        this.socket.on('gameStarted', (data) => {
            UI.showScreen('game');
            UI.gameElements.messageArea.innerHTML = '';
            UI.gameElements.roleDisplay.style.display = 'none';

            // Nâng cấp quan trọng: Nhận danh sách vai trò từ server
            if (data && data.rolesInGame) {
                state.possibleRoles = data.rolesInGame.reduce((obj, role) => {
                    obj[role.id] = role.name;
                    return obj;
                }, {});
            }
        });

        this.socket.on('yourRoleIs', (role) => {
            state.myRole = role;
            UI.displayRole(role);
        });

        this.socket.on('newRound', data => {
            state.gamePhase = 'choice';
            state.players = data.players;
            UI.renderPlayerCards(); // Reset lại toàn bộ thẻ người chơi
            UI.updateNewRoundUI(data);
        });

        this.socket.on('decreeRevealed', data => {
            UI.playSound('decree');
            let decreeHTML = `<h3>📜 Tiếng Vọng Của Đền Thờ 📜</h3>`;
            data.decrees.forEach(decree => {
                decreeHTML += `<div class="decree-item"><p class="decree-title warning">${decree.name}</p><p class="decree-description">${decree.description}</p></div>`;
            });
            UI.gameElements.decreeDisplay.innerHTML = decreeHTML;
            UI.gameElements.decreeDisplay.style.display = 'block';
            UI.logMessage('warning', `📜 **${data.drawerName}** đã nghe thấy một Tiếng Vọng!`);
        });

        this.socket.on('roundResult', data => {
            state.gamePhase = 'reveal';
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

        // --- C. In-Game Action Events ---
        this.socket.on('playerChose', playerId => {
            // Cập nhật trạng thái trong state trước
            const player = state.players.find(p => p.id === playerId);
            if (player) player.chosenAction = true; // Đánh dấu đã chọn (dù không biết chọn gì)
            
            // Ra lệnh cho UI cập nhật một phần nhỏ
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
            updatedPlayers.forEach(p => {
                UI.updatePlayerCard(p.id, { score: p.score });
            });
        });

        this.socket.on('playerDisconnected', data => {
            UI.logMessage('error', `Thợ săn ${data.newName} đã mất tích trong đền thờ.`);
            UI.updatePlayerCard(data.playerId, { disconnected: true, newName: data.newName });
        });

        // --- D. Miscellaneous Events ---
        this.socket.on('logMessage', data => {
            UI.logMessage(data.type, data.message);
        });

        this.socket.on('privateInfo', data => {
            Swal.fire({
                title: data.title,
                html: data.text,
                icon: 'info',
                background: '#2d3748',
                color: '#e2e8f0'
            });
        });
    },

    /**
     * ==========================================================
     * --- II. HÀM GỬI SỰ KIỆN LÊN SERVER (socket.emit) ---
     * ==========================================================
     * Cung cấp một hàm duy nhất, sạch sẽ để các module khác sử dụng.
     * @param {string} eventName - Tên sự kiện.
     * @param {Object} data - Dữ liệu cần gửi.
     */
    emit(eventName, data) {
        if (this.socket) {
            this.socket.emit(eventName, data);
        } else {
            console.error("Socket not initialized. Cannot emit event.");
        }
    }
};