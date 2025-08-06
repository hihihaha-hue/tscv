// public/js/ui.js
// ======================================================================
// UI MODULE ("The Director")
// PHIÊN BẢN HOÀN CHỈNH: Đã sửa lỗi cú pháp và tối ưu hóa logic mobile.
// ======================================================================
const UI = {
    // ======================================================================
    // I. DOM ELEMENTS & STATE
    // ======================================================================

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
        openTwilightBtn: document.getElementById('open-twilight-btn'),
        rolesInGameList: document.getElementById('roles-in-game-list'),
        artifactDisplay: document.getElementById('artifact-display'),
        artifactInfo: document.getElementById('artifact-info'),
        noArtifactMessage: document.getElementById('no-artifact-message'),
        artifactName: document.getElementById('artifact-name'),
        artifactDescription: document.getElementById('artifact-description'),
        useArtifactBtn: document.getElementById('use-artifact-btn'),
        nightTransitionOverlay: document.getElementById('night-transition-overlay'),
        nightTransitionText: document.getElementById('night-transition-text'),
        
        // === BẮT ĐẦU NÂNG CẤP MOBILE ===
        mobileLogView: document.getElementById('mobile-log-view'), // Vùng chứa mới
        showLogViewBtn: document.getElementById('show-log-view-btn'), // Nút tab mới
        mobileActionBar: document.getElementById('mobile-action-bar'),
        mobileViewSwitcher: document.getElementById('mobile-view-switcher'),
        mobileMainView: document.getElementById('mobile-main-view'),
        mobilePersonalView: document.getElementById('mobile-personal-view'),
        showMainViewBtn: document.getElementById('show-main-view-btn'),
        showPersonalViewBtn: document.getElementById('show-personal-view-btn'),
        // === KẾT THÚC NÂNG CẤP MOBILE ===
    },
    audioCache: {},
    isMuted: false,
    isAudioUnlocked: false,
    isMusicStarted: false,
    isMobileLayoutSetup: false,
    gameData: { allRoles: {}, allDecrees: {}, allArtifacts: {} },
    typedInstance: null,

    // ======================================================================
    // II. INITIALIZATION
    // ======================================================================

    init() {
        this.loadPlayerName();
        this.initEventListeners();
    },

    // ======================================================================
    // III. CORE EVENT LISTENERS
    // ======================================================================

    initEventListeners() {
        // === BẮT ĐẦU NÂNG CẤP MOBILE ===
        const { showMainViewBtn, showPersonalViewBtn, showLogViewBtn } = this.gameElements;
        if (showMainViewBtn) {
            showMainViewBtn.addEventListener('click', () => this.switchMobileView('main'));
        }
        if (showPersonalViewBtn) {
            showPersonalViewBtn.addEventListener('click', () => this.switchMobileView('personal'));
        }
        if (showLogViewBtn) {
            showLogViewBtn.addEventListener('click', () => this.switchMobileView('log'));
        }
        const musicToggleBtn = document.getElementById('music-toggle-btn');
		
        if (musicToggleBtn) musicToggleBtn.addEventListener('click', () => this.toggleMasterMute());

        const historyBtn = document.getElementById('history-log-btn');
        if (historyBtn) historyBtn.addEventListener('click', () => this.showGameHistory(state.gameHistory));

        const rulebookBtn = document.getElementById('rulebook-btn');
        if (rulebookBtn) rulebookBtn.addEventListener('click', () => {
            this.playSound('click');
            this.showRulebook();
        });

        this.homeElements.createRoomBtn.addEventListener('click', () => {
            this.handleLobbyAction(() => {
                Network.emit('createRoom', { name: this.homeElements.nameInput.value });
            });
        });

        this.homeElements.joinRoomBtn.addEventListener('click', () => {
            this.handleLobbyAction(() => {
                const code = this.homeElements.roomCodeInput.value.trim().toUpperCase();
                if (code) Network.emit('joinRoom', { roomCode: code, name: this.homeElements.nameInput.value });
            });
        });

        if (this.gameElements.openTwilightBtn) this.gameElements.openTwilightBtn.addEventListener('click', () => {
            this.playSound('click');
            this.gameElements.twilightOverlay.style.display = 'flex';
        });

        this.roomElements.addBotBtn.addEventListener('click', () => {
            this.playSound('click');
            if (state.currentRoomCode) Network.emit('addBot', state.currentRoomCode);
        });

        this.roomElements.startGameBtn.addEventListener('click', () => {
            this.playSound('click');
            Network.emit('startGame', state.currentRoomCode);
        });

        this.roomElements.readyBtn.addEventListener('click', () => {
            this.playSound('click');
            Network.emit('playerReady', state.currentRoomCode);
        });

        if (this.gameElements.choiceButtonsContainer) {
            this.gameElements.choiceButtonsContainer.querySelectorAll('.choice-buttons').forEach(button => {
                button.addEventListener('click', async () => {
                    const choice = button.getAttribute('data-action');
                    if (choice === 'Phá Hoại') {
                        const targetId = await this.promptForPlayerTarget('Chọn mục tiêu để Phá Hoại');
                        if (targetId) {
                            Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice, payload: { targetId } });
                            this.setupPhaseUI('wait', { title: 'Đã Chọn Hành Động' });
                        }
                    } else {
                        Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice });
                        this.setupPhaseUI('wait', { title: 'Đã Chọn Hành Động' });
                    }
                });
            });
        }

        if (this.gameElements.skipCoordinationBtn) this.gameElements.skipCoordinationBtn.addEventListener('click', () => {
            this.playSound('click');
            Network.emit('voteSkipCoordination', state.currentRoomCode);
            this.setupPhaseUI('wait', { title: 'Đang Chờ...' });
        });

        if (this.gameElements.twilightRestBtn) this.gameElements.twilightRestBtn.addEventListener('click', () => {
    this.playSound('click');
    this.gameElements.twilightOverlay.style.display = 'none';
    Network.emit('voteSkipTwilight', state.currentRoomCode);

    // === BẮT ĐẦU PHẦN THÊM MỚI ===
    state.hasActedInTwilight = true; // Đánh dấu là đã hành động
    this.setupPhaseUI('wait', { description: 'Bạn đã chọn nghỉ ngơi. Đang chờ...' }); // Cập nhật UI
    // === KẾT THÚC PHẦN THÊM MỚI ===
});

        if (this.gameElements.twilightCloseBtn) this.gameElements.twilightCloseBtn.addEventListener('click', () => {
            this.gameElements.twilightOverlay.style.display = 'none';
        });

        if (this.gameElements.nextDayBtn) this.gameElements.nextDayBtn.addEventListener('click', () => {
            if (state.myId === state.currentHostId) {
                this.playSound('click');
                Network.emit('nextRound', state.currentRoomCode);
            }
        });

        // === KHỐI LỆNH SỬA LỖI CHO CÁC NÚT TAB ===
        if (this.gameElements.showMainViewBtn) {
            this.gameElements.showMainViewBtn.addEventListener('click', () => {
                this.switchMobileView('main');
            });
        }
        
        if (this.gameElements.showPersonalViewBtn) {
            this.gameElements.showPersonalViewBtn.addEventListener('click', () => {
                this.switchMobileView('personal');
            });
        }
        
        if (this.gameElements.showLogViewBtn) {
            this.gameElements.showLogViewBtn.addEventListener('click', () => {
                this.switchMobileView('log');
            });
        }
        // === KẾT THÚC KHỐI LỆNH SỬA LỖI ===

        if (this.gameElements.playersContainer) this.gameElements.playersContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.player-avatar-card');
            const isSelectingTarget = this.gameElements.playersContainer.classList.contains('selecting-target');
            if (!card || card.classList.contains('is-self') || !isSelectingTarget) return;

            const targetId = card.getAttribute('data-player-id');
            if (state.gamePhase === 'coordination') {
                Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
                this.setupPhaseUI('wait', { title: 'Đã Phối Hợp!' });
            }
        });

        if (this.gameElements.useArtifactBtn) {
            this.gameElements.useArtifactBtn.addEventListener('click', async () => {
                const artifactId = this.gameElements.useArtifactBtn.dataset.artifactId;
                if (!artifactId) return;

                this.playSound('click');
                let payload = {};
                const emitArtifactUse = (p) => {
                    Network.emit('useArtifact', { roomCode: state.currentRoomCode, artifactId, payload: p });
                    this.gameElements.useArtifactBtn.disabled = true;
                    this.gameElements.useArtifactBtn.textContent = 'Đã Kích hoạt';
                };

                // Lỗi cú pháp nằm ở đây (hàm switchMobileView bị đặt sai chỗ). ĐÃ LOẠI BỎ.

                switch (artifactId) {
                    case 'CHAIN_OF_MISTRUST':
                        const targetId1 = await this.promptForPlayerTarget('Chọn người chơi ĐẦU TIÊN để liên kết');
                        if (targetId1) {
                            const remainingPlayers = state.players.filter(p => p.id !== state.myId && p.id !== targetId1 && !p.disconnected);
                            const targetId2 = await this.promptForPlayerTarget('Chọn người chơi THỨ HAI để liên kết', remainingPlayers);
                            if (targetId2) {
                                payload = { targetId1, targetId2 };
                                emitArtifactUse(payload);
                            }
                        }
                        break;
                    case 'ARROW_OF_AMNESIA':
                    case 'MARK_OF_BETRAYAL':
                        const targetId = await this.promptForPlayerTarget('Chọn mục tiêu cho Cổ vật');
                        if (targetId) {
                            payload.targetId = targetId;
                            emitArtifactUse(payload);
                        }
                        break;
                    default:
                        emitArtifactUse(payload);
                        break;
                }
            });
        }
    },
    handleLobbyAction(action) {
        this.playSound('click');
        this.startMusic();
        this.savePlayerName();
        action();
    },

    attachSkillButtonListener() {
        const skillBtn = document.getElementById('skill-btn');
        if (skillBtn) {
            skillBtn.replaceWith(skillBtn.cloneNode(true));
            document.getElementById('skill-btn').addEventListener('click', async () => {
                this.playSound('click');
                const roleId = state.myRole.id;
                let payload = {};

                const emitSkill = (p) => {
                    Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: p });
                    this.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng!' });
                };

                switch (roleId) {
                    case 'PROPHET': case 'PEACEMAKER': case 'MAGNATE': case 'PRIEST': case 'THIEF': case 'PHANTOM':
                        const targetId = await this.promptForPlayerTarget('Chọn mục tiêu cho kỹ năng');
                        if (targetId) {
                            payload.targetId = targetId;
                            emitSkill(payload);
                        }
                        break;
                    case 'MIND_BREAKER':
                        const targetIdMB = await this.promptForPlayerTarget('Chọn người để điều khiển');
                        if (targetIdMB) {
                            const chosenAction = await this.promptForActionChoice('Bạn muốn mục tiêu thực hiện hành động gì?');
                            if (chosenAction) {
                                payload = { targetId: targetIdMB, chosenAction };
                                emitSkill(payload);
                            }
                        }
                        break;
                    case 'REBEL':
                        const declaredAction = await this.promptForActionChoice('Tuyên bố hành động của bạn');
                        if (declaredAction) {
                            const punishTargetId = await this.promptForPlayerTarget('Chọn người để trừng phạt (nếu thành công)');
                            if (punishTargetId) {
                                payload = { declaredAction, punishTargetId };
                                emitSkill(payload);
                            }
                        }
                        break;
                    case 'MIMIC':
                        const targetIdMimic = await this.promptForPlayerTarget('Chọn mục tiêu cho kỹ năng bạn BẮT CHƯỚC (nếu cần)');
                        payload.targetId = targetIdMimic;
                        emitSkill(payload);
                        break;
                    case 'GAMBLER':
                        const chosenFaction = await this.promptForActionChoice('Đặt cược vào phe sẽ thắng');
                        if (chosenFaction) {
                            payload.chosenFaction = chosenFaction;
                            emitSkill(payload);
                        }
                        break;
                    default:
                        emitSkill(payload);
                        break;
                }
            });
        }
    },

    async promptForPlayerTarget(title, customPlayerList = null) {
        const inputOptions = {};
        (customPlayerList || state.players)
            .filter(p => p.id !== state.myId && !p.disconnected && !p.isDefeated)
            .forEach(p => { inputOptions[p.id] = p.name; });
        if (Object.keys(inputOptions).length === 0) {
            Swal.fire('Không có mục tiêu', 'Không có người chơi nào hợp lệ để chọn.', 'warning');
            return null;
        }
        const { value: targetId } = await Swal.fire({
            title, input: 'select', inputOptions,
            inputPlaceholder: 'Chọn một người chơi', showCancelButton: true,
            confirmButtonText: 'Xác nhận', cancelButtonText: 'Hủy',
            background: '#2d3748', color: '#e2e8f0',
        });
        return targetId;
    },

    async promptForActionChoice(title) {
        return new Promise(resolve => {
            Swal.fire({
                title,
                html: `<div class="action-choices-popup" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                         <button class="swal2-styled loyal" data-action="Giải Mã">📜 Giải Mã</button>
                         <button class="swal2-styled corrupt" data-action="Phá Hoại">💣 Phá Hoại</button>
                         <button class="swal2-styled blank" data-action="Quan Sát">👁️ Quan Sát</button>
                       </div>`,
                showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Hủy',
                background: '#2d3748', color: '#e2e8f0',
                didOpen: () => Swal.getPopup().querySelectorAll('.action-choices-popup button').forEach(button => {
                    button.addEventListener('click', () => {
                        Swal.close();
                        resolve(button.getAttribute('data-action'));
                    });
                }),
            }).then(result => { if (result.dismiss === Swal.DismissReason.cancel) resolve(null); });
        });
    },

    async promptForAccusation(targetId, targetName) {
    const guess = await this.promptForActionChoice(`Vạch Trần ${targetName} - Bạn nghĩ họ đã làm gì?`);
    if (guess) {
        this.gameElements.twilightOverlay.style.display = 'none';
        Network.emit('requestAccusation', { roomCode: state.currentRoomCode, targetId, guess, actionType: 'Vạch Trần' });
        
        // === BẮT ĐẦU PHẦN THÊM MỚI ===
        state.hasActedInTwilight = true; // Đánh dấu là đã hành động
        this.setupPhaseUI('wait', { description: 'Đã hành động. Đang chờ những người khác...' }); // Cập nhật UI ngay lập tức
        // === KẾT THÚC PHẦN THÊM MỚI ===
    }
    },

    promptForArtifactChoice(data, onSelected) {
        const { currentArtifact, newArtifact } = data;
        Swal.fire({
            title: 'Tìm Thấy Cổ Vật Mới!',
            html: `<p>Bạn đã tìm thấy <strong>${newArtifact.name}</strong>, nhưng bạn chỉ có thể giữ một Cổ vật.</p>
                   <div class="swal-artifact-choice-container">
                       <div class="swal-artifact-option"><h4>GIỮ LẠI</h4><strong>${currentArtifact.name}</strong><p>${currentArtifact.details.effect}</p></div>
                       <div class="swal-artifact-option"><h4>LẤY MỚI</h4><strong>${newArtifact.name}</strong><p>${newArtifact.details.effect}</p></div>
                   </div>`,
            showCancelButton: true, confirmButtonText: `Lấy ${newArtifact.name}`,
            cancelButtonText: `Giữ ${currentArtifact.name}`, confirmButtonColor: '#3085d6',
            cancelButtonColor: '#aaa', allowOutsideClick: false, allowEscapeKey: false,
        }).then(result => {
            if (result.isConfirmed) onSelected({ choice: 'take_new', newArtifactId: newArtifact.id });
            else if (result.dismiss === Swal.DismissReason.cancel) onSelected({ choice: 'keep_current' });
        });
    },

    showRulebook() {
        if (!this.gameData?.allRoles || Object.keys(this.gameData.allRoles).length === 0) {
            return Swal.fire('Đang Tải...', 'Dữ liệu game chưa sẵn sàng. Vui lòng thử lại sau giây lát.', 'info');
        }

        const template = document.getElementById('rulebook-template');
        const rulebookContent = template.content.cloneNode(true);

        const createArtifactHTML = (artifact) => `
            <div class="artifact-detail-item"><h4>${artifact.name}</h4><p class="artifact-flavor"><em>${artifact.details.flavor}</em></p>
                <ul class="artifact-specs">
                    <li><strong>Loại:</strong> ${artifact.details.category}</li>
                    <li><strong>Kích hoạt:</strong> ${artifact.details.activation_type}</li>
                    <li><strong>Hiệu ứng:</strong> ${artifact.details.effect}</li>
                </ul></div><hr>`;

        const createRoleHTML = (role) => `
            <div class="role-item"><h4>${role.name}</h4>
                <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p></div><hr>`;

        const createDecreeHTML = (decree) => `
            <div class="decree-item"><h4>${decree.name}</h4><p>${decree.description}</p></div><hr>`;

        const artifactsThContainer = rulebookContent.querySelector('[data-content-id="artifacts-tham-hiem"]');
        artifactsThContainer.innerHTML = Object.values(this.gameData.allArtifacts).filter(a => a.type === 'Thám Hiểm').map(createArtifactHTML).join('');

        const artifactsHlContainer = rulebookContent.querySelector('[data-content-id="artifacts-hon-loan"]');
        artifactsHlContainer.innerHTML = Object.values(this.gameData.allArtifacts).filter(a => a.type === 'Hỗn Loạn').map(createArtifactHTML).join('');

        const rolesContainer = rulebookContent.querySelector('[data-content-id="roles"]');
        rolesContainer.innerHTML = Object.values(this.gameData.allRoles).map(createRoleHTML).join('');

        const decreesContainer = rulebookContent.querySelector('[data-content-id="decrees"]');
        decreesContainer.innerHTML = Object.values(this.gameData.allDecrees).map(createDecreeHTML).join('');

        Swal.fire({
            html: '<div id="swal-rulebook-placeholder"></div>',
            width: '90%',
            maxWidth: '800px',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: { popup: 'rulebook-popup', htmlContainer: 'rulebook-swal-container' },
            didOpen: () => {
                const popup = Swal.getPopup();
                if (!popup) return;

                const placeholder = popup.querySelector('#swal-rulebook-placeholder');
                placeholder.appendChild(rulebookContent);

                const tabs = popup.querySelectorAll('.rulebook-tab');
                const pages = popup.querySelectorAll('.rulebook-page');
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const targetId = tab.dataset.target;
                        tabs.forEach(t => t.classList.remove('active'));
                        pages.forEach(p => p.classList.remove('active'));
                        tab.classList.add('active');
                        popup.querySelector(`#${targetId}`).classList.add('active');
                    });
                });
            }
        });
    },

    showGameHistory(history) {
        if (!history || history.length === 0) {
            return Swal.fire({ title: 'Lịch Sử Ván Đấu', text: 'Chưa có ngày nào kết thúc.', background: '#2d3748', color: '#e2e8f0' });
        }
        let historyHTML = '<div style="text-align: left;">' + history.map(roundData => {
            const winnerText = roundData.results.isDraw ? 'Hòa' : `Phe ${roundData.results.winner} thắng`;
            return `<details><summary><strong>Ngày ${roundData.round}:</strong> ${winnerText}</summary>
                        <p>Phiếu: 📜${roundData.votes['Giải Mã']} 💣${roundData.votes['Phá Hoại']} 👁️${roundData.votes['Quan Sát']}</p>
                        <ul>${(roundData.results.roundSummary || []).map(p => `<li>${p.name}: ${p.oldScore} → ${p.newScore}</li>`).join('')}</ul>
                    </details><hr>`;
        }).join('') + '</div>';
        Swal.fire({ title: 'Lịch Sử Ván Đấu', html: historyHTML, background: '#2d3748', color: '#e2e8f0' });
    },

    // ======================================================================
    // V. DISPLAY & UPDATE FUNCTIONS
    // ======================================================================

   switchMobileView(viewName) {
        const screen = this.gameElements.screen;
        if (!screen || !this.isMobileLayoutSetup) return;

        // 1. Cập nhật trạng thái active cho các nút tab
        const buttons = {
            main: this.gameElements.showMainViewBtn,
            personal: this.gameElements.showPersonalViewBtn,
            log: this.gameElements.showLogViewBtn,
        };
        Object.values(buttons).forEach(btn => btn?.classList.remove('active'));
        if (buttons[viewName]) {
            buttons[viewName].classList.add('active');
        }

        // 2. Chuyển đổi class để CSS hiển thị đúng view
        screen.classList.remove('view-main', 'view-personal', 'view-log');
        screen.classList.add(`view-${viewName}`);
        
        // 3. Cập nhật thanh hành động (Mobile Action Bar) một cách linh động
        this.updateMobileActionBar(viewName);
    },

    updateMobileActionBar(currentView) {
        const actionBar = this.gameElements.mobileActionBar;
        if (!actionBar) return;
        actionBar.innerHTML = ''; // Xóa sạch các nút cũ

        switch (currentView) {
            case 'main':
                // Khi ở tab "Trận Đấu", thanh hành động sẽ chứa các nút của giai đoạn hiện tại
                // Chúng ta sẽ gọi lại setupPhaseUI để nó tự điền vào
                this.setupPhaseUI(state.gamePhase, { 
                    isHost: state.myId === state.currentHostId, 
                    title: this.getPhaseTitle(state.gamePhase) 
                });
                break;
            case 'personal':
                // Khi ở tab "Cá Nhân", ưu tiên hiển thị nút kỹ năng và cổ vật
                const skillBtn = document.getElementById('skill-btn');
                if (skillBtn && !skillBtn.disabled) {
                    const mobileSkillBtn = skillBtn.cloneNode(true);
                    mobileSkillBtn.id = 'mobile-skill-btn';
                    mobileSkillBtn.onclick = () => skillBtn.click();
                    actionBar.appendChild(mobileSkillBtn);
                }

                const artifactBtn = this.gameElements.useArtifactBtn;
                if (artifactBtn && artifactBtn.style.display !== 'none' && !artifactBtn.disabled) {
                    const mobileArtifactBtn = artifactBtn.cloneNode(true);
                    mobileArtifactBtn.id = 'mobile-artifact-btn';
                    mobileArtifactBtn.onclick = () => artifactBtn.click();
                    actionBar.appendChild(mobileArtifactBtn);
                }
                break;
            case 'log':
                // Tab "Nhật Ký" thường không có hành động, thanh action bar sẽ trống
                break;
        }
    },

    _setupMobileLayout() {
        if (window.innerWidth > 768 || this.isMobileLayoutSetup) {
            return;
        }

        console.log("Setting up NEW mobile layout...");

        const { mobileMainView, mobilePersonalView, mobileLogView } = this.gameElements;

        // Phân chia lại các panel vào đúng các tab
        mobileMainView.append(
            document.getElementById('phase-info'),
            document.getElementById('players-container'),
            document.getElementById('leaderboard'),
            document.getElementById('roles-in-game')
        );

        mobilePersonalView.append(
            document.getElementById('role-display'),
            document.getElementById('artifact-display')
        );

        mobileLogView.append(
            document.getElementById('message-area'),
            document.getElementById('chat-container')
        );

        this.isMobileLayoutSetup = true;
    },

    showScreen(screenName) {
        ['home-screen', 'room-screen', 'game-screen'].forEach(id => document.getElementById(id).style.display = 'none');
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.style.display = (screenName === 'game') ? 'grid' : 'block';

            if (screenName === 'game') {
                this._setupMobileLayout();
                // Mặc định chuyển về tab "Trận Đấu" khi mở màn hình game
                this.switchMobileView('main');
            }
        }
    },

    updatePlayerList(players, hostId, myId) {
        const list = this.roomElements.playerList;
        if (!list) return;
        const allReady = players.filter(p => !p.isBot && p.id !== hostId).every(p => p.isReady);
        list.innerHTML = players.map(player => {
            let nameHTML = '';
            if (player.id === hostId) nameHTML += '👑 ';
            if (!player.isBot && player.id !== hostId) nameHTML += player.isReady ? '✅ ' : '❌ ';
            nameHTML += player.name;
            if (player.isBot) nameHTML += ' [AI]';
            if (player.id === myId) nameHTML += ' (Bạn)';
            const kickButton = (myId === hostId && player.id !== myId)
                ? `<button class="kick-btn" onclick="Network.emit('kickPlayer', { roomCode: '${state.currentRoomCode}', playerId: '${player.id}' })">Đuổi</button>`
                : '';
            return `<li><span>${nameHTML.trim()}</span>${kickButton}</li>`;
        }).join('');
        this.roomElements.hostControls.style.display = myId === hostId ? 'block' : 'none';
        this.roomElements.playerControls.style.display = myId !== hostId && players.some(p => p.id === myId) ? 'block' : 'none';
        if (myId === hostId) this.roomElements.startGameBtn.disabled = players.length < 2 || !allReady;
        else {
            const myPlayer = players.find(p => p.id === myId);
            if (myPlayer) this.roomElements.readyBtn.textContent = myPlayer.isReady ? 'Bỏ Sẵn Sàng' : 'Sẵn Sàng';
        }
    },

    displayRole(role) {
        const container = this.gameElements.roleDisplay;
        if (!container) return;
        container.classList.remove('is-flipped');
        let skillButtonHTML = '';

        const canUseSkill = !(role.id === 'MIMIC' && !role.canMimicSkill);

        if (role.hasActiveSkill) {
            const cost = role.currentSkillCost ?? 0;
            const costText = cost > 0 ? ` (-${cost}💎)` : ' (Miễn Phí)';
            const disabledAttr = canUseSkill ? '' : 'disabled';
            const buttonTitle = canUseSkill ? '' : 'title="Người bạn sao chép không có kỹ năng kích hoạt."';

            skillButtonHTML = `<button class="skill-button" id="skill-btn" ${disabledAttr} ${buttonTitle}>${role.skillName}${costText}</button>`;
        }

        container.innerHTML = `
            <div class="role-card-inner">
                <div class="role-card-front">
                    <h4>VAI TRÒ CỦA BẠN</h4><p style="color: var(--text-medium);">Đang chờ...</p>
                    <img src="/assets/images/card_back.png" alt="Mặt sau lá bài" style="width: 100px; opacity: 0.5;">
                </div>
                <div class="role-card-back">
                    <h4>Vai Trò: <strong>${role.name}</strong></h4>
                    <div style="text-align: left; line-height: 1.5; width: 100%; overflow-y: auto;">
                        <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                        <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                        <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
                    </div>
                    ${skillButtonHTML}
                </div>
            </div>`;
        container.style.display = 'block';
        setTimeout(() => {
            container.classList.add('is-flipped');
            this.playSound('card-flip');
        }, 500);
        this.attachSkillButtonListener();
    },

    updatePlayerCards(players, myId) {
        const container = this.gameElements.playersContainer;
        if (!container) return;
        container.innerHTML = players.map(player => {
            const displayName = player.name.length > 10 ? player.name.substring(0, 9) + '…' : player.name;
            return `<div class="player-avatar-card ${player.id === myId ? 'is-self' : ''} ${player.chosenAction ? 'has-chosen' : ''}" data-player-id="${player.id}">
                        <div class="avatar">${player.name[0].toUpperCase()}</div>
                        <div class="player-name" title="${player.name}">${displayName}</div>
                    </div>`;
        }).join('');
    },

  updateLeaderboard(players) {
        const list = this.gameElements.leaderboardList;
        if (!list) return;
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        list.innerHTML = sortedPlayers.map(p => `<li><span>${p.name}</span><span>${p.score}</span></li>`).join('');
    },

  displayRolesInGame(rolesInThisGame) {
        const container = this.gameElements.rolesInGameList;
        if (!container) return;
        container.innerHTML = rolesInThisGame.map(role => `
            <li class="role-in-game-item">
                <details>
                    <summary class="role-name">${role.name}</summary>
                    <div class="role-full-details">
                        <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                        <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                        <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
                    </div>
                </details>
            </li>`).join('');
    },

    updateArtifactDisplay(artifacts) {
        const displayPanel = this.gameElements.artifactDisplay;
        if (!displayPanel) return;
        displayPanel.style.display = (state.gamePhase !== 'lobby' && state.gamePhase !== 'gameover') ? 'block' : 'none';
        const artifact = artifacts && artifacts.length > 0 ? artifacts[0] : null;
        if (artifact) {
            this.gameElements.artifactInfo.style.display = 'block';
            this.gameElements.noArtifactMessage.style.display = 'none';
            this.gameElements.artifactName.textContent = artifact.name;
            this.gameElements.artifactDescription.textContent = artifact.details.effect;
            this.gameElements.useArtifactBtn.style.display = artifact.is_activatable ? 'block' : 'none';
            this.gameElements.useArtifactBtn.disabled = false;
            this.gameElements.useArtifactBtn.textContent = 'Kích hoạt';
            this.gameElements.useArtifactBtn.dataset.artifactId = artifact.id;
        } else {
            this.gameElements.artifactInfo.style.display = 'none';
            this.gameElements.noArtifactMessage.style.display = 'block';
        }
    },

    setupPhaseUI(phaseName, options = {}) {
        // === BẮT ĐẦU SỬA LỖI NÚT BẤM DESKTOP ===
        const isMobile = window.innerWidth <= 768;
        const { 
            phaseTitle, phaseDescription, choiceButtonsContainer, 
            skipCoordinationBtn, nextDayBtn, playersContainer, openTwilightBtn, 
            mobileActionBar 
        } = this.gameElements;

        playersContainer.classList.remove('selecting-target');

        // Logic được tách biệt hoàn toàn
        if (isMobile) {
            // 1. Dành cho Mobile: Xóa sạch thanh hành động để chuẩn bị tạo nút mới.
            if (mobileActionBar) mobileActionBar.innerHTML = '';
        } else {
            // 2. Dành cho Desktop: Ẩn tất cả các nút/container hành động.
            // Chúng ta không xóa chúng, chỉ ẩn đi để có thể hiện lại sau.
            if (choiceButtonsContainer) choiceButtonsContainer.style.display = 'none';
            if (skipCoordinationBtn) skipCoordinationBtn.style.display = 'none';
            if (nextDayBtn) nextDayBtn.style.display = 'none';
            if (openTwilightBtn) openTwilightBtn.style.display = 'none';
        }
        
        // Cập nhật tiêu đề giai đoạn (giữ nguyên)
        if (this.typedInstance) this.typedInstance.destroy();
        const titleText = options.title || this.getPhaseTitle(phaseName);
        this.typedInstance = new Typed(phaseTitle, { strings: [titleText], typeSpeed: 40, showCursor: false });

        const setPhaseDescription = (text) => {
            if (phaseDescription) phaseDescription.innerHTML = text;
        };

        // Hàm tạo nút cho mobile (giữ nguyên)
        const createMobileButton = (id, text, className = '') => {
            const btn = document.createElement('button');
            btn.id = `mobile-${id}`;
            btn.innerHTML = text;
            if (className) btn.className = className;
            const originalButton = document.getElementById(id);
            if (originalButton) {
                btn.onclick = () => originalButton.click();
            } else {
                console.warn(`Original button for mobile action '${id}' not found.`);
            }
            return btn;
        };
        
        const setupMobileChoiceButtons = () => {
             const container = document.createElement('div');
             container.className = 'action-buttons-grid';
             container.appendChild(createMobileButton('choice-loyal', '📜 Giải Mã', 'choice-buttons loyal'));
             container.appendChild(createMobileButton('choice-corrupt', '💣 Phá Hoại', 'choice-buttons corrupt'));
             container.appendChild(createMobileButton('choice-blank', '👁️ Quan Sát', 'choice-buttons blank'));
             
             // Gán sự kiện click cho các nút mới tạo
             container.querySelector('#mobile-choice-loyal').onclick = () => this.gameElements.choiceButtonsContainer.querySelector('[data-action="Giải Mã"]').click();
             container.querySelector('#mobile-choice-corrupt').onclick = () => this.gameElements.choiceButtonsContainer.querySelector('[data-action="Phá Hoại"]').click();
             container.querySelector('#mobile-choice-blank').onclick = () => this.gameElements.choiceButtonsContainer.querySelector('[data-action="Quan Sát"]').click();

             return container;
        };

        // Chỉ điền nút vào action bar nếu đang ở đúng tab 'main' hoặc là desktop
      const shouldFillActionBar = !isMobile || (isMobile && document.getElementById('show-main-view-btn').classList.contains('active'));
	  if (state.myRole?.id === 'MIMIC' && (phaseName === 'choice' || phaseName === 'exploration')) {
            setPhaseDescription('Bạn sẽ tự động sao chép hành động của người khác. Hãy chờ xem...');
            // Không hiển thị bất kỳ nút hành động nào cho Kẻ Bắt Chước
            return; // Dừng hàm tại đây
        }

           switch (phaseName) {
            case 'choice':
            case 'exploration':
                setPhaseDescription('Bí mật chọn hành động của bạn.');
                if (isMobile) {
                    if (shouldFillActionBar) currentActionContainer.appendChild(setupMobileChoiceButtons());
                } else {
                    if (choiceButtonsContainer) choiceButtonsContainer.style.display = 'grid';
                }
                break;

            case 'coordination':
                playersContainer.classList.add('selecting-target');
                setPhaseDescription('Chọn người để Phối Hợp, hoặc hành động một mình.');
                if (isMobile) {
                    if (shouldFillActionBar) currentActionContainer.appendChild(createMobileButton('skip-coordination-btn', 'Hành động một mình'));
                } else {
                    if (skipCoordinationBtn) skipCoordinationBtn.style.display = 'inline-block';
                }
                break;

            case 'twilight':
                if (state.hasActedInTwilight) {
                    this.setupPhaseUI('wait', { description: 'Đã hành động. Đang chờ những người khác...' });
                    return;
                }
                this.showTwilightUI(state.players, state.myId);
                setPhaseDescription('Mở bảng Vạch Trần để hành động hoặc chọn Nghỉ Ngơi.');
                if (isMobile) {
                     if (shouldFillActionBar) currentActionContainer.appendChild(createMobileButton('open-twilight-btn', 'Mở Bảng Vạch Trần'));
                } else {
                    if (openTwilightBtn) openTwilightBtn.style.display = 'inline-block';
                }
                break;

            case 'wait':
                const waitText = options.description || 'Đang chờ những người khác...';
                setPhaseDescription(waitText);
                break;

            case 'end_of_round':
                const endText = options.isHost ? 'Bắt đầu ngày tiếp theo?' : 'Đang chờ Trưởng Đoàn...';
                setPhaseDescription(endText);
                if (options.isHost) {
                    if (isMobile) {
                        if (shouldFillActionBar) currentActionContainer.appendChild(createMobileButton('next-day-btn', 'Bắt Đầu Ngày Tiếp Theo'));
                    } else {
                        if (nextDayBtn) nextDayBtn.style.display = 'inline-block';
                    }
                }
                break;
        }
    },

    showTwilightUI(players, myId) {
        const { twilightOverlay, twilightPlayerList } = this.gameElements;
        if (!twilightOverlay || !twilightPlayerList) return;
        twilightPlayerList.innerHTML = players
            .filter(p => p.id !== myId && !p.isDefeated && !p.disconnected)
            .map(player => `
                <li class="twilight-player-item" data-player-id="${player.id}">
                    <div class="player-avatar-small">${player.name[0].toUpperCase()}</div>
                    <span class="player-name">${player.name}</span>
                    <div class="action-buttons"><button class="accuse-btn">Vạch Trần</button></div>
                </li>`)
            .join('');
        twilightPlayerList.querySelectorAll('.accuse-btn').forEach(btn => {
            const item = btn.closest('.twilight-player-item');
            const playerId = item.dataset.playerId;
            const player = players.find(p => p.id === playerId);
            btn.onclick = () => this.promptForAccusation(playerId, player.name);
        });
        twilightOverlay.style.display = 'flex';
    },

    showRoundSummary(results, finalVoteCounts) {
        const { winner, isDraw, roundSummary } = results;
        let title = isDraw ? '⚖️ Ngày Nay Hoà!' : `🏆 Phe ${winner} Thắng!`;
        let summaryHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <strong>Tổng kết phiếu:</strong> 📜 ${finalVoteCounts['Giải Mã']} | 💣 ${finalVoteCounts['Phá Hoại']} | 👁️ ${finalVoteCounts['Quan Sát']}
            </div>
            <table class="swal2-table" style="width: 100%;">
                <thead><tr><th>Người Chơi</th><th>Hành Động</th><th>Chi Tiết Điểm</th><th>Kết Quả</th></tr></thead>
                <tbody>${roundSummary.map(player => {
            let totalChange = player.newScore - player.oldScore;
            let changeClass = totalChange > 0 ? 'success-text' : (totalChange < 0 ? 'error-text' : '');
            let changeText = totalChange > 0 ? `+${totalChange}` : (totalChange === 0 ? '0' : totalChange);
            
            // === BẮT ĐẦU LOGIC DỊCH LÝ DO ===
          let details = player.changes.map(c => {
            let reasonText = c.reason;
            const originalReason = c.reason.toLowerCase(); // Chuyển sang chữ thường để dễ so sánh

            // Các từ khóa nhận diện Nội tại hoặc Kỹ năng
            const skillKeywords = ['kỹ năng', 'đầu tư', 'móc túi', 'tất tay', 'khiêu khích', 'ám quẻ', 'phán quyết', 'tái phân bố'];
            const passiveKeywords = ['nội tại', 'hòa bình', 'đánh cược', 'tài phiệt', 'kẻ trộm', 'tẩy não', 'hai mang', 'bóng ma'];

            if (skillKeywords.some(keyword => originalReason.includes(keyword))) {
                reasonText = 'Kỹ năng bí ẩn';
            } else if (passiveKeywords.some(keyword => originalReason.includes(keyword))) {
                reasonText = 'Nội tại bí ẩn';
            }
            // Các lý do cơ bản như "Thuộc phe thắng", "Hòa cuộc", "May mắn khi Giải Mã" sẽ được giữ nguyên.
            
            return `${reasonText}: ${c.amount > 0 ? '+' : ''}${c.amount}`;
        }).join('<br>') || 'Không đổi';
          
            let actionText = player.chosenAction;
            if (player.actionWasNullified) {
                actionText = `<s style="color: #a0aec0;" title="Hành động bị vô hiệu hóa">${player.chosenAction}</s>`;
            }
            return `<tr><td>${player.name}</td><td>${actionText || 'N/A'}</td><td>${details}</td><td>${player.oldScore} <span class="${changeClass}">${changeText}</span> → <strong>${player.newScore}</strong></td></tr>`;
        }).join('')}</tbody>
            </table>`;
        Swal.fire({
            title, html: summaryHTML, width: '90%',
            customClass: { container: 'rulebook-modal' },
            background: '#2d3748', color: '#e2e8f0', confirmButtonText: 'OK'
        });
        roundSummary.forEach(player => this.showScoreChange(player.id, player.newScore - player.oldScore));
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
            title, text,
            icon: data.winner ? 'success' : 'info',
            background: '#2d3748', color: '#e2e8f0',
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

    showNightTransition(roundNumber) {
        const overlay = this.gameElements.nightTransitionOverlay;
        const text = this.gameElements.nightTransitionText;
        if (!overlay || !text) return;

        text.textContent = `Ngày ${roundNumber}`;
        overlay.classList.add('active');

        setTimeout(() => {
            overlay.classList.remove('active');
        }, 2200);
    },

    addCopyToClipboard() {
        const display = this.roomElements.roomCodeDisplay;
        if (!display) return;

        display.style.cursor = 'pointer';
        display.setAttribute('title', 'Nhấn để sao chép mã phòng');

        if (!display.hasAttribute('data-clipboard-attached')) {
            display.setAttribute('data-clipboard-attached', 'true');
            display.addEventListener('click', () => {
                const roomCode = display.textContent;
                if (!roomCode || roomCode === 'Đã sao chép!') return;

                navigator.clipboard.writeText(roomCode).then(() => {
                    const originalText = display.textContent;
                    display.textContent = 'Đã sao chép!';
                    this.playSound('success');
                    setTimeout(() => {
                        display.textContent = originalText;
                    }, 1500);
                }).catch(err => {
                    console.error('Không thể sao chép mã phòng: ', err);
                    Swal.fire('Lỗi', 'Không thể tự động sao chép. Vui lòng sao chép thủ công.', 'error');
                });
            });
        }
    },

    getPhaseTitle(phaseName) {
        const titles = {
            'choice': 'Giai Đoạn Thám Hiểm', 'exploration': 'Giai Đoạn Thám Hiểm',
            'coordination': 'Giai Đoạn Phối Hợp', 'twilight': 'Hoàng Hôn Buông Xuống',
            'reveal': 'Giai Đoạn Phán Xét', 'end_of_round': 'Đêm Đã Kết Thúc', 'wait': 'Xin Chờ...',
        };
        return titles[phaseName] || 'Ngôi Đền Cổ Vật';
    },

    startMusic() {
        if (!this.isAudioUnlocked || this.isMusicStarted) return;
        const music = document.getElementById('background-music');
        if (music && music.paused) {
            music.play().catch(e => {
                console.error("Lỗi tự động phát nhạc, cần tương tác của người dùng.", e);
            });
            this.isMusicStarted = true;
        }
    },

    playSound(soundName) {
        if (!this.isAudioUnlocked) this.isAudioUnlocked = true;
        if (this.isMuted) return;
        try {
            const audio = this.audioCache[soundName] || new Audio(`/assets/sounds/${soundName}.mp3`);
            this.audioCache[soundName] = audio;
            audio.currentTime = 0;
            audio.play().catch(e => { });
        } catch (e) { console.error(`Error with sound '${soundName}':`, e); }
    },

    toggleMasterMute() {
        this.isMuted = !this.isMuted;
        document.getElementById('music-toggle-btn').textContent = this.isMuted ? '🔇' : '🎵';
        const music = document.getElementById('background-music');
        if (music) music.muted = this.isMuted;
        Object.values(this.audioCache).forEach(audio => audio.muted = this.isMuted);
    },

    startTimer(duration) {
        const timerDisplay = this.gameElements.timerDisplay;
        if (!timerDisplay) return;
        let timeLeft = duration;
        if (window.countdownInterval) clearInterval(window.countdownInterval);
        timerDisplay.textContent = timeLeft;
        window.countdownInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft >= 0 ? timeLeft : "Hết giờ!";
            if (timeLeft < 0) clearInterval(window.countdownInterval);
        }, 1000);
    },

    clearTimer() {
        if (window.countdownInterval) clearInterval(window.countdownInterval);
        if (this.gameElements.timerDisplay) this.gameElements.timerDisplay.textContent = '';
    },

    addLogMessage(log) {
        const container = this.gameElements.messageArea;
        if (!container) return;
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 1;

        const p = document.createElement('p');
        p.className = `log-message log-${log.type}`;
        p.innerHTML = log.message;
        container.appendChild(p);

        if (isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }
    },

    addChatMessage(sender, message) {
        const container = this.gameElements.chatMessages;
        if (!container) return;
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 1;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        const senderEl = document.createElement('strong');
        senderEl.textContent = `${sender}: `;
        const textEl = document.createElement('span');
        textEl.textContent = message;
        msgEl.append(senderEl, textEl);
        container.appendChild(msgEl);

        if (isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }
    },

    showScoreChange(playerId, change) {
        if (change === 0) return;
        const playerCard = document.querySelector(`.player-avatar-card[data-player-id="${playerId}"]`);
        if (!playerCard) return;
        const changeText = document.createElement('div');
        changeText.className = 'score-change-popup';
        changeText.textContent = (change > 0 ? '+' : '') + change;
        changeText.style.color = change > 0 ? 'var(--success-green)' : 'var(--accent-red)';
        playerCard.appendChild(changeText);
        setTimeout(() => changeText.remove(), 1900);
    },

    savePlayerName() {
        const name = this.homeElements.nameInput.value;
        if (name) localStorage.setItem('tho-san-co-vat-playerName', name);
    },

    loadPlayerName() {
        const savedName = localStorage.getItem('tho-san-co-vat-playerName');
        if (savedName) this.homeElements.nameInput.value = savedName;
    },
};

window.UI = UI;