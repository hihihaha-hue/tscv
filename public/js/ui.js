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
        twilightPlayerList: document.getElementById('twilight-player-list'),
        twilightRestBtn: document.getElementById('twilight-rest-btn'),
        twilightCloseBtn: document.getElementById('twilight-close-btn'),
        rolesInGameList: document.getElementById('roles-in-game-list'),
        artifactDisplay: document.getElementById('artifact-display'),
        artifactInfo: document.getElementById('artifact-info'),
        noArtifactMessage: document.getElementById('no-artifact-message'),
        artifactName: document.getElementById('artifact-name'),
        artifactDescription: document.getElementById('artifact-description'),
        useArtifactBtn: document.getElementById('use-artifact-btn'),
    },
    audioCache: {},
    isMuted: false,
    isAudioUnlocked: false, // [SỬA LỖI] Biến trạng thái để mở khóa âm thanh
    gameData: { allRoles: {}, allDecrees: {}, allArtifacts: {} },
	  
    // [SỬA LỖI] Cập nhật hàm startMusic để xử lý việc mở khóa
    startMusic() {
        if (!this.isAudioUnlocked) {
            console.log('Audio is not unlocked yet. Music will start after first user interaction.');
            return;
        }
        const music = document.getElementById('background-music');
        if (music && music.paused) {
            music.play().catch(error => console.log("Lỗi tự động phát nhạc:", error));
        }
    },

    // --- II. HÀM KHỞI TẠO ---
        initEventListeners() {
        this.gameElements.choiceButtonsContainer.querySelectorAll('.choice-buttons').forEach(button => {
            button.addEventListener('click', () => {
                const choice = button.getAttribute('data-action');
                
                if (choice === 'Phá Hoại') {
                    this.promptForPlayerTarget('Chọn mục tiêu để Phá Hoại', (targetId) => {
                        if (targetId) {
                            Network.emit('playerChoice', {
                                roomCode: state.currentRoomCode,
                                choice: choice,
                                payload: { targetId: targetId }
                            });
                            this.setupPhaseUI('wait', { title: 'Đã Chọn Hành Động' });
                        }
                    });
                } else {
                    Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice: choice });
                    this.setupPhaseUI('wait', { title: 'Đã Chọn Hành Động' });
                }
            });
        });

        this.gameElements.skipCoordinationBtn.addEventListener('click', () => {
            this.playSound('click');
            Network.emit('voteSkipCoordination', state.currentRoomCode);
            this.setupPhaseUI('wait', { title: 'Đang Chờ...' });
        });
        
        this.gameElements.twilightRestBtn.addEventListener('click', () => {
            this.playSound('click');
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
            if (!card || card.classList.contains('is-self') || !this.gameElements.playersContainer.classList.contains('selecting-target')) return;
            
            const targetId = card.getAttribute('data-player-id');
            if (state.gamePhase === 'coordination') {
                 Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
                 this.setupPhaseUI('wait', { title: 'Đã Phối Hợp!'});
            }
        });
        
        if (this.gameElements.useArtifactBtn) {
            this.gameElements.useArtifactBtn.addEventListener('click', () => {
                const artifactId = this.gameElements.useArtifactBtn.dataset.artifactId;
                if (!artifactId) return;

                this.playSound('click');
                let payload = {};
                const emitArtifactUse = (p) => {
                    Network.emit('useArtifact', { roomCode: state.currentRoomCode, artifactId: artifactId, payload: p });
                    this.gameElements.useArtifactBtn.disabled = true;
                    this.gameElements.useArtifactBtn.textContent = 'Đã Kích hoạt';
                };

                switch (artifactId) {
                    case 'CHAIN_OF_MISTRUST':
                        // Quy trình chọn 2 người
                        this.promptForPlayerTarget('Chọn người chơi ĐẦU TIÊN để liên kết', (targetId1) => {
                            if (targetId1) {
                                // Lọc người đã chọn ra khỏi danh sách
                                const remainingPlayers = state.players.filter(p => p.id !== state.myId && p.id !== targetId1 && !p.disconnected);
                                this.promptForPlayerTarget('Chọn người chơi THỨ HAI để liên kết', (targetId2) => {
                                    if (targetId2) {
                                        payload.targetId1 = targetId1;
                                        payload.targetId2 = targetId2;
                                        emitArtifactUse(payload);
                                    }
                                }, remainingPlayers); // Truyền danh sách đã lọc
                            }
                        });
                        break;
                    case 'ARROW_OF_AMNESIA':
                    case 'MARK_OF_BETRAYAL':
                        this.promptForPlayerTarget('Chọn mục tiêu cho Cổ vật', (targetId) => {
                            payload.targetId = targetId;
                            emitArtifactUse(payload);
                        });
                        break;
                    default:
                        emitArtifactUse(payload);
                        break;
                }
            });
        }
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

    // [SỬA LỖI] Cập nhật hàm playSound để xử lý việc mở khóa
    playSound(soundName) {
        // Mở khóa âm thanh nếu chưa làm
        if (!this.isAudioUnlocked) {
            console.log('Unlocking audio context...');
            const music = document.getElementById('background-music');
            if (music) {
                music.play().then(() => music.pause()).catch(() => {});
            }
            this.isAudioUnlocked = true;
        }
        
        try {
            const audio = this.audioCache[soundName] || new Audio(`/assets/sounds/${soundName}.mp3`);
            this.audioCache[soundName] = audio;
            audio.muted = this.isMuted;
            audio.currentTime = 0;
            audio.play().catch(e => console.error("Audio play failed:", e));
        } catch (e) {
            console.error(`Lỗi âm thanh '${soundName}':`, e);
        }
    },
	showScreen(screenName) {
        ['home-screen', 'room-screen', 'game-screen'].forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.style.display = (screenName === 'game') ? 'grid' : 'block';
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
	
	updateArtifactDisplay(artifacts) {
        const displayPanel = this.gameElements.artifactDisplay;
        if (!displayPanel) return;
        displayPanel.style.display = (state.gamePhase !== 'lobby' && state.gamePhase !== 'gameover') ? 'block' : 'none';

        const infoContainer = this.gameElements.artifactInfo;
        const noArtifactMsg = this.gameElements.noArtifactMessage;
        const useBtn = this.gameElements.useArtifactBtn;
        
        const artifact = artifacts && artifacts.length > 0 ? artifacts[0] : null;

        if (artifact) {
            infoContainer.style.display = 'block';
            noArtifactMsg.style.display = 'none';
            this.gameElements.artifactName.textContent = artifact.name;
            this.gameElements.artifactDescription.textContent = artifact.details.effect;
            
            useBtn.style.display = artifact.is_activatable ? 'block' : 'none';
            useBtn.disabled = false;
            useBtn.textContent = 'Kích hoạt';
            useBtn.dataset.artifactId = artifact.id;
        } else {
            infoContainer.style.display = 'none';
            noArtifactMsg.style.display = 'block';
        }
    },
    
   showRulebook() {
    const rulebookTemplate = document.getElementById('rulebook-template');
    if (!rulebookTemplate) {
        console.error("Không tìm thấy #rulebook-template trong index.html!");
        return;
    }

    const rulebookContent = rulebookTemplate.content.cloneNode(true);

    const rolesContainer = rulebookContent.querySelector('#all-roles-list-container');
    const decreesContainer = rulebookContent.querySelector('#all-decrees-list-container');
    const artifactsThContainer = rulebookContent.querySelector('#artifact-list-thám-hiểm');
    const artifactsHlContainer = rulebookContent.querySelector('#artifact-list-hỗn-loạn');

    if (rolesContainer && this.gameData.allRoles) {
        let rolesHTML = '';
        for (const roleId in this.gameData.allRoles) {
            const role = this.gameData.allRoles[roleId];
            rolesHTML += `<div class="role-item"><h4>${role.name}</h4><p><strong>Thiên Mệnh:</strong> ${role.description.win}</p><p><strong>Nội Tại:</strong> ${role.description.passive}</p><p><strong>Kỹ Năng:</strong> ${role.description.skill}</p></div><hr>`;
        }
        rolesContainer.innerHTML = rolesHTML;
    }

    if (decreesContainer && this.gameData.allDecrees) {
        let decreesHTML = '';
        for (const decreeId in this.gameData.allDecrees) {
            const decree = this.gameData.allDecrees[decreeId];
            decreesHTML += `<div class="decree-item"><h4>${decree.name}</h4><p>${decree.description}</p></div><hr>`;
        }
        decreesContainer.innerHTML = decreesHTML;
    }

    if (this.gameData.allArtifacts && artifactsThContainer && artifactsHlContainer) {
        let artifactsThHTML = '';
        let artifactsHlHTML = '';
        const createArtifactHTML = (artifact) => {
            if (!artifact.details) return '';
            return `
                <div class="artifact-detail-item">
                    <h4>${artifact.name}</h4>
                    <p class="artifact-flavor"><em>${artifact.details.flavor}</em></p>
                    <ul class="artifact-specs">
                        <li><strong>Loại:</strong> ${artifact.details.category}</li>
                        <li><strong>Kích hoạt:</strong> ${artifact.details.activation_type}</li>
                        <li><strong>Hiệu ứng:</strong> ${artifact.details.effect}</li>
                    </ul>
                </div><hr>`;
        };
        for (const artifactId in this.gameData.allArtifacts) {
            const artifact = this.gameData.allArtifacts[artifactId];
            const artifactHTML = createArtifactHTML(artifact);
            if (artifact.type === 'Thám Hiểm') artifactsThHTML += artifactHTML;
            else if (artifact.type === 'Hỗn Loạn') artifactsHlHTML += artifactHTML;
        }
        artifactsThContainer.innerHTML = artifactsThHTML;
        artifactsHlContainer.innerHTML = artifactsHlHTML;
    }
    
    const container = document.createElement('div');
    container.appendChild(rulebookContent);

    Swal.fire({
        html: container,
        width: '90%',
        maxWidth: '800px',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: { 
            popup: 'rulebook-popup', 
            htmlContainer: 'rulebook-swal-container' 
        },
        didOpen: () => {
            const popup = Swal.getPopup();
            if (!popup) return;
            const tabs = popup.querySelectorAll('.rulebook-tab');
            const pages = popup.querySelectorAll('.rulebook-page');

            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const targetId = tab.dataset.target; 
                    const targetPage = popup.querySelector(`#${targetId}`);
                    
                    tabs.forEach(t => t.classList.remove('active'));
                    pages.forEach(p => p.classList.remove('active'));
                    
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
            const cost = role.currentSkillCost || 0;
            const costText = cost > 0 ? ` (-${cost}💎)` : ' (Miễn Phí)';
            skillButtonHTML = `<button class="skill-button" id="skill-btn">${role.skillName}${costText}</button>`;
        }
        container.innerHTML = `
            <h4>Vai Trò Của Bạn: <strong>${role.name}</strong></h4>
            <div style="text-align: left; line-height: 1.5;">
                <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
            </div>
            ${skillButtonHTML}
        `;
        container.style.display = 'block';
    },

    attachSkillButtonListener() {
        const skillBtn = document.getElementById('skill-btn');
        if (skillBtn) {
            skillBtn.addEventListener('click', () => {
                this.playSound('click');
                const roleId = state.myRole.id;
                let payload = {};

                const emitSkill = (p) => {
                    Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: p });
                    UI.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng!' });
                };

                switch (roleId) {
                    case 'PROPHET': case 'PEACEMAKER': case 'MAGNATE': case 'PRIEST': case 'THIEF': case 'PHANTOM':
                        UI.promptForPlayerTarget('Chọn mục tiêu cho kỹ năng', (targetId) => {
                            payload.targetId = targetId;
                            emitSkill(payload);
                        });
                        break;
                    case 'MIND_BREAKER':
                        UI.promptForPlayerTarget('Chọn người để điều khiển', (targetId) => {
                            UI.promptForMindControlAction((chosenAction) => {
                                payload.targetId = targetId;
                                payload.chosenAction = chosenAction;
                                emitSkill(payload);
                            });
                        });
                        break;
                    case 'REBEL':
                        UI.promptForFactionChoice('Tuyên bố hành động', (declaredAction) => {
                            UI.promptForPlayerTarget('Chọn người để trừng phạt (nếu thành công)', (targetId) => {
                                payload.declaredAction = declaredAction;
                                payload.punishTargetId = targetId;
                                emitSkill(payload);
                            });
                        });
                        break;
						case 'MIMIC':
                        const targetRole = state.rolesInGame.find(r => r.name === "Kẻ Bắt Chước") // Cần tìm ra vai trò của mục tiêu
                        // Logic này khá phức tạp để biết kỹ năng của mục tiêu có cần target hay không
                        // Giải pháp đơn giản nhất là luôn hỏi, nếu kỹ năng không cần target thì server sẽ bỏ qua
                        UI.promptForPlayerTarget('Chọn mục tiêu cho kỹ năng bạn BẮT CHƯỚC (nếu cần)', (targetId) => {
                            payload.targetId = targetId;
                            // Người dùng có thể không chọn nếu kỹ năng không cần mục tiêu
                            // Nhưng để đơn giản, ta cứ gửi targetId
                            emitSkill(payload);
                        });
                        break;
                    case 'GAMBLER':
                        UI.promptForFactionChoice('Đặt cược vào phe thắng', (chosenFaction) => {
                            payload.chosenFaction = chosenFaction;
                            emitSkill(payload);
                        });
                        break;
                    default: 
                        emitSkill(payload);
                        break;
                }
            });
        }
    },
    updatePlayerCards(players, myId) {
        const container = this.gameElements.playersContainer;
        if (!container) return;
        container.innerHTML = ''; 

        players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-avatar-card';
            card.setAttribute('data-player-id', player.id);

            if (player.chosenAction) {
                card.classList.add('has-chosen');
            }
            
            if (player.id === myId) {
                card.classList.add('is-self');
            }

            const displayName = player.name.length > 10 ? player.name.substring(0, 9) + '…' : player.name;
            
            card.innerHTML = `
                <div class="avatar">${player.name[0].toUpperCase()}</div>
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

    displayRolesInGame(rolesInThisGame) {
        const container = this.gameElements.rolesInGameList;
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
        const { phaseTitle, phaseDescription, choiceButtonsContainer, skipCoordinationBtn, nextDayBtn, twilightOverlay, timerDisplay, playersContainer } = this.gameElements;
        playersContainer.classList.remove('selecting-target');
        phaseDescription.innerHTML = '';
        if (timerDisplay) timerDisplay.innerHTML = '';
        choiceButtonsContainer.style.display = 'none';
        skipCoordinationBtn.style.display = 'none';
        nextDayBtn.style.display = 'none';
        if (twilightOverlay) twilightOverlay.style.display = 'none';

        switch (phaseName) {
            case 'choice':
            case 'exploration': 
                phaseTitle.textContent = 'Giai Đoạn Thám Hiểm';
                phaseDescription.innerHTML = 'Bí mật chọn hành động của bạn.';
                choiceButtonsContainer.style.display = 'grid';
                choiceButtonsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
                break;
            case 'coordination':
                phaseTitle.textContent = 'Phối Hợp';
                 phaseDescription.innerHTML = 'Chọn một người chơi để đề nghị Phối Hợp, hoặc hành động một mình.';
                 skipCoordinationBtn.style.display = 'inline-block';
                 playersContainer.classList.add('selecting-target');
                 break;
            case 'twilight':
                phaseTitle.textContent = 'Hoàng Hôn';
                phaseDescription.innerHTML = 'Mở bảng Vạch Trần để hành động hoặc chọn Nghỉ Ngơi.';
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
        const { twilightOverlay, twilightPlayerList } = this.gameElements;
        if(!twilightOverlay || !twilightPlayerList) return;

        twilightPlayerList.innerHTML = '';
        players.filter(p => p.id !== myId && !p.isDefeated && !p.disconnected).forEach(player => {
            const item = document.createElement('li');
            item.className = 'twilight-player-item';
            item.innerHTML = `
                <div class="player-avatar-small">${player.name[0].toUpperCase()}</div>
                <span class="player-name">${player.name}</span>
                <div class="action-buttons"><button class="accuse-btn">Vạch Trần</button></div>
            `;
            item.querySelector('.accuse-btn').onclick = () => {
                this.promptForAccusation(player.id, player.name);
            };
            twilightPlayerList.appendChild(item);
        });
        twilightOverlay.style.display = 'flex';
    },

    promptForPlayerTarget(title, onSelected, customPlayerList = null) {
        const inputOptions = {};
        const playersToShow = customPlayerList || state.players;

        playersToShow.filter(p => p.id !== state.myId && !p.disconnected).forEach(p => {
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
	
	promptForArtifactChoice(data, onSelected) {
        const { currentArtifact, newArtifact } = data;
        Swal.fire({
            title: 'Tìm Thấy Cổ Vật Mới!',
            html: `
                <p>Bạn đã tìm thấy <strong>${newArtifact.name}</strong>, nhưng bạn chỉ có thể giữ một Cổ vật.</p>
                <p>Hãy đưa ra lựa chọn:</p>
                <div class="swal-artifact-choice-container">
                    <div class="swal-artifact-option">
                        <h4>GIỮ LẠI (Hiện tại)</h4>
                        <strong>${currentArtifact.name}</strong>
                        <p>${currentArtifact.details.effect}</p>
                    </div>
                    <div class="swal-artifact-option">
                        <h4>LẤY MỚI</h4>
                        <strong>${newArtifact.name}</strong>
                        <p>${newArtifact.details.effect}</p>
                    </div>
                </div>`,
            showCancelButton: true,
            confirmButtonText: `Lấy ${newArtifact.name}`,
            cancelButtonText: `Giữ ${currentArtifact.name}`,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#aaa',
            allowOutsideClick: false, 
            allowEscapeKey: false,
        }).then((result) => {
            if (result.isConfirmed) {
                onSelected({ choice: 'take_new', newArtifactId: newArtifact.id });
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                onSelected({ choice: 'keep_current' });
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
                    <button class="swal2-styled choice-buttons loyal" data-action="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled choice-buttons corrupt" data-action="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled choice-buttons blank" data-action="Quan Sát">👁️ Quan Sát</button>
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
                    <button class="swal2-styled choice-buttons loyal" data-guess="Giải Mã">📜 Giải Mã</button>
                    <button class="swal2-styled choice-buttons corrupt" data-guess="Phá Hoại">💣 Phá Hoại</button>
                    <button class="swal2-styled choice-buttons blank" data-guess="Quan Sát">👁️ Quan Sát</button>
                </div>`,
            showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelectorAll('.action-choices-popup button').forEach(button => {
                    button.addEventListener('click', () => {
                        const guess = button.getAttribute('data-guess');
                        Swal.close();
                        Network.emit('requestAccusation', { roomCode: state.currentRoomCode, targetId, guess: guess, actionType: 'Vạch Trần' });
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
            <div style="text-align: center; margin-bottom: 20px;">
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
                    <td>${actionText || 'N/A'}</td>
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

    showGameOver(data, isHost) {
        let title = "Trò chơi kết thúc!";
        let text = "Không ai hoàn thành được mục tiêu của mình.";
        if (data.winner) {
            title = `${data.winner.name} đã chiến thắng!`;
            text = `Lý do: ${data.winner.reason}`;
        } else if (data.loser) {
            title = `${data.loser.name} đã thất bại!`;
            text = `Lý do: ${data.loser.reason}`;
        }

        Swal.fire({
            title: title,
            text: text,
            icon: data.winner ? 'success' : 'info',
            background: '#2d3748',
            color: '#e2e8f0',
            confirmButtonText: 'Xem kết quả',
            showCancelButton: isHost, 
            cancelButtonText: 'Tạo Ván Mới',
            cancelButtonColor: '#48bb78',
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel && isHost) {
                Network.emit('requestRematch', state.currentRoomCode);
            }
        });
    },

    addChatMessage(sender, message) { /* ... không đổi ... */ },
    addLogMessage(log) {
        const container = this.gameElements.messageArea;
        if (!container) return;
        const p = document.createElement('p');
        p.className = `log-message log-${log.type}`; 
        p.innerHTML = log.message;
        
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 1;
        container.appendChild(p);
        if (isScrolledToBottom) {
          container.scrollTop = container.scrollHeight;
        }
    },
};
window.UI = UI;