// public/js/ui.js
// ======================================================================
// MODULE GIAO DIỆN (USER INTERFACE - "The Painter")
// Nhiệm vụ: Chịu trách nhiệm cho mọi thao tác với DOM.
// Nó đọc dữ liệu từ biến 'state' toàn cục và "vẽ" lên màn hình.
// ======================================================================

const UI = {
    // --- I. DOM ELEMENTS ---
    screens: {
        home: document.getElementById('home-screen'),
        room: document.getElementById('room-screen'),
        game: document.getElementById('game-screen')
    },
    homeElements: {
        createRoomBtn: document.getElementById('create-room-btn'),
        joinRoomBtn: document.getElementById('join-room-btn'),
        roomCodeInput: document.getElementById('room-code-input'),
        nameInput: document.getElementById('player-name-input')
    },
    roomElements: {
        roomCodeDisplay: document.getElementById('room-code-display'),
        playerList: document.getElementById('player-list'),
        hostControls: document.getElementById('host-controls'),
        addBotBtn: document.getElementById('add-bot-btn'),
        startGameBtn: document.getElementById('start-game-btn')
    },
    gameElements: {
        roundIndicator: document.getElementById('current-round'),
        decreeDisplay: document.getElementById('decree-display'),
        playersContainer: document.getElementById('players-container'),
        phaseTitle: document.getElementById('phase-title'),
        actionControls: document.getElementById('action-controls'),
        messageArea: document.getElementById('message-area'),
        roleDisplay: document.getElementById('role-display')
    },

    // --- II. CORE UI METHODS ---
    showScreen(screenName) {
        for (const key in this.screens) {
            this.screens[key].style.display = (key === screenName) ? 'block' : 'none';
        }
    },

    logMessage(type, message) {
        const p = document.createElement('p');
        p.className = type;
        p.innerHTML = message;
        this.gameElements.messageArea.prepend(p);
    },

    playSound(soundName) {
        // try { new Audio(`/assets/sounds/${soundName}.mp3`).play(); }
        // catch (e) { console.warn(`Không thể phát âm thanh: ${soundName}`); }
    },

    // --- III. RENDER FUNCTIONS ---
    renderPlayerList() {
        this.roomElements.playerList.innerHTML = '';
        const isHost = state.myId === state.currentHostId;
        state.players.forEach(p => {
            const li = document.createElement('li');
            let text = `<span>${p.name}</span>`;
            let controls = '';
            if (p.id === state.myId) text += ' <em>(Bạn)</em>';
            if (p.id === state.currentHostId) text += ' <strong class="host-tag">[Trưởng Đoàn]</strong>';
            if (p.isBot) li.classList.add('bot');
            if (isHost && p.id !== state.myId) {
                controls = `<button class="kick-btn" onclick="handleKickPlayer('${p.id}')">Trục Xuất</button>`;
            }
            li.innerHTML = `<div>${text}</div><div>${controls}</div>`;
            this.roomElements.playerList.appendChild(li);
        });
        this.roomElements.hostControls.style.display = isHost ? 'block' : 'none';
        this.roomElements.startGameBtn.disabled = state.players.length < 2;
    },

    renderPlayerCards() {
        this.gameElements.playersContainer.innerHTML = '';
        state.players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.id = `player-card-${player.id}`;
            if (player.id === state.myId) card.classList.add('is-self');
            
            let actionStatusHTML = '<p class="chosen-action info">Đang hành động...</p>';
            if (player.disconnected) {
                actionStatusHTML = '<p class="chosen-action error-text">Mất tích</p>';
            } else if (player.chosenAction) {
                 actionStatusHTML = '<p class="chosen-action success-text">✅ Đã hành động</p>';
            }

            // Phiên bản HTML đúng, không có lỗi đánh máy
            card.innerHTML = `
                <h3>${player.name}</h3>
                <p>Tiến Độ: <span class="player-score">${player.score}</span></p>
                <div class="chosen-action-wrapper">
                    ${actionStatusHTML}
                </div>`;
                
            if (player.disconnected) card.classList.add('disconnected');
            this.gameElements.playersContainer.appendChild(card);
        });
    },

    displayRole() {
        const role = state.myRole;
        if (!this.gameElements.roleDisplay || !role || !role.name) return;
        let skillButtonHTML = '';
        if (role.hasActiveSkill) {
            skillButtonHTML = `<button id="skill-btn" class="skill-button">${role.skillName || 'Dùng Kỹ Năng'}</button>`;
        }
        this.gameElements.roleDisplay.innerHTML = `<h4>Thiên Mệnh Của Bạn</h4><strong>${role.name}</strong><p>${role.description}</p>${skillButtonHTML}`;
        this.gameElements.roleDisplay.style.display = 'block';
        if (role.hasActiveSkill) {
            document.getElementById('skill-btn').addEventListener('click', () => this.handleSkillClick());
        }
    },
    
    // --- IV. UPDATE FUNCTIONS ---
    updateNewRoundUI(data) {
        this.gameElements.roundIndicator.textContent = data.roundNumber;
        this.gameElements.phaseTitle.textContent = 'Hành Động Trong Đêm';
        this.gameElements.decreeDisplay.style.display = 'none';
        let phaseHTML = `<div id="timer-display">${data.duration}</div><div id="player-choice-buttons-wrapper"><button class="choice-buttons loyal" onclick="handleSendPlayerChoice('Giải Mã')">Giải Mã</button><button class="choice-buttons corrupt" onclick="handleSendPlayerChoice('Phá Hoại')">Phá Hoại</button><button class="choice-buttons blank" onclick="handleSendPlayerChoice('Quan Sát')">Quan Sát</button></div>`;
        this.gameElements.actionControls.innerHTML = phaseHTML;
        this.logMessage('info', `--- Đêm thứ ${data.roundNumber} bắt đầu! ---`);
        this.startCountdown(data.duration);
        const skillBtn = document.getElementById('skill-btn');
        if (skillBtn) {
            skillBtn.disabled = false;
            skillBtn.textContent = state.myRole.skillName || 'Dùng Kỹ Năng';
        }
    },

    renderChaosPhase(data) {
        this.gameElements.phaseTitle.textContent = "Giờ Hoàng Hôn";
        const totalPlayers = state.players.filter(p => !p.disconnected).length;
        let html = `<div id="timer-display">${data.duration}</div><div class="chaos-actions"><button onclick="handleStartTargetSelection('Vạch Trần')">Vạch Trần</button><button onclick="handleStartTargetSelection('Phối Hợp')">Phối Hợp</button></div><button id="skip-chaos-btn" class="skip-button" onclick="handleVoteToSkipChaos()">Nghỉ Ngơi <span id="skip-vote-count">(0/${totalPlayers})</span></button>`;
        this.gameElements.actionControls.innerHTML = html;
        this.startCountdown(data.duration);
    },

    startCountdown(duration) {
        let timeLeft = duration;
        clearInterval(state.countdownTimer);
        state.countdownTimer = setInterval(() => {
            timeLeft--;
            const timerEl = document.getElementById('timer-display');
            if (timerEl) timerEl.textContent = timeLeft >= 0 ? timeLeft : 0;
            if (timeLeft < 0) clearInterval(state.countdownTimer);
        }, 1000);
    },

    updatePlayerCard(playerId, updates) {
        const card = document.getElementById(`player-card-${playerId}`);
        if (!card) return; // Guard clause
        if (updates.hasOwnProperty('score')) {
            const scoreEl = card.querySelector('.player-score');
            if(scoreEl) { // Safety check
                const oldScore = parseInt(scoreEl.textContent);
                const newScore = updates.score;
                if (oldScore !== newScore) {
                    scoreEl.textContent = newScore;
                    const animationClass = newScore > oldScore ? 'score-up' : 'score-down';
                    scoreEl.classList.add(animationClass);
                    setTimeout(() => scoreEl.classList.remove(animationClass), 1000);
                }
            }
        }
        if (updates.hasOwnProperty('actionText')) {
            const actionEl = card.querySelector('.chosen-action');
            if (actionEl) { // Safety check
                actionEl.innerHTML = updates.actionText;
            }
        }
        if (updates.hasOwnProperty('disconnected')) {
             card.classList.add('disconnected');
             card.querySelector('h3').textContent = updates.newName;
             const actionEl = card.querySelector('.chosen-action');
             if(actionEl) {
                actionEl.className = 'chosen-action error-text';
                actionEl.textContent = 'Mất tích';
             }
        }
    },

    renderRoundResults(data) {
        this.gameElements.phaseTitle.textContent = 'Kết Quả Đêm';
        this.gameElements.actionControls.innerHTML = ''; 
        const { finalVoteCounts: counts, results, players } = data;
        this.logMessage('info', `Kết quả: ${counts['Giải Mã'] || 0} Giải Mã, ${counts['Phá Hoại'] || 0} Phá Hoại, ${counts['Quan Sát'] || 0} Quan Sát.`);
        results.messages.forEach(msg => this.logMessage('info', msg));
        players.forEach(p => {
            const change = results.scoreChanges[p.id] || 0;
            if (change > 0) this.logMessage('success', `👍 ${p.name} nhận được +${change} Tiến Độ.`);
            else if (change < 0) this.logMessage('error', `👎 ${p.name} mất ${change} Tiến Độ.`);
            const choiceClass = { 'Giải Mã': 'loyal-text', 'Phá Hoại': 'corrupt-text', 'Quan Sát': 'blank-text' }[p.chosenAction] || 'info';
            this.updatePlayerCard(p.id, {
                score: p.score,
                actionText: `Hành động: <span class="${choiceClass}">${p.chosenAction || 'Không rõ'}</span>`
            });
        });
    },

    renderGameOver(data) {
        this.gameElements.phaseTitle.textContent = '🏆 CUỘC THÁM HIỂM KẾT THÚC 🏆';
        this.gameElements.actionControls.innerHTML = '';
        let message = 'Một kết quả không ngờ tới!';
        if (data.winner) {
            this.playSound('game-over-win');
            let reasonText = `đã tìm thấy Cổ Vật với ${data.winner.score} Tiến Độ!`;
            if (data.winner.reason) reasonText = data.winner.reason;
            message = `🎉 **${data.winner.name}** ${reasonText} 🎉`;
        } else if (data.loser) {
            this.playSound('game-over-lose');
            message = `☠️ **${data.loser.name}** đã bị Lời Nguyền nuốt chửng! ☠️`;
        }
        this.logMessage('warning', message);
        let finalHTML = `<h2 class="warning">${message}</h2>`;
        if (state.myId === state.currentHostId) {
            finalHTML += `<button class="skip-button" onclick="Network.emit('playAgain', state.currentRoomCode)">Thám Hiểm Lần Nữa</button>`;
        } else {
            finalHTML += `<p class="info">Đang chờ Trưởng Đoàn bắt đầu cuộc thám hiểm mới...</p>`;
        }
        this.gameElements.actionControls.innerHTML = finalHTML;
    },

   // --- V. EVENT HANDLERS & HELPERS (Bên trong đối tượng UI) ---
// Các hàm này xử lý logic giao diện phức tạp và hoạt động như các hàm tiện ích.
// ======================================================================

/**
 * Bộ định tuyến (router) cho việc xử lý click vào nút kỹ năng.
 * Nó đọc vai trò của người chơi từ state và gọi hàm xử lý tương ứng.
 */
handleSkillClick() {
    this.playSound('click');
    const role = state.myRole; // Lấy vai trò hiện tại từ state
    if (!role) return;

    switch (role.id) {
        case 'ASSASSIN': this.assassinSkillFlow(); break;
        case 'PUPPETEER': this.puppeteerSkillFlow(); break;
        case 'PROPHET': this.prophetSkillFlow(); break;
        case 'PRIEST': this.priestSkillFlow(); break;
        // Các kỹ năng đơn giản không cần mục tiêu có thể xử lý ở đây
        default:
            Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: {} });
            break;
    }
},

/**
 * Luồng giao diện 2 bước cho kỹ năng Ám Sát.
 */
assassinSkillFlow() {
    const playerOptions = this.getTargetOptions();
    Swal.fire({
        title: 'Ám Sát: Chọn Mục Tiêu',
        input: 'select',
        inputOptions: playerOptions,
        inputPlaceholder: 'Chọn mục tiêu...',
        showCancelButton: true,
        cancelButtonText: 'Hủy bỏ',
        confirmButtonText: 'Tiếp tục →',
        background: '#2d3748',
        color: '#e2e8f0',
    }).then(playerResult => {
        if (!playerResult.isConfirmed || !playerResult.value) return; // Người dùng hủy
        
        const targetId = playerResult.value;
        const targetName = playerOptions[targetId];
        const possibleRoles = this.getPossibleRoles(true); // Lấy danh sách vai trò, loại trừ Sát thủ

        Swal.fire({
            title: `Đoán Vai Trò Của ${targetName}`,
            input: 'select',
            inputOptions: possibleRoles,
            inputPlaceholder: 'Chọn vai trò...',
            showCancelButton: true,
            cancelButtonText: 'Hủy bỏ',
            confirmButtonText: 'Xác nhận Ám Sát!',
            confirmButtonColor: '#e53e3e',
            background: '#2d3748',
            color: '#e2e8f0',
        }).then(roleResult => {
            if (!roleResult.isConfirmed || !roleResult.value) return; // Người dùng hủy
            
            // Gửi yêu cầu lên server
            Network.emit('useRoleSkill', {
                roomCode: state.currentRoomCode,
                payload: { targetId: targetId, guessedRoleId: roleResult.value }
            });

            // Vô hiệu hóa nút để tránh dùng nhiều lần
            const skillBtn = document.getElementById('skill-btn');
            if (skillBtn) {
                skillBtn.disabled = true;
                skillBtn.textContent = 'Đã Ám Sát';
            }
        });
    });
},

/**
 * Luồng giao diện cho kỹ năng Giật Dây của Kẻ Thao Túng.
 */
puppeteerSkillFlow() {
    const puppetName = state.myRole.description.match(/<strong>(.*?)<\/strong>/)?.[1];
    const puppet = state.players.find(pl => pl.name === puppetName);
    const targetOptions = this.getTargetOptions(puppet?.id); // Loại trừ con rối khỏi danh sách mục tiêu

    Swal.fire({
        title: 'Giật Dây',
        text: 'Chọn một người để hoán đổi hành động với Con Rối của bạn:',
        input: 'select',
        inputOptions: targetOptions,
        inputPlaceholder: 'Chọn mục tiêu...',
        showCancelButton: true,
        cancelButtonText: 'Hủy bỏ',
    }).then(result => {
        if (!result.isConfirmed || !result.value) return;
        
        Network.emit('useRoleSkill', {
            roomCode: state.currentRoomCode,
            payload: { targetId: result.value }
        });
        const skillBtn = document.getElementById('skill-btn');
        if (skillBtn) {
            skillBtn.disabled = true;
            skillBtn.textContent = 'Đã Giật Dây';
        }
    });
},

/**
 * Luồng giao diện cho kỹ năng Thiên Lý Nhãn của Nhà Tiên Tri.
 */
prophetSkillFlow() {
    const targetOptions = this.getTargetOptions();
    Swal.fire({
        title: 'Thiên Lý Nhãn',
        text: 'Chọn một người để xem hành động của họ:',
        input: 'select',
        inputOptions: targetOptions,
        inputPlaceholder: 'Chọn mục tiêu...',
        showCancelButton: true,
        confirmButtonText: 'Xem',
        background: '#2d3748',
        color: '#e2e8f0',
    }).then(result => {
        if (result.isConfirmed && result.value) {
            Network.emit('useRoleSkill', { 
                roomCode: state.currentRoomCode,
                payload: { targetId: result.value }
            });
            const skillBtn = document.getElementById('skill-btn');
            if (skillBtn) {
                skillBtn.disabled = true;
                skillBtn.textContent = 'Đã Dùng Kỹ Năng';
            }
        }
    });
},

/**
 * Luồng giao diện cho kỹ năng Ban Phước của Thầy Tế.
 */
priestSkillFlow() {
    const targetOptions = this.getTargetOptions();
    Swal.fire({
        title: 'Thánh Nữ Ban Phước',
        text: 'Chọn một người để bảo vệ khỏi mất điểm đêm nay:',
        input: 'select',
        inputOptions: targetOptions,
        inputPlaceholder: 'Chọn người được ban phước...',
        showCancelButton: true,
        confirmButtonText: 'Ban Phước',
    }).then(result => {
        if (result.isConfirmed && result.value) {
            Network.emit('useRoleSkill', {
                roomCode: state.currentRoomCode,
                payload: { targetId: result.value }
            });
            const skillBtn = document.getElementById('skill-btn');
            if (skillBtn) {
                skillBtn.disabled = true;
                skillBtn.textContent = 'Đã Ban Phước';
            }
        }
    });
},

/**
 * Hàm tiện ích để lấy danh sách mục tiêu hợp lệ cho các kỹ năng.
 * @param {string|null} excludeId - ID của người chơi cần loại trừ (ví dụ: Con Rối).
 * @returns {Object} - Object dạng { id: name } cho SweetAlert.
 */
getTargetOptions(excludeId = null) {
    return state.players.reduce((opts, p) => {
        // Điều kiện: Không phải mình, không phải người bị loại trừ, và không bị ngắt kết nối
        if (p.id !== state.myId && p.id !== excludeId && !p.disconnected) {
            opts[p.id] = p.name;
        }
        return opts;
    }, {});
},

/**
 * Hàm tiện ích để lấy danh sách vai trò có thể đoán.
 * @param {boolean} excludeAssassin - Có loại trừ vai trò Sát Thủ không?
 * @returns {Object} - Object dạng { ROLE_ID: Role Name }.
 */
getPossibleRoles(excludeAssassin = false) {
    const roles = { ...state.possibleRoles }; // Luôn đọc từ state để có danh sách vai trò mới nhất
    if (excludeAssassin && roles['ASSASSIN']) {
        delete roles['ASSASSIN'];
    }
    return roles;
},
    
/**
 * Hiển thị modal cho Tiếng Vọng "Bùa Lú Lẫn".
 * @param {Array} players - Danh sách người chơi để chọn.
 */
promptAmnesiaSelection(players) {
    const playerInputs = players.map(p => 
        `<label class="swal2-checkbox">
            <input type="checkbox" value="${p.id}">
            <span class="swal2-label">${p.name}</span>
        </label>`
    ).join('');

    Swal.fire({
        title: 'Bùa Lú Lẫn',
        html: `
            <p>Bạn được quyền hoán đổi hành động của 2 người. Hãy chọn chính xác 2 người:</p>
            <div id="amnesia-player-list" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left;">${playerInputs}</div>
        `,
        confirmButtonText: 'Hoán Đổi',
        background: '#2d3748',
        color: '#e2e8f0',
        preConfirm: () => {
            const checkedBoxes = document.querySelectorAll('#amnesia-player-list input:checked');
            if (checkedBoxes.length !== 2) {
                Swal.showValidationMessage('Bạn phải chọn chính xác 2 người!');
                return false;
            }
            return Array.from(checkedBoxes).map(box => box.value);
        }
    }).then(result => {
        if (result.isConfirmed && result.value) {
            const [player1Id, player2Id] = result.value;
            Network.emit('amnesiaAction', { roomCode: state.currentRoomCode, player1Id, player2Id });
        }
    });
},

}; // Kết thúc đối tượng UI


// ==========================================================
// --- VI. GLOBAL EVENT HANDLERS (Hàm xử lý sự kiện toàn cục) ---
// ==========================================================
// Các hàm này phải được định nghĩa ở phạm vi toàn cục để onclick trong HTML có thể tìm thấy.

function handleKickPlayer(playerId) {
    UI.playSound('click');
    Swal.fire({
        title: 'Trục Xuất Thợ Săn?',
        text: "Bạn có chắc muốn trục xuất người này khỏi đoàn?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e53e3e',
        cancelButtonColor: '#718096',
        confirmButtonText: 'Đúng, trục xuất!',
        cancelButtonText: 'Hủy'
    }).then((result) => {
        if (result.isConfirmed) {
            Network.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId });
        }
    });
}

function handleSendPlayerChoice(choice) {
    UI.playSound('click');
    UI.gameElements.actionControls.innerHTML = '<p class="info">Đã hành động... Chờ đợi trong bóng tối...</p>';
    Network.emit('playerChoice', { roomCode: state.currentRoomCode, choice });
}

function handleStartTargetSelection(actionType) {
    UI.playSound('click');
    document.body.classList.add('selecting-target');
    UI.logMessage('info', `Hãy chọn một người chơi trên màn hình để ${actionType}. Nhấn Esc hoặc click ra ngoài để hủy.`);

    const cards = document.querySelectorAll('.player-card:not(.disconnected)');
    
    const cleanup = () => {
        document.body.classList.remove('selecting-target');
        cards.forEach(card => card.onclick = null);
        window.removeEventListener('keydown', handleEscape);
        document.removeEventListener('click', handleOutsideClick);
    };

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            cleanup();
            UI.logMessage('info', 'Đã hủy hành động.');
        }
    };

    const handleOutsideClick = (e) => {
        if (!e.target.closest('.player-card')) {
             cleanup();
             UI.logMessage('info', 'Đã hủy hành động.');
        }
    };

    window.addEventListener('keydown', handleEscape, { once: true });
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 0);

    cards.forEach(card => {
        const cardPlayerId = card.id.replace('player-card-', '');
        if (cardPlayerId === state.myId) return;

        card.onclick = (e) => {
            e.stopPropagation();
            const targetId = card.id.replace('player-card-', '');
            cleanup();
            handleChaosActionSelection(targetId, actionType);
        };
    });
}

function handleChaosActionSelection(targetId, actionType) {
    const targetName = state.players.find(p => p.id === targetId)?.name || 'Không rõ';
    
    if (actionType === 'Vạch Trần') {
        Swal.fire({
            title: `Đoán Hành Động Của ${targetName}`,
            text: 'Bạn đoán hành động của họ là:',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Giải Mã',
            denyButtonText: 'Phá Hoại',
            cancelButtonText: 'Quan Sát',
            background: '#2d3748',
            color: '#e2e8f0',
            confirmButtonColor: '#48bb78',
            denyButtonColor: '#e53e3e'
        }).then(result => {
            let guess = null;
            if (result.isConfirmed) guess = 'Giải Mã';
            else if (result.isDenied) guess = 'Phá Hoại';
            else if (result.dismiss === Swal.DismissReason.cancel) guess = 'Quan Sát';
            
            if (guess) {
                Network.emit('requestChaosAction', { roomCode: state.currentRoomCode, targetId, actionType: 'Vạch Trần', guess });
            }
        });
    } else { // Phối Hợp
        Network.emit('requestChaosAction', { roomCode: state.currentRoomCode, targetId, actionType: 'Phối Hợp' });
    }
}

function handleVoteToSkipChaos() {
    UI.playSound('click');
    const btn = document.getElementById('skip-chaos-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đã bỏ phiếu...';
    }
    Network.emit('playerVotedToSkip', state.currentRoomCode);
}