// public/js/ui.js
// ======================================================================
// UI MODULE ("The Interior Decorator")
// PHIÊN BẢN ĐÃ SỬA LỖI CÚ PHÁP
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
        phaseTitle: document.getElementById('phase-title'),
        timerDisplay: document.getElementById('timer-display'),
        leaderboardList: document.getElementById('leaderboard-list'),
        playersContainer: document.getElementById('players-container'),
        chatMessages: document.getElementById('chat-messages'),
        actionContainer: document.getElementById('action-container'),
        phaseDescription: document.getElementById('phase-description'),
        choiceButtonsContainer: document.getElementById('choice-buttons-container'),
        skipCoordinationBtn: document.getElementById('skip-coordination-btn'),
        nextDayBtn: document.getElementById('next-day-btn'),
        messageArea: document.getElementById('message-area'),
        twilightOverlay: document.getElementById('twilight-overlay'),
        twilightGrid: document.getElementById('twilight-player-list'),
        twilightRestBtn: document.getElementById('twilight-rest-btn'),
        twilightCloseBtn: document.getElementById('twilight-close-btn'),
    },
    audioCache: {},
    isMuted: false,
    // [FIX] Thêm nơi lưu trữ dữ liệu game
    gameData: { allRoles: {}, allDecrees: {} },

    // --- II. HÀM KHỞI TẠO ---
    initEventListeners() {
        const rulebookBtn = document.getElementById('rulebook-btn');
        if (rulebookBtn) {
            rulebookBtn.addEventListener('click', () => {
                this.playSound('click');
                this.showRulebook();
            });
        }

        const historyBtn = document.getElementById('history-log-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.playSound('click');
                UI.showGameHistory(state.gameHistory);
            });
        }

        this.gameElements.choiceButtonsContainer.querySelectorAll('.choice-buttons').forEach(button => {
            button.addEventListener('click', () => {
                const choice = button.getAttribute('data-action');
                Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice: choice });
                this.setupPhaseUI('wait');
            });
        });

        this.gameElements.skipCoordinationBtn.addEventListener('click', () => {
            this.playSound('click');
            Network.emit('voteSkipCoordination', state.currentRoomCode);
            this.setupPhaseUI('wait');
        });

        this.gameElements.twilightRestBtn.addEventListener('click', () => {
            this.gameElements.twilightOverlay.style.display = 'none';
            Network.emit('voteSkipTwilight', state.currentRoomCode);
        });

        this.gameElements.twilightCloseBtn.addEventListener('click', () => {
            this.gameElements.twilightOverlay.style.display = 'none';
        });

        this.gameElements.nextDayBtn.addEventListener('click', () => {
            if (state.myId === state.currentHostId) {
                this.playSound('click');
                Network.emit('nextRound', state.currentRoomCode);
            }
        });

        this.gameElements.playersContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.player-avatar-card');
            if (!card) return;
            if (state.gamePhase === 'coordination') {
                if (card.querySelector('.is-self')) return;
                const targetId = card.getAttribute('data-player-id');
                Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
                this.setupPhaseUI('wait', { title: 'Đã Phối Hợp!' });
            }
        });
    },

    // --- III. CÁC HÀM TIỆN ÍCH CƠ BẢN ---
    toggleMasterMute() {
        this.isMuted = !this.isMuted;
        document.getElementById('music-toggle-btn').textContent = this.isMuted ? '🔇' : '🎵';
        const music = document.getElementById('background-music');
        if (music) music.muted = this.isMuted;
        for (const sound in this.audioCache) {
            this.audioCache[sound].muted = this.isMuted;
        }
    },

    playSound(soundName) {
        try {
            const audio = this.audioCache[soundName] || new Audio(`/assets/sounds/${soundName}.mp3`);
            this.audioCache[soundName] = audio;
            audio.muted = this.isMuted;
            audio.currentTime = 0;
            audio.play();
        } catch (e) {
            console.error(`Lỗi âm thanh '${soundName}':`, e);
        }
    },

    showScreen(screenName) {
        ['home-screen', 'room-screen', 'game-screen'].forEach(id => {
            const screen = document.getElementById(id);
            if (screen) screen.style.display = 'none';
        });
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.style.display = (screenName === 'game') ? 'flex' : 'block';
        }
    },

    showNightTransition(dayNumber) {
        const overlay = document.getElementById('night-transition-overlay');
        const text = document.getElementById('night-transition-text');
        if (text) text.textContent = `Ngày thứ ${dayNumber}`;
        if (overlay) {
            overlay.classList.add('active');
            setTimeout(() => overlay.classList.remove('active'), 2000);
        }
    },
    
    // [FIX] Sửa lại hàm để gọi populateRulebook vào đúng thời điểm
    showRulebook() {
        const rulebookTemplate = document.getElementById('rulebook-template');
        if (!rulebookTemplate) {
            console.error("Lỗi: Không tìm thấy #rulebook-template!");
            Swal.fire('Lỗi', 'Không thể tải được nội dung sách luật.', 'error');
            return;
        }
        const rulebookHTML = rulebookTemplate.innerHTML;

        Swal.fire({
            html: rulebookHTML,
            width: '90%',
            customClass: { popup: 'rulebook-popup' },
            background: 'var(--bg-medium)',
            color: 'var(--text-light)',
            showCloseButton: true,
            showConfirmButton: false,
            didOpen: () => {
                const popup = Swal.getPopup();
                if (!popup) return;
                
                // Bây giờ mới gọi hàm populate, khi popup đã tồn tại
                this.populateRulebook(popup);

                const tabs = popup.querySelectorAll('.rulebook-tab');
                const pages = popup.querySelectorAll('.rulebook-page');
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const targetId = tab.getAttribute('data-target');
                        const targetPage = popup.querySelector(`#${targetId}`);
                        pages.forEach(p => p.classList.remove('active'));
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        if (targetPage) {
                            targetPage.classList.add('active');
                        }
                    });
                });
            }
        });
    },

    savePlayerName() {
        const name = this.homeElements.nameInput.value;
        if (name) localStorage.setItem('tho-san-co-vat-playerName', name);
    },

    loadPlayerName() {
        const savedName = localStorage.getItem('tho-san-co-vat-playerName');
        if (savedName) this.homeElements.nameInput.value = savedName;
    },

    addCopyToClipboard() {
        const roomCodeDisplay = this.roomElements.roomCodeDisplay;
        if (!roomCodeDisplay || !roomCodeDisplay.textContent) return;
        const parent = roomCodeDisplay.parentNode;
        const existingBtn = parent.querySelector('.copy-btn');
        if (existingBtn) existingBtn.remove();
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Sao chép mã';
        copyButton.className = 'copy-btn';
        copyButton.style.marginLeft = '15px';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(roomCodeDisplay.textContent).then(() => {
                this.playSound('success');
                copyButton.textContent = 'Đã chép!';
                setTimeout(() => { copyButton.textContent = 'Sao chép mã'; }, 2000);
            });
        };
        parent.insertBefore(copyButton, roomCodeDisplay.nextSibling);
    },

    applyShakeEffect(playerId) {
        const card = document.querySelector(`.player-avatar-card[data-player-id="${playerId}"] .avatar`);
        if (card) {
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 800);
        }
    },

    startTimer(duration) {
        const timerDisplay = this.gameElements.timerDisplay;
        if (!timerDisplay) return;
        let timeLeft = duration;
        if (window.countdownInterval) clearInterval(window.countdownInterval);
        timerDisplay.textContent = timeLeft;
        window.countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) {
                clearInterval(window.countdownInterval);
                timerDisplay.textContent = "Hết giờ!";
            } else {
                timerDisplay.textContent = timeLeft;
            }
        }, 1000);
    },

    clearTimer() {
        if (window.countdownInterval) clearInterval(window.countdownInterval);
        const timerDisplay = this.gameElements.timerDisplay;
        if (timerDisplay) timerDisplay.textContent = '';
    },

    updatePlayerList(players, hostId, myId) {
        const list = this.roomElements.playerList;
        if (!list) return;
        list.innerHTML = '';
        const allReady = players.filter(p => !p.isBot && p.id !== hostId).every(p => p.isReady);
        players.forEach(player => {
            const li = document.createElement('li');
            let nameHTML = '';
            if (player.id === hostId) nameHTML += '👑 ';
            if (!player.isBot && player.id !== hostId) nameHTML += player.isReady ? '✅ ' : '❌ ';
            nameHTML += player.name;
            if (player.isBot) nameHTML += ' [AI]';
            if (player.id === myId) nameHTML += ' (Bạn)';
            li.innerHTML = `<span>${nameHTML.trim()}</span>`;
            if (myId === hostId && player.id !== myId) {
                const kickBtn = document.createElement('button');
                kickBtn.textContent = 'Đuổi';
                kickBtn.className = 'kick-btn';
                kickBtn.onclick = () => Network.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId: player.id });
                li.appendChild(kickBtn);
            }
            list.appendChild(li);
        });
        this.roomElements.hostControls.style.display = myId === hostId ? 'block' : 'none';
        this.roomElements.playerControls.style.display = myId !== hostId && players.some(p => p.id === myId) ? 'block' : 'none';
        if (myId === hostId) {
            this.roomElements.startGameBtn.disabled = players.length < 2 || !allReady;
        } else {
            const myPlayer = players.find(p => p.id === myId);
            if (myPlayer) this.roomElements.readyBtn.textContent = myPlayer.isReady ? 'Bỏ Sẵn Sàng' : 'Sẵn Sàng';
        }
    },

    displayRole(role) {
        const container = this.gameElements.roleDisplay;
        if (!container) return;
        let skillButtonHTML = '';
        if (role.hasActiveSkill) {
            const cost = role.currentSkillCost;
            const costText = cost > 0 ? ` (-${cost}💎)` : '';
            skillButtonHTML = `<button class="skill-button" id="skill-btn">${role.skillName}${costText}</button>`;
        }
        const skillDescription = role.description.skill.replace('[Mỗi Đêm] ', '');
        container.innerHTML = `
            <h4>Vai Trò Của Bạn: <strong>${role.name}</strong></h4>
            <div style="text-align: left; line-height: 1.5;">
                <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                <p><strong>Kỹ Năng:</strong> ${skillDescription}</p>
            </div>
            ${skillButtonHTML}
        `;
        container.style.display = 'block';
    },

    updatePlayerCards(players, myId) {
        const container = this.gameElements.playersContainer;
        if (!container) return;
        container.innerHTML = '';
        players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-avatar-card';
            card.setAttribute('data-player-id', player.id);
            const displayName = player.name.length > 6 ? player.name.substring(0, 6) + '...' : player.name;
            card.innerHTML = `
                <div class="avatar ${player.id === myId ? 'is-self' : ''}">${player.name[0].toUpperCase()}</div>
                <div class="player-name" title="${player.name}">${displayName}</div>
            `;
            container.appendChild(card);
        });
    },

    updateLeaderboard(players) {
        const list = this.gameElements.leaderboardList;
        if (!list) return;
        list.innerHTML = '';
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        sortedPlayers.forEach(player => {
            const item = document.createElement('li');
            item.className = 'leaderboard-item';
            item.innerHTML = `<span class="leaderboard-name">${player.name}</span> <span class="leaderboard-score">${player.score}</span>`;
            list.appendChild(item);
        });
    },

    // [FIX] Sửa lại hàm để tìm container bên trong popup
    populateRulebook(popupElement) {
        const rolesContainer = popupElement.querySelector('#all-roles-list-container');
        const decreesContainer = popupElement.querySelector('#all-decrees-list-container');
        const { allRoles, allDecrees } = this.gameData;

        if (rolesContainer && allRoles) {
            let rolesHTML = '';
            for (const roleId in allRoles) {
                const role = allRoles[roleId];
                rolesHTML += `
                    <div class="role-item">
                        <h4>${role.name}</h4>
                        <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                        <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                        <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
                    </div>
                `;
            }
            rolesContainer.innerHTML = rolesHTML;
        }

        if (decreesContainer && allDecrees) {
            let decreesHTML = '';
            for (const decreeId in allDecrees) {
                const decree = allDecrees[decreeId];
                decreesHTML += `
                    <div class="decree-item">
                        <h4>${decree.name}</h4>
                        <p>${decree.description}</p>
                    </div>
                `;
            }
            decreesContainer.innerHTML = decreesHTML;
        }
    },

    displayRolesInGame(rolesInThisGame) {
        const container = document.getElementById('roles-in-game-list');
        if (!container) return;
        let rolesHTML = '';
        rolesInThisGame.forEach(role => {
            rolesHTML += `
                <li class="role-in-game-item">
                    <details>
                        <summary class="role-name">${role.name}</summary>
                        <p class="role-detail"><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                        <p class="role-detail"><strong>Nội Tại:</strong> ${role.description.passive}</p>
                        <p class="role-detail"><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
                    </details>
                </li>
            `;
        });
        container.innerHTML = rolesHTML;
    },

    setupPhaseUI(phaseName, options = {}) {
        const { phaseTitle, phaseDescription, choiceButtonsContainer, skipCoordinationBtn, nextDayBtn, twilightOverlay, timerDisplay } = this.gameElements;
        document.body.classList.remove('selecting-target');
        phaseDescription.innerHTML = '';
        timerDisplay.innerHTML = '';
        choiceButtonsContainer.style.display = 'none';
        skipCoordinationBtn.style.display = 'none';
        nextDayBtn.style.display = 'none';
        twilightOverlay.style.display = 'none';

        switch (phaseName) {
            case 'choice':
                phaseTitle.textContent = 'Giai Đoạn Thám Hiểm';
                phaseDescription.innerHTML = 'Bí mật chọn hành động của bạn.';
                choiceButtonsContainer.style.display = 'flex';
                choiceButtonsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
                break;
            case 'coordination':
                phaseTitle.textContent = 'Phối Hợp';
                phaseDescription.innerHTML = 'Chọn một người chơi để đề nghị Phối Hợp.';
                skipCoordinationBtn.style.display = 'inline-block';
                document.body.classList.add('selecting-target');
                break;
            case 'twilight':
                this.showTwilightUI(state.players, state.myId);
                break;
            case 'wait':
                phaseTitle.textContent = options.title || 'Đã Chọn!';
                phaseDescription.innerHTML = options.description || '<p>Đang chờ những người khác...</p>';
                break;
            case 'reveal':
                phaseTitle.textContent = 'Giai Đoạn Phán Xét';
                phaseDescription.innerHTML = '<p>Kết quả đang được công bố...</p>';
                break;
            case 'end_of_round':
                phaseTitle.textContent = 'Đêm Đã Kết Thúc';
                phaseDescription.innerHTML = 'Đang chờ Trưởng Đoàn...';
                if (options.isHost) {
                    nextDayBtn.style.display = 'inline-block';
                }
                break;
        }
    },

    showTwilightUI(players, myId) {
        const { twilightOverlay, twilightGrid } = this.gameElements;
        twilightGrid.innerHTML = '';
        players.filter(p => p.id !== myId && !p.disconnected).forEach(player => {
            const item = document.createElement('li');
            item.className = 'twilight-player-item';
            item.innerHTML = `
                <div class="player-avatar-small">${player.name[0].toUpperCase()}</div>
                <span class="player-name">${player.name}</span>
                <div class="action-buttons"><button class="accuse-btn">Vạch Trần</button></div>
            `;
            item.querySelector('.accuse-btn').onclick = () => {
                twilightOverlay.style.display = 'none';
                this.promptForAccusation(player.id, player.name);
            };
            twilightGrid.appendChild(item);
        });
        twilightOverlay.style.display = 'flex';
    },

    promptForPlayerTarget(title, onSelected) {
        const inputOptions = {};
        state.players.filter(p => p.id !== state.myId && !p.disconnected).forEach(p => {
            inputOptions[p.id] = p.name;
        });

        Swal.fire({
            title: title, input: 'select', inputOptions: inputOptions,
            inputPlaceholder: 'Chọn một người chơi', showCancelButton: true,
            confirmButtonText: 'Xác nhận', cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                onSelected(result.value);
            }
        });
    },

    promptForFactionChoice(title, onSelected) {
        Swal.fire({
            title: title,
            html: `
                <p>Chọn một phe để đặt cược hoặc tuyên bố.</p>
                <div class="action-choices-popup" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                    <button class="swal2-styled loyal" data-action="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled corrupt" data-action="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled blank" data-action="Quan Sát">👁️ Quan Sát</button>
                </div>`,
            showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.action-choices-popup button').forEach(button => {
                    button.addEventListener('click', () => {
                        const chosenAction = button.getAttribute('data-action');
                        onSelected(chosenAction);
                        Swal.close();
                    });
                });
            },
        });
    },

    promptForMindControlAction(onSelected) {
        Swal.fire({
            title: 'Điều Khiển',
            html: `
                <p>Bạn muốn mục tiêu thực hiện hành động gì?</p>
                <div class="action-choices-popup" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                    <button class="swal2-styled" data-action="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled" data-action="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled" data-action="Quan Sát">👁️ Quan Sát</button>
                </div>`,
            showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.action-choices-popup button').forEach(button => {
                    button.addEventListener('click', () => {
                        const chosenAction = button.getAttribute('data-action');
                        onSelected(chosenAction);
                        Swal.close();
                    });
                });
            },
        });
    },

    promptForAccusation(targetId, targetName) {
        Swal.fire({
            title: `Vạch Trần ${targetName}`,
            html: `
                <p>Bạn nghĩ họ đã thực hiện hành động gì?</p>
                <div class="action-choices-popup" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                    <button class="swal2-styled" data-guess="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled" data-guess="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled" data-guess="Quan Sát">👁️ Quan Sát</button>
                </div>`,
            showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.action-choices-popup button').forEach(button => {
                    button.addEventListener('click', () => {
                        const guess = button.getAttribute('data-guess');
                        Swal.close();
                        Network.emit('requestAccusation', { roomCode: state.currentRoomCode, targetId, guess });
                    });
                });
            }
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                this.showTwilightUI(state.players, state.myId);
            }
        });
    },

    showGameHistory(history) {
        if (!history || history.length === 0) {
            return Swal.fire({ title: 'Lịch Sử Ván Đấu', text: 'Chưa có ngày nào kết thúc.', background: '#2d3748', color: '#e2e8f0' });
        }
        let historyHTML = '<div style="text-align: left;">';
        history.forEach(roundData => {
            const winnerText = roundData.results.isDraw ? 'Hòa' : `Phe ${roundData.results.winner} thắng`;
            historyHTML += `
                <details>
                    <summary><strong>Ngày ${roundData.round}:</strong> ${winnerText}</summary>
                    <p>Phiếu: 📜${roundData.votes['Giải Mã']} 💣${roundData.votes['Phá Hoại']} 👁️${roundData.votes['Quan Sát']}</p>
                    <ul>
                        ${(roundData.results.roundSummary || []).map(p => `<li>${p.name}: ${p.oldScore} → ${p.newScore}</li>`).join('')}
                    </ul>
                </details>
                <hr>
            `;
        });
        historyHTML += '</div>';
        Swal.fire({ title: 'Lịch Sử Ván Đấu', html: historyHTML, background: '#2d3748', color: '#e2e8f0' });
    },

    showRoundSummary(results, finalVoteCounts) {
        const { winner, isDraw, roundSummary } = results;
        let title = isDraw ? '⚖️ Ngày Nay Hoà!' : `🏆 Phe ${winner} Thắng!`;
        let summaryHTML = `
            <div style="text-align: left; margin-bottom: 20px;">
                <strong>Tổng kết phiếu:</strong> 
                📜 ${finalVoteCounts['Giải Mã']} | 💣 ${finalVoteCounts['Phá Hoại']} | 👁️ ${finalVoteCounts['Quan Sát']}
            </div>
            <table class="swal2-table" style="width: 100%;">
                <thead><tr><th>Người Chơi</th><th>Hành Động</th><th>Chi Tiết Điểm</th><th>Kết Quả</th></tr></thead>
                <tbody>`;
        roundSummary.forEach(player => {
            let totalChange = player.newScore - player.oldScore;
            let changeClass = totalChange > 0 ? 'success-text' : (totalChange < 0 ? 'error-text' : '');
            let changeText = totalChange > 0 ? `+${totalChange}` : totalChange;
            let details = player.changes.map(c => `${c.reason}: ${c.amount > 0 ? '+' : ''}${c.amount}`).join('<br>');
            if (player.changes.length === 0) details = 'Không đổi';
            let actionText = player.chosenAction;
            if (player.actionWasNullified) {
                actionText = `<s style="color: #a0aec0;" title="Hành động bị vô hiệu hóa">${player.chosenAction}</s>`;
            }
            summaryHTML += `
                <tr>
                    <td>${player.name}</td>
                    <td>${actionText}</td>
                    <td>${details}</td>
                    <td>${player.oldScore} <span class="${changeClass}">${changeText}</span> → <strong>${player.newScore}</strong></td>
                </tr>
            `;
        });
        summaryHTML += '</tbody></table>';
        Swal.fire({
            title: title, html: summaryHTML, width: '90%',
            customClass: { container: 'rulebook-modal' },
            background: '#2d3748', color: '#e2e8f0', confirmButtonText: 'OK'
        });
    },

    showGameOver(data) {
        let title = "Hoà!";
        let text = "Không ai hoàn thành được mục tiêu của mình.";
        if (data.winner) {
            title = `${data.winner.name} đã chiến thắng!`;
            text = `Lý do: ${data.winner.reason}`;
        }
        Swal.fire({
            title: title, text: text, icon: data.winner ? 'success' : 'info',
            background: '#2d3748', color: '#e2e8f0', confirmButtonText: 'Tuyệt vời!',
        }).then(() => {
            if (state.myId === state.currentHostId) {
                // Bạn có thể thêm một case 'end_of_game' trong setupPhaseUI để hiển thị nút chơi lại
            }
        });
    },

    addChatMessage(sender, message) {
        const container = this.gameElements.chatMessages;
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'chat-message';
        const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
        div.innerHTML = `<strong class="chat-sender">${sender}:</strong> ${sanitizedMessage}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    addLogMessage(message, type = 'info') {
        const container = this.gameElements.messageArea;
        if (!container) return;
        const p = document.createElement('p');
        p.className = type;
        p.innerHTML = message;
        container.insertBefore(p, container.firstChild);
    },
};
window.UI = UI;