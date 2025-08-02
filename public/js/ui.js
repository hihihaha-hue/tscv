// public/js/ui.js
// ======================================================================
// UI MODULE ("The Interior Decorator")
// Nhiệm vụ: Chịu trách nhiệm hoàn toàn cho việc cập nhật, hiển thị,
// và thay đổi giao diện người dùng (HTML/CSS). Nó nhận lệnh từ client.js.
// ======================================================================
const UI = {
    // --- I. BỘ NHỚ CACHE CÁC THÀNH PHẦN (ELEMENTS) ---
    homeElements: {
        screen: document.getElementById('home-screen'),
        nameInput: document.getElementById('player-name-input'),
        createRoomBtn: document.getElementById('create-room-btn'),
        roomCodeInput: document.getElementById('room-code-input'),
        joinRoomBtn: document.getElementById('join-room-btn'),
    },
    roomElements: {
        screen: document.getElementById('room-screen'),
        roomCodeDisplay: document.getElementById('room-code-display'),
        playerList: document.getElementById('player-list'),
        hostControls: document.getElementById('host-controls'),
        addBotBtn: document.getElementById('add-bot-btn'),
        startGameBtn: document.getElementById('start-game-btn'),
    },
    gameElements: {
        screen: document.getElementById('game-screen'),
        roleDisplay: document.getElementById('role-display'),
        currentRound: document.getElementById('current-round'),
        decreeDisplay: document.getElementById('decree-display'),
        playersContainer: document.getElementById('players-container'),
        phaseTitle: document.getElementById('phase-title'),
        actionControls: document.getElementById('action-controls'),
        messageArea: document.getElementById('message-area'),
        chatMessages: document.getElementById('chat-messages'),
    },
    audioCache: {},

    // --- II. HÀM TIỆN ÍCH CHUNG (UTILITY FUNCTIONS) ---
    showScreen(screenId) {
        this.homeElements.screen.style.display = 'none';
        this.roomElements.screen.style.display = 'none';
        this.gameElements.screen.style.display = 'none';
        document.getElementById(`${screenId}-screen`).style.display = 'block';
    },

    playSound(soundName) {
        try {
            if (this.audioCache[soundName]) {
                this.audioCache[soundName].currentTime = 0;
                this.audioCache[soundName].play();
            } else {
                const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
                this.audioCache[soundName] = audio;
                audio.play();
            }
        } catch (e) {
            console.error(`Không thể phát âm thanh '${soundName}':`, e);
        }
    },

    addLogMessage(type, message) {
        const p = document.createElement('p');
        p.className = type;
        p.innerHTML = message;
        this.gameElements.messageArea.prepend(p);
    },

    addChatMessage(senderName, message) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message');
        const senderEl = document.createElement('span');
        senderEl.classList.add('chat-sender');
        senderEl.textContent = `${senderName}: `;
        const contentEl = document.createElement('span');
        contentEl.textContent = message;
        messageEl.appendChild(senderEl);
        messageEl.appendChild(contentEl);
        this.gameElements.chatMessages.prepend(messageEl);
    },

    // --- III. CÁC HÀM CẬP NHẬT GIAO DIỆN CHÍNH ---
    updatePlayerList(players, hostId, myId) {
        this.roomElements.playerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            let nameHTML = player.name;
            if (player.id === myId) nameHTML += ' (Bạn)';
            if (player.id === hostId) nameHTML = '👑 ' + nameHTML;
            if (player.isBot) nameHTML += ' [BOT]';
            li.innerHTML = `<span>${nameHTML}</span>`;
            if (myId === hostId && player.id !== myId && !player.isBot) {
                const kickBtn = document.createElement('button');
                kickBtn.textContent = 'Đuổi';
                kickBtn.className = 'kick-btn';
                kickBtn.onclick = () => {
                    Network.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId: player.id });
                };
                li.appendChild(kickBtn);
            }
            this.roomElements.playerList.appendChild(li);
        });
        this.roomElements.startGameBtn.disabled = players.length < 2;
        this.roomElements.hostControls.style.display = (myId === hostId) ? 'block' : 'none';
    },
	 /**
     * Hiển thị giao diện để chọn 2 người chơi để hoán đổi.
     * @param {Array} players - Danh sách người chơi hợp lệ [{id, name}].
     * @param {function} onSwapSelected - Callback được gọi với {player1Id, player2Id}.
     */
    promptForPlayerSwap(players, onSwapSelected) {
        let firstSelection = null;
        this.updatePhaseDisplay('Bùa Lú Lẫn', '<p>Chọn người chơi đầu tiên để hoán đổi hành động.</p>');
        document.body.classList.add('selecting-target');

        const handleTargetClick = (event) => {
            const card = event.currentTarget;
            const targetId = card.getAttribute('data-player-id');
            card.style.border = '3px solid var(--primary-gold)'; // Highlight lựa chọn

            if (!firstSelection) {
                firstSelection = targetId;
                this.updatePhaseDisplay('Bùa Lú Lẫn', '<p>Chọn người chơi thứ hai.</p>');
            } else {
                // Đã có lựa chọn thứ hai
                document.body.classList.remove('selecting-target');
                document.querySelectorAll('.player-card').forEach(c => c.replaceWith(c.cloneNode(true))); // Xóa listener
                onSwapSelected({ player1Id: firstSelection, player2Id: targetId });
            }
        };

        document.querySelectorAll('.player-card:not(.disconnected)').forEach(card => {
            card.addEventListener('click', handleTargetClick, { once: !firstSelection });
        });
    },
	
	/** Hiển thị giao diện chọn 2 Đấu Sĩ.
     */
    promptForDuelistPick(players, onPickComplete) {
        let firstDuelist = null;
        this.updatePhaseDisplay('Đấu Trường Sinh Tử', '<p>Chọn Đấu Sĩ đầu tiên.</p>');
        document.body.classList.add('selecting-target');

        const handlePick = (event) => {
            const card = event.currentTarget;
            const targetId = card.getAttribute('data-player-id');
            card.style.border = '3px solid var(--accent-red)';

            if (!firstDuelist) {
                firstDuelist = targetId;
                this.updatePhaseDisplay('Đấu Trường Sinh Tử', '<p>Chọn Đấu Sĩ thứ hai.</p>');
                // Ngăn chọn lại chính người này
                card.classList.remove('selecting-target');
                card.replaceWith(card.cloneNode(true));
            } else {
                document.body.classList.remove('selecting-target');
                document.querySelectorAll('.player-card').forEach(c => c.replaceWith(c.cloneNode(true)));
                onPickComplete({ player1Id: firstDuelist, player2Id: targetId });
            }
        };

        document.querySelectorAll('.player-card:not(.disconnected)').forEach(card => {
            card.addEventListener('click', handlePick);
        });
    },

    /**
     * Hiển thị giao diện đặt cược cho Khán Giả.
     */
    promptForArenaBet(data, onBetPlaced) {
        Swal.fire({
            title: 'Đặt Cược Cho Đấu Trường!',
            html: `
                <p>Chọn Đấu Sĩ bạn tin sẽ thắng và đặt cược (tối đa ${data.maxBet} điểm).</p>
                <div style="display: flex; justify-content: center; gap: 20px; margin: 20px 0;">
                    <button id="bet-d1" class="swal2-styled">${data.duelist1.name}</button>
                    <button id="bet-d2" class="swal2-styled">${data.duelist2.name}</button>
                </div>
                <input id="bet-amount" type="number" min="0" max="${data.maxBet}" value="1" class="swal2-input">
            `,
            showConfirmButton: false, // Ẩn nút mặc định
            background: '#2d3748',
            color: '#e2e8f0',
            allowOutsideClick: false,
        });

        document.getElementById('bet-d1').addEventListener('click', () => {
            const amount = parseInt(document.getElementById('bet-amount').value);
            onBetPlaced({ targetId: data.duelist1.id, amount: amount });
            Swal.close();
        });

        document.getElementById('bet-d2').addEventListener('click', () => {
            const amount = parseInt(document.getElementById('bet-amount').value);
            onBetPlaced({ targetId: data.duelist2.id, amount: amount });
            Swal.close();
        });
    },

    /**
     * Vẽ lại toàn bộ các thẻ người chơi trên màn hình game.
     * @param {Array} players - Mảng đối tượng người chơi trong gameState.
     * @param {string} myId - ID của người chơi hiện tại.
     */
    updatePlayerCards(players, myId) {
        this.gameElements.playersContainer.innerHTML = '';
        players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.setAttribute('data-player-id', player.id);
            
            if (player.id === myId) card.classList.add('is-self');
            if (player.disconnected) card.classList.add('disconnected');

            card.innerHTML = `
                <h3 class="player-name">${player.name}</h3>
                <div class="player-score" id="score-${player.id}">${player.score}</div>
                <div class="chosen-action-wrapper" id="action-${player.id}">
                    ${player.chosenAction ? '✓ Đã chọn' : '... Đang nghĩ'}
                </div>
            `;
            this.gameElements.playersContainer.appendChild(card);
        });
    },
	/**
     * Bật "chế độ chọn mục tiêu" cho một kỹ năng.
     * @param {string} skillName - Tên của kỹ năng để hiển thị cho người dùng.
     * @param {function} onTargetSelected - Hàm callback sẽ được gọi với targetId khi người dùng chọn xong.
     */
    enterTargetSelectionMode(skillName, onTargetSelected) {
        this.updatePhaseDisplay(
            `Sử Dụng Kỹ Năng: ${skillName}`,
            '<p>Hãy chọn một người chơi trên màn hình để áp dụng kỹ năng.</p><button id="cancel-skill-btn">Hủy</button>'
        );
        document.body.classList.add('selecting-target');

        // Hàm xử lý khi một mục tiêu được click
        const handleTargetClick = (event) => {
            const card = event.currentTarget;
            const targetId = card.getAttribute('data-player-id');
            
            // Tắt chế độ chọn mục tiêu
            document.body.classList.remove('selecting-target');
            removeListeners();
            
            // Gọi callback với ID của mục tiêu đã chọn
            onTargetSelected(targetId);
        };

        // Hàm xử lý khi bấm nút Hủy
        const handleCancelClick = () => {
            document.body.classList.remove('selecting-target');
            removeListeners();
            // Quay lại giao diện của giai đoạn hiện tại
            // (Bạn cần có hàm để render lại phase hiện tại, ví dụ renderChoiceButtons)
            UI.updatePhaseDisplay('', 'Bạn đã hủy sử dụng kỹ năng.');
        };

        // Hàm để xóa tất cả các listener đã gán
        const removeListeners = () => {
            document.querySelectorAll('.player-card').forEach(card => card.removeEventListener('click', handleTargetClick));
            const cancelBtn = document.getElementById('cancel-skill-btn');
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancelClick);
        };

        // Gán listener cho các thẻ người chơi hợp lệ
        document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
            card.addEventListener('click', handleTargetClick);
        });

        // Gán listener cho nút Hủy
        document.getElementById('cancel-skill-btn').addEventListener('click', handleCancelClick);
    },

    /**
     * Hiển thị hộp thoại đặc biệt cho Kẻ Tẩy Não chọn hành động.
     * @param {function} onActionSelected - Callback được gọi với hành động đã chọn.
     */
    promptForMindControlAction(onActionSelected) {
        Swal.fire({
            title: 'Điều Khiển Tâm Trí',
            text: 'Chọn hành động bạn muốn mục tiêu phải thực hiện:',
            html: `
                <div class="accusation-choices" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                    <button class="swal2-styled" data-guess="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled" data-guess="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled" data-guess="Quan Sát">👁️ Quan Sát</button>
                </div>
            `,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Hủy',
            background: '#2d3748',
            color: '#e2e8f0',
        }).then(result => {
            if (!result.isDismissed) {
                // Logic được xử lý trong didOpen
            }
        });
        
        // Gán sự kiện cho các nút bên trong hộp thoại
        const popup = Swal.getPopup();
        popup.querySelectorAll('.swal2-styled[data-guess]').forEach(button => {
            button.addEventListener('click', () => {
                const chosenAction = button.getAttribute('data-guess');
                onActionSelected(chosenAction); // Gọi callback
                Swal.close();
            });
        });
    },

    
    /**
     * Hiển thị vai trò và kỹ năng của người chơi.
     * @param {object} role - Đối tượng vai trò từ server.
     */
    displayRole(role) {
        let skillButtonHTML = '';
        if (role.hasActiveSkill) {
            skillButtonHTML = `<button class="skill-button" id="skill-btn" data-role-id="${role.id}">${role.skillName}</button>`;
        }
        this.gameElements.roleDisplay.innerHTML = `
            <h4>Vai Trò Của Bạn</h4>
            <strong>${role.name}</strong>
            <p>${role.description}</p>
            ${skillButtonHTML}
        `;
        this.gameElements.roleDisplay.style.display = 'block';
    },

    /**
     * Hiển thị Tiếng Vọng của vòng chơi.
     * @param {object} decreeData - Dữ liệu Tiếng Vọng từ server.
     */
    displayDecree(decreeData) {
        this.gameElements.decreeDisplay.innerHTML = `
            <p><span class="decree-title">Tiếng Vọng từ ${decreeData.drawerName}:</span> ${decreeData.decrees.map(d => `<strong>${d.name}</strong> - ${d.description}`).join('<br>')}</p>
        `;
        this.gameElements.decreeDisplay.style.display = 'block';
    },

    // --- IV. CÁC HÀM LIÊN QUAN ĐẾN GIAI ĐOẠN & HÀNH ĐỘNG ---

    /**
     * Cập nhật tiêu đề và mô tả của giai đoạn hiện tại.
     * @param {string} title - Tiêu đề (ví dụ: 'Giai Đoạn Lựa Chọn').
     * @param {string} description - HTML mô tả cho giai đoạn.
     */
    updatePhaseDisplay(title, description = '') {
        this.gameElements.phaseTitle.textContent = title;
        this.gameElements.actionControls.innerHTML = `${description}<div id="timer-display"></div>`;
    },

    /**
     * Bắt đầu một bộ đếm ngược trên màn hình.
     * @param {number} duration - Thời gian đếm ngược (giây).
     * @param {function} onComplete - Hàm callback sẽ gọi khi hết giờ.
     */
    startTimer(duration, onComplete) {
        const timerDisplay = document.getElementById('timer-display');
        if (!timerDisplay) return;

        let timeLeft = duration;
        // Xóa timer cũ nếu có để tránh chạy nhiều timer cùng lúc
        if (window.countdownInterval) clearInterval(window.countdownInterval);

        window.countdownInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(window.countdownInterval);
                timerDisplay.textContent = "Hết giờ!";
                if (onComplete) onComplete();
            } else {
                timerDisplay.textContent = timeLeft;
            }
            timeLeft--;
        }, 1000);
    },
    
    /** Dừng và xóa bộ đếm ngược. */
    clearTimer() {
        if (window.countdownInterval) {
            clearInterval(window.countdownInterval);
        }
        const timerDisplay = document.getElementById('timer-display');
        if(timerDisplay) timerDisplay.innerHTML = '';
    },

    /**
     * Hiển thị các nút hành động chính cho người chơi.
     */
    renderChoiceButtons() {
        this.updatePhaseDisplay(
            'Giai Đoạn Thám Hiểm',
            '<p>Bí mật chọn hành động của bạn trong đêm nay.</p>'
        );
        const buttonsHTML = `
            <div class="choice-buttons-container">
                <button class="choice-buttons loyal" data-action="Giải Mã">📜 Giải Mã</button>
                <button class="choice-buttons corrupt" data-action="Phá Hoại">💣 Phá Hoại</button>
                <button class="choice-buttons blank" data-action="Quan Sát">👁️ Quan Sát</button>
            </div>
        `;
        this.gameElements.actionControls.insertAdjacentHTML('afterbegin', buttonsHTML);

        // Gán sự kiện cho các nút vừa tạo
        document.querySelectorAll('.choice-buttons').forEach(button => {
            button.addEventListener('click', () => {
                const choice = button.getAttribute('data-action');
                Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice: choice });
                
                // Vô hiệu hóa tất cả các nút sau khi đã chọn
                document.querySelectorAll('.choice-buttons').forEach(btn => btn.disabled = true);
                this.updatePhaseDisplay('Đã chọn!', '<p>Đang chờ những người khác...</p>');
            });
        });
    },
    
    /**
     * Hiển thị hộp thoại để người chơi chọn phán đoán khi Vạch Trần.
     * @param {string} targetId - ID của người chơi bị Vạch Trần.
     * @param {string} targetName - Tên của người chơi bị Vạch Trần.
     */
    promptForAccusation(targetId, targetName) {
        document.body.classList.remove('selecting-target'); // Tạm dừng việc chọn mục tiêu

        Swal.fire({
            title: `Vạch Trần ${targetName}`,
            html: `
                <p>Bạn nghĩ họ đã thực hiện hành động gì?</p>
                <div class="accusation-choices" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                    <button class="swal2-styled" data-guess="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled" data-guess="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled" data-guess="Quan Sát">👁️ Quan Sát</button>
                </div>
            `,
            showConfirmButton: false, // Ẩn nút OK mặc định
            showCancelButton: true,
            cancelButtonText: 'Hủy',
            background: '#2d3748',
            color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.swal2-styled[data-guess]').forEach(button => {
                    button.addEventListener('click', () => {
                        const guess = button.getAttribute('data-guess');
                        // Gửi sự kiện Vạch Trần lên server
                        Network.emit('requestAccusation', {
                            roomCode: state.currentRoomCode,
                            targetId: targetId,
                            guess: guess
                        });
                        Swal.close();
                    });
                });
            },
        }).then((result) => {
            // Nếu người dùng bấm "Hủy" hoặc đóng hộp thoại, cho phép họ chọn lại mục tiêu khác
            if (result.dismiss === Swal.DismissReason.cancel) {
                document.body.classList.add('selecting-target');
            }
        });
    },

    /**
     * Hiển thị kết quả cuối vòng, cập nhật điểm và hành động.
     * @param {object} resultData - Dữ liệu kết quả từ server.
     * @param {Array} players - Mảng người chơi đã cập nhật.
     */
    renderResults(resultData, players) {
        // 1. Cập nhật hành động đã chọn của mọi người lên thẻ
        players.forEach(player => {
            const actionEl = document.getElementById(`action-${player.id}`);
            if (actionEl) {
                let actionText = player.chosenAction;
                let actionClass = '';
                if(actionText === 'Giải Mã') actionClass = 'loyal-text';
                if(actionText === 'Phá Hoại') actionClass = 'corrupt-text';
                if(actionText === 'Quan Sát') actionClass = 'blank-text';
                actionEl.innerHTML = `<span class="${actionClass}">${actionText}</span>`;
            }
        });
        
        // 2. Log các thông điệp của vòng
        resultData.messages.forEach(msg => this.addLogMessage('info', msg));

        // 3. Cập nhật điểm với hiệu ứng
        setTimeout(() => {
            players.forEach(player => {
                const scoreEl = document.getElementById(`score-${player.id}`);
                if (scoreEl) {
                    const oldScore = parseInt(scoreEl.textContent);
                    const newScore = player.score;
                    if(oldScore !== newScore) {
                        scoreEl.textContent = newScore;
                        const change = newScore - oldScore;
                        const animationClass = change > 0 ? 'score-up' : 'score-down';
                        scoreEl.classList.add(animationClass);
                        // Xóa class animation sau khi nó chạy xong
                        setTimeout(() => scoreEl.classList.remove(animationClass), 800);
                    }
                }
            });
        }, 1000); // Đợi 1 giây để người dùng đọc hành động trước khi thấy điểm thay đổi
    },

    /**
     * Hiển thị màn hình kết thúc game.
     * @param {object} data - Dữ liệu người thắng/thua từ server.
     */
    showGameOver(data) {
        let title = "Hòa!";
        let text = "Không ai hoàn thành được mục tiêu của mình.";
        if (data.winner) {
            title = `${data.winner.name} đã chiến thắng!`;
            text = `Lý do: ${data.winner.reason}`;
        } else if (data.loser) {
            title = `${data.loser.name} đã thất bại!`;
            text = "Tiến độ của họ đã chạm đáy.";
        }
        
        // Sử dụng SweetAlert để thông báo kết quả cuối cùng
        Swal.fire({
            title: title,
            text: text,
            icon: data.winner ? 'success' : 'info',
            background: '#2d3748',
            color: '#e2e8f0',
            confirmButtonText: 'Tuyệt vời!',
        });

        // Hiển thị nút "Chơi Lại" cho chủ phòng
        if (state.myId === state.currentHostId) {
             this.gameElements.actionControls.innerHTML = `<button id="play-again-btn">Chơi Lại</button>`;
             document.getElementById('play-again-btn').addEventListener('click', () => {
                 Network.emit('playAgain', state.currentRoomCode);
             });
        }
    }
};

 savePlayerName() {
        const name = this.homeElements.nameInput.value;
        if (name) {
            localStorage.setItem('tho-san-co-vat-playerName', name);
        }
    },

    loadPlayerName() {
        const savedName = localStorage.getItem('tho-san-co-vat-playerName');
        if (savedName) {
            this.homeElements.nameInput.value = savedName;
        }
    },
    
    toggleMusic() {
        const music = document.getElementById('background-music');
        const btn = document.getElementById('music-toggle-btn');
        if (music.paused) {
            music.play().catch(e => console.error("Không thể bật nhạc:", e));
            btn.textContent = '🎵';
        } else {
            music.pause();
            btn.textContent = '🔇';
        }
    },
    
    applyShakeEffect(playerId) {
        const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
        if (card) {
            card.classList.add('shake');
            setTimeout(() => {
                card.classList.remove('shake');
            }, 820);
        }
    },

    addCopyToClipboard() {
        const roomCode = this.roomElements.roomCodeDisplay.textContent;
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Sao chép mã';
        copyButton.style.marginLeft = '15px';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(roomCode).then(() => {
                UI.playSound('success');
                copyButton.textContent = 'Đã chép!';
                setTimeout(() => { copyButton.textContent = 'Sao chép mã'; }, 2000);
            });
        };
        const existingBtn = this.roomElements.roomCodeDisplay.nextElementSibling;
        if (existingBtn && existingBtn.tagName === 'BUTTON') {
            existingBtn.remove();
        }
        this.roomElements.roomCodeDisplay.parentNode.insertBefore(copyButton, this.roomElements.roomCodeDisplay.nextSibling);
    },

    showRoundSummary(results, finalVoteCounts) {
        const { winner, isDraw, roundSummary } = results;
        let title = isDraw ? '⚖️ Đêm Nay Hoà!' : `🏆 Phe ${winner} Thắng!`;
        let summaryHTML = `
            <div style="text-align: left; margin-bottom: 20px;">
                <strong>Tổng kết phiếu:</strong> 
                📜 ${finalVoteCounts['Giải Mã']} | 💣 ${finalVoteCounts['Phá Hoại']} | 👁️ ${finalVoteCounts['Quan Sát']}
            </div>
            <table class="swal2-table" style="width: 100%;">
                <thead>
                    <tr><th>Người Chơi</th><th>Hành Động</th><th>Chi Tiết Điểm</th><th>Kết Quả</th></tr>
                </thead>
                <tbody>
        `;
        roundSummary.forEach(player => {
            let totalChange = player.newScore - player.oldScore;
            let changeClass = totalChange > 0 ? 'success-text' : (totalChange < 0 ? 'error-text' : '');
            let changeText = totalChange > 0 ? `+${totalChange}` : totalChange;
            let details = player.changes.map(c => `${c.reason}: ${c.amount > 0 ? '+' : ''}${c.amount}`).join('<br>');
            if (player.changes.length === 0) details = 'Không đổi';
            summaryHTML += `
                <tr>
                    <td>${player.name}</td>
                    <td>${player.chosenAction}</td>
                    <td>${details}</td>
                    <td>${player.oldScore} <span class="${changeClass}">${changeText}</span> → <strong>${player.newScore}</strong></td>
                </tr>
            `;
        });
        summaryHTML += '</tbody></table>';
        Swal.fire({
            title: title,
            html: summaryHTML,
            width: '90%',
            customClass: { container: 'rulebook-modal' },
            background: '#2d3748',
            color: '#e2e8f0',
            confirmButtonText: 'OK'
        });
    }
};