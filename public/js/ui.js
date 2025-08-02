// UI MODULE ("The Interior Decorator")
// Chịu trách nhiệm cập nhật, hiển thị, và thao tác giao diện người dùng (HTML/CSS). Nhận lệnh từ client.js.

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
        roundIndicator: document.querySelector('.round-indicator'), // Thêm cho nhãn ngày
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
    isMuted: false,

    // --- II. ÂM THANH & NHẠC NỀN ---
    toggleMasterMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('music-toggle-btn');
        btn.textContent = this.isMuted ? '🔇' : '🎵';
        const music = document.getElementById('background-music');
        if (music) music.muted = this.isMuted;
        for (const soundName in this.audioCache) {
            this.audioCache[soundName].muted = this.isMuted;
        }
    },

    playSound(soundName) {
        try {
            if (this.audioCache[soundName]) {
                const audio = this.audioCache[soundName];
                audio.muted = this.isMuted;
                audio.currentTime = 0;
                audio.play();
            } else {
                const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
                audio.muted = this.isMuted;
                this.audioCache[soundName] = audio;
                audio.play();
            }
        } catch (e) {
            console.error(`Không thể phát âm thanh '${soundName}':`, e);
        }
    },

    // --- III. HIỆU ỨNG, CHUYỂN CẢNH, VÒNG CHƠI ---
    showScreen(screenName) {
        [this.homeElements.screen, this.roomElements.screen, this.gameElements.screen].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (screenName === 'home') this.homeElements.screen.style.display = 'block';
        if (screenName === 'room') this.roomElements.screen.style.display = 'block';
        if (screenName === 'game') this.gameElements.screen.style.display = 'block';
    },

    showDayTransition(dayNumber) {
        const overlay = document.getElementById('night-transition-overlay');
        const text = document.getElementById('night-transition-text');
        if (text) text.textContent = `Ngày thứ ${dayNumber}`;
        if (overlay) {
            overlay.classList.add('active');
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 2000);
        }
    },

    showNightTransition(dayNumber) {
        // Đã chuyển thành ngày!
        const overlay = document.getElementById('night-transition-overlay');
        const text = document.getElementById('night-transition-text');
        if (text) text.textContent = `Ngày thứ ${dayNumber}`;
        if (overlay) {
            overlay.classList.add('active');
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 2000);
        }
    },

    setRoundLabel(dayNumber) {
        if (this.gameElements.roundIndicator) {
            this.gameElements.roundIndicator.innerHTML = `Ngày Thứ: <span id="current-round">${dayNumber}</span>`;
        }
    },

    // --- IV. DANH SÁCH NGƯỜI CHƠI & KICK ---
    updatePlayerList(players, hostId, myId) {
        this.roomElements.playerList.innerHTML = '';
        const allPlayersReady = players
            .filter(p => p.id !== hostId && !p.isBot)
            .every(p => p.isReady);

        players.forEach(player => {
            const li = document.createElement('li');
            let nameHTML = player.name;
            if (player.id !== hostId && !player.isBot) {
                nameHTML = (player.isReady ? '✅' : '❌') + ' ' + nameHTML;
            }
            if (player.id === myId) nameHTML += ' (Bạn)';
            if (player.id === hostId) nameHTML = '👑 ' + nameHTML;
            if (player.isBot) nameHTML += ' [BOT]';

            li.innerHTML = `<span>${nameHTML}</span>`;

            // Nút kick, áp dụng cho cả bot
            if (myId === hostId && player.id !== myId) {
                const kickBtn = document.createElement('button');
                kickBtn.textContent = 'Đuổi';
                kickBtn.className = 'kick-btn';
                kickBtn.onclick = () => {
                    if (typeof Network !== "undefined" && Network.emit) {
                        Network.emit('kickPlayer', {
                            roomCode: state.currentRoomCode,
                            playerId: player.id,
                            isBot: !!player.isBot
                        });
                    }
                };
                li.appendChild(kickBtn);
            }
            this.roomElements.playerList.appendChild(li);
        });

        if (myId === hostId) {
            this.roomElements.hostControls.style.display = 'block';
            this.roomElements.playerControls.style.display = 'none';
            this.roomElements.startGameBtn.disabled = players.length < 2 || !allPlayersReady;
        } else {
            this.roomElements.hostControls.style.display = 'none';
            this.roomElements.playerControls.style.display = 'block';
            const myPlayer = players.find(p => p.id === myId);
            this.roomElements.readyBtn.textContent = myPlayer?.isReady ? 'Bỏ Sẵn Sàng' : 'Sẵn Sàng';
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

    // --- V. HIỆN THẺ NGƯỜI CHƠI & HIỆU ỨNG SHAKE ---
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

    applyShakeEffect(playerId) {
        const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
        if (card) {
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 800);
        }
    },

    // --- VI. HIỂN THỊ VAI TRÒ, KỸ NĂNG ---
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

    displayDecree(decreeData) {
        this.gameElements.decreeDisplay.innerHTML = `
            <p><span class="decree-title">Tiếng Vọng từ ${decreeData.drawerName}:</span> ${decreeData.decrees.map(d => `<strong>${d.name}</strong> - ${d.description}`).join('<br>')}</p>
        `;
        this.gameElements.decreeDisplay.style.display = 'block';
    },

    // --- VII. GIAI ĐOẠN, ĐỒNG HỒ, HÀNH ĐỘNG ---
    updatePhaseDisplay(title, description = '') {
        this.gameElements.phaseTitle.textContent = title;
        this.gameElements.actionControls.innerHTML = `${description}<div id="timer-display"></div>`;
    },

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

    clearTimer() {
        if (window.countdownInterval) {
            clearInterval(window.countdownInterval);
        }
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) timerDisplay.innerHTML = '';
    },

    renderChoiceButtons() {
        this.updatePhaseDisplay(
            'Giai Đoạn Thám Hiểm',
            '<p>Bí mật chọn hành động của bạn trong ngày hôm nay.</p>'
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
                if (typeof Network !== "undefined" && Network.emit) {
                    Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice: choice });
                }
                document.querySelectorAll('.choice-buttons').forEach(btn => btn.disabled = true);
                this.updatePhaseDisplay('Đã chọn!', '<p>Đang chờ những người khác...</p>');
            });
        });
    },

    showNextDayButton(onClick) {
        this.gameElements.actionControls.innerHTML = '';
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Bắt Đầu Ngày Tiếp Theo';
        nextBtn.className = 'next-day-btn';
        nextBtn.onclick = () => {
            UI.playSound('click');
            onClick();
        };
        this.gameElements.actionControls.appendChild(nextBtn);
    },

    // --- VIII. POPUP, CHỌN MỤC TIÊU, KỸ NĂNG ĐẶC BIỆT ---
    promptForPlayerTarget(title, onSelected) {
        const inputOptions = {};
        if (typeof state !== "undefined" && Array.isArray(state.players)) {
            state.players.filter(p => p.id !== state.myId).forEach(p => {
                inputOptions[p.id] = p.name;
            });
        }
        Swal.fire({
            title: title,
            input: 'select',
            inputOptions: inputOptions,
            inputPlaceholder: 'Chọn một người chơi',
            showCancelButton: true,
            background: '#2d3748',
            color: '#e2e8f0',
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                onSelected(result.value);
            }
        });
    },

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
                        if (typeof Network !== "undefined" && Network.emit) {
                            Network.emit('requestAccusation', {
                                roomCode: state.currentRoomCode,
                                targetId: targetId,
                                guess: guess
                            });
                        }
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

    // --- IX. HIỆN LỊCH SỬ: Đổi nhãn "Ngày" ---
    showGameHistory(history) {
        if (!history || history.length === 0) {
            return Swal.fire({ title: 'Lịch Sử Ván Đấu', text: 'Chưa có ngày nào kết thúc.', background: '#2d3748', color: '#e2e8f0' });
        }
        let historyHTML = '<div style="text-align: left;">';
        history.forEach(roundData => {
            historyHTML += `
                <details>
                    <summary><strong>Ngày ${roundData.round}:</strong> Phe ${roundData.results.winner || 'Hòa'} thắng</summary>
                    <p>Phiếu: 📜${roundData.votes['Giải Mã']} 💣${roundData.votes['Phá Hoại']} 👁️${roundData.votes['Quan Sát']}</p>
                    <ul>
                        ${(roundData.results.roundSummary || []).map(p => `<li>${p.name}: ${p.oldScore} → ${p.newScore}</li>`).join('')}
                    </ul>
                </details>
                <hr>
            `;
        });
        historyHTML += '</div>';
        Swal.fire({
            title: 'Lịch Sử Ván Đấu',
            html: historyHTML,
            background: '#2d3748',
            color: '#e2e8f0'
        });
    },

    // --- X. HIỂN KẾT QUẢ, GAMEOVER ---
    showRoundSummary(results, finalVoteCounts) {
        const { winner, isDraw, roundSummary } = results;
        let title = isDraw ? '⚖️ Ngày Nay Hoà!' : `🏆 Phe ${winner} Thắng!`;
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
			   let actionText = player.chosenAction;
        if (player.actionWasNullified) {
            // Thêm dấu hiệu gạch ngang và tooltip giải thích
            actionText = `<s style="color: #a0aec0;" title="Hành động bị vô hiệu hóa bởi một kỹ năng hoặc hiệu ứng.">${player.chosenAction}</s>`;
        }
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
    },

    showGameOver(data) {
        let title = "Hoà!";
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
                if (typeof Network !== "undefined" && Network.emit) {
                    Network.emit('playAgain', state.currentRoomCode);
                }
            });
        }
    },

    // --- XI. LƯU & TẢI TÊN NGƯỜI CHƠI ---
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

    // --- XII. HIỂN THỊ LOG MESSAGE ---
	addChatMessage(sender, message) {
    if (this.gameElements.chatMessages) {
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `<strong>${sender}:</strong> ${message}`;
        this.gameElements.chatMessages.appendChild(div);
    }
},
    addLogMessage(message) {
        // Hiển thị log ở giao diện chat nếu có, hoặc log ra console
        if (this.gameElements.chatMessages) {
            const div = document.createElement('div');
            div.className = 'log-message';
            div.textContent = message;
            this.gameElements.chatMessages.appendChild(div);
        } else {
            console.log('[Log]', message);
        }
    }
	
};

window.UI = UI;