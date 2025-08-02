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
        playerControls: document.getElementById('player-controls'),
        readyBtn: document.getElementById('ready-btn'),
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
        skipCoordinationBtn: document.getElementById('skip-coordination-btn'),
        skipTwilightBtn: document.getElementById('skip-twilight-btn'),
    },
    audioCache: {},
     // NÂNG CẤP: Thêm một trạng thái Mute toàn cục
    isMuted: false,

    // --- CÁC HÀM TIỆN ÍCH ÂM THANH ĐÃ NÂNG CẤP ---

    /**
     * (NÂNG CẤP) Bật hoặc tắt TOÀN BỘ âm thanh trong game.
     * Giờ đây nó sẽ là bộ điều khiển trung tâm.
     */
    toggleMasterMute() {
        // 1. Đảo ngược trạng thái tắt tiếng
        this.isMuted = !this.isMuted;

        // 2. Cập nhật icon trên nút bấm
        const btn = document.getElementById('music-toggle-btn');
        btn.textContent = this.isMuted ? '🔇' : '🎵';

        // 3. Áp dụng trạng thái Mute cho nhạc nền
        const music = document.getElementById('background-music');
        music.muted = this.isMuted;

        // 4. Áp dụng trạng thái Mute cho TẤT CẢ các âm thanh hiệu ứng đã được cache
        for (const soundName in this.audioCache) {
            this.audioCache[soundName].muted = this.isMuted;
        }
    }

    // --- II. HÀM TIỆN ÍCH CHUNG (UTILITY FUNCTIONS) ---
    showScreen(screenId) {
        this.homeElements.screen.style.display = 'none';
        this.roomElements.screen.style.display = 'none';
        this.gameElements.screen.style.display = 'none';
        document.getElementById(`${screenId}-screen`).style.display = 'block';
    },
showNightTransition(roundNumber) {
        const overlay = document.getElementById('night-transition-overlay');
        const text = document.getElementById('night-transition-text');
        
        text.textContent = `Đêm thứ ${roundNumber}`;
        overlay.classList.add('active'); // Kích hoạt hiệu ứng mờ vào

        // Sau 2.5 giây, tự động mờ ra
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 2500);
    },

    playSound(soundName) {
        try {
            // Nếu âm thanh đã có trong cache
            if (this.audioCache[soundName]) {
                const audio = this.audioCache[soundName];
                audio.muted = this.isMuted; // Đảm bảo nó tuân thủ trạng thái Mute
                audio.currentTime = 0;      // Quay về đầu để phát lại ngay lập tức (tránh chồng âm)
                audio.play();
            } else {
                // Nếu chưa có, tạo mới, đặt trạng thái Mute và lưu vào cache
                const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
                audio.muted = this.isMuted;
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
        
        // Kiểm tra xem tất cả người chơi (không phải host, không phải bot) đã sẵn sàng chưa
        const allPlayersReady = players
            .filter(p => p.id !== hostId && !p.isBot)
            .every(p => p.isReady);

        players.forEach(player => {
            const li = document.createElement('li');
            let nameHTML = player.name;
            
            // Thêm icon ✅/❌ cho người chơi thường
            if (player.id !== hostId && !player.isBot) {
                nameHTML = (player.isReady ? '✅' : '❌') + ' ' + nameHTML;
            }

            if (player.id === myId) nameHTML += ' (Bạn)';
            if (player.id === hostId) nameHTML = '👑 ' + nameHTML;
            if (player.isBot) nameHTML += ' [BOT]';
            
            li.innerHTML = `<span>${nameHTML}</span>`;

            // Nút Kick (giữ nguyên)
            if (myId === hostId && player.id !== myId && !player.isBot) {
                const kickBtn = document.createElement('button');
                kickBtn.textContent = 'Đuổi';
                kickBtn.className = 'kick-btn';
                kickBtn.onclick = () => { Network.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId: player.id }); };
                li.appendChild(kickBtn);
            }
            this.roomElements.playerList.appendChild(li);
        });
        
        // Hiển thị/ẩn các nút điều khiển
        if (myId === hostId) {
            this.roomElements.hostControls.style.display = 'block';
            this.roomElements.playerControls.style.display = 'none';
            // Nút Bắt Đầu chỉ bật khi đủ người VÀ tất cả đã sẵn sàng
            this.roomElements.startGameBtn.disabled = players.length < 2 || !allPlayersReady;
        } else {
            this.roomElements.hostControls.style.display = 'none';
            this.roomElements.playerControls.style.display = 'block';
            // Thay đổi chữ trên nút Sẵn Sàng
            const myPlayer = players.find(p => p.id === myId);
            this.roomElements.readyBtn.textContent = myPlayer?.isReady ? 'Bỏ Sẵn Sàng' : 'Sẵn Sàng';
        }
    },

    /**
     * Hiển thị giao diện để chọn 2 người chơi để hoán đổi.
     */
    promptForPlayerSwap(players, onSwapSelected) {
        let firstSelection = null;
        this.updatePhaseDisplay('Bùa Lú Lẫn', '<p>Chọn người chơi đầu tiên để hoán đổi hành động.</p>');
        document.body.classList.add('selecting-target');

        const handleTargetClick = (event) => {
            const card = event.currentTarget;
            const targetId = card.getAttribute('data-player-id');
            card.style.border = '3px solid var(--primary-gold)';
            if (!firstSelection) {
                firstSelection = targetId;
                this.updatePhaseDisplay('Bùa Lú Lẫn', '<p>Chọn người chơi thứ hai.</p>');
            } else {
                document.body.classList.remove('selecting-target');
                document.querySelectorAll('.player-card').forEach(c => c.replaceWith(c.cloneNode(true)));
                onSwapSelected({ player1Id: firstSelection, player2Id: targetId });
            }
        };

        document.querySelectorAll('.player-card:not(.disconnected)').forEach(card => {
            card.addEventListener('click', handleTargetClick, { once: !firstSelection });
        });
    },

    /** Hiển thị giao diện chọn 2 Đấu Sĩ. */
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
            showConfirmButton: false,
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
     */
    enterTargetSelectionMode(skillName, onTargetSelected) {
        this.updatePhaseDisplay(
            `Sử Dụng Kỹ Năng: ${skillName}`,
            '<p>Hãy chọn một người chơi trên màn hình để áp dụng kỹ năng.</p><button id="cancel-skill-btn">Hủy</button>'
        );
        document.body.classList.add('selecting-target');
        const handleTargetClick = (event) => {
            const card = event.currentTarget;
            const targetId = card.getAttribute('data-player-id');
            document.body.classList.remove('selecting-target');
            removeListeners();
            onTargetSelected(targetId);
        };
        const handleCancelClick = () => {
            document.body.classList.remove('selecting-target');
            removeListeners();
            UI.updatePhaseDisplay('', 'Bạn đã hủy sử dụng kỹ năng.');
        };
        const removeListeners = () => {
            document.querySelectorAll('.player-card').forEach(card => card.removeEventListener('click', handleTargetClick));
            const cancelBtn = document.getElementById('cancel-skill-btn');
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancelClick);
        };
        document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
            card.addEventListener('click', handleTargetClick);
        });
        document.getElementById('cancel-skill-btn').addEventListener('click', handleCancelClick);
    },

    /**
     * Hiển thị hộp thoại đặc biệt cho Kẻ Tẩy Não chọn hành động.
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
        const popup = Swal.getPopup();
        popup.querySelectorAll('.swal2-styled[data-guess]').forEach(button => {
            button.addEventListener('click', () => {
                const chosenAction = button.getAttribute('data-guess');
                onActionSelected(chosenAction);
                Swal.close();
            });
        });
    },

    /**
     * Hiển thị vai trò và kỹ năng của người chơi.
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
     */
    updatePhaseDisplay(title, description = '') {
        this.gameElements.phaseTitle.textContent = title;
        this.gameElements.actionControls.innerHTML = `${description}<div id="timer-display"></div>`;
    },

    /**
     * Bắt đầu một bộ đếm ngược trên màn hình.
     */
    startTimer(duration, onComplete) {
        const timerDisplay = document.getElementById('timer-display');
        if (!timerDisplay) return;
        let timeLeft = duration;
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
        document.querySelectorAll('.choice-buttons').forEach(button => {
            button.addEventListener('click', () => {
                const choice = button.getAttribute('data-action');
                Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice: choice });
                document.querySelectorAll('.choice-buttons').forEach(btn => btn.disabled = true);
                this.updatePhaseDisplay('Đã chọn!', '<p>Đang chờ những người khác...</p>');
            });
        });
    },

    /**
     * Hiển thị hộp thoại để người chơi chọn phán đoán khi Vạch Trần.
     */
    promptForAccusation(targetId, targetName) {
        document.body.classList.remove('selecting-target');
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
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Hủy',
            background: '#2d3748',
            color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.swal2-styled[data-guess]').forEach(button => {
                    button.addEventListener('click', () => {
                        const guess = button.getAttribute('data-guess');
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
            if (result.dismiss === Swal.DismissReason.cancel) {
                document.body.classList.add('selecting-target');
            }
        });
    },

    /**
     * Hiển thị kết quả cuối vòng, cập nhật điểm và hành động.
     */
    renderResults(resultData, players) {
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
        resultData.messages.forEach(msg => this.addLogMessage('info', msg));
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
                        setTimeout(() => scoreEl.classList.remove(animationClass), 800);
                    }
                }
            });
        }, 1000);
    },

    /**
     * Hiển thị màn hình kết thúc game.
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
        Swal.fire({
            title: title,
            text: text,
            icon: data.winner ? 'success' : 'info',
            background: '#2d3748',
            color: '#e2e8f0',
            confirmButtonText: 'Tuyệt vời!',
        });
        if (state.myId === state.currentHostId) {
             this.gameElements.actionControls.innerHTML = `<button id="play-again-btn">Chơi Lại</button>`;
             document.getElementById('play-again-btn').addEventListener('click', () => {
                 Network.emit('playAgain', state.currentRoomCode);
             });
        }
    },

    // --- PHẦN BỔ SUNG, ĐƯA VÀO ĐÚNG VỊ TRÍ TRONG OBJECT ---
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
