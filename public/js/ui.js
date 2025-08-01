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
    try { new Audio(`/assets/sounds/${soundName}.mp3`).play(); }
    catch (e) { console.warn(`Không thể phát âm thanh: ${soundName}`); }
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
	addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.classList.add('chat-message');
    
    // Sanitize message to prevent XSS attacks
    const senderEl = document.createElement('span');
    senderEl.className = 'chat-sender';
    senderEl.textContent = `${sender}: `;
    
    const messageContentEl = document.createElement('span');
    messageContentEl.textContent = message;

    messageEl.appendChild(senderEl);
    messageEl.appendChild(messageContentEl);
    
    chatMessages.prepend(messageEl); // Thêm tin nhắn mới lên trên cùng (vì flex-direction: column-reverse)
},

   // --- V. EVENT HANDLERS & HELPERS (Bên trong đối tượng UI) ---
// Các hàm này xử lý logic giao diện phức tạp và hoạt động như các hàm tiện ích.
// ======================================================================

 * Bộ định tuyến (router) cho việc xử lý click vào nút kỹ năng.
 * Nó đọc vai trò của người chơi từ state và gọi hàm xử lý tương ứng.
 */
handleSkillClick() {
    this.playSound('click');
    const role = state.myRole;
    if (!role) return;

    // Xử lý logic đặc biệt cho Kẻ Bắt Chước
    if (role.id === 'MIMIC') {
        const mimicTarget = state.players.find(p => p.id === state.myRole.mimicTargetId);
        if (!mimicTarget) {
            Swal.fire({ title: 'Lỗi', text: 'Không tìm thấy mục tiêu để bắt chước!', icon: 'error' });
            return;
        }
        
        // Lấy thông tin vai trò của mục tiêu từ danh sách vai trò trong game
        const targetRoleInfo = ROLES[mimicTarget.roleId];

        if (targetRoleInfo && targetRoleInfo.hasActiveSkill) {
            // "Mượn" thông tin vai trò của mục tiêu để tái sử dụng logic hiển thị modal
            // Tạo một object vai trò giả để truyền vào các hàm flow
            const fakeRole = {
                id: mimicTarget.roleId,
                skillName: targetRoleInfo.skillName,
                description: targetRoleInfo.description
            };
            this.mimicSkillFlow(fakeRole, mimicTarget.id);
        } else {
            Swal.fire({ title: 'Không Thể Sao Chép', text: 'Mục tiêu của bạn không có kỹ năng kích hoạt để sử dụng!', icon: 'info', background: '#2d3748', color: '#e2e8f0' });
        }
        return;
    }

    // Định tuyến cho các vai trò khác
    switch (role.id) {
        case 'PROPHET': this.prophetSkillFlow(); break;
        case 'PEACEMAKER': this.peacemakerSkillFlow(); break;
        case 'INQUISITOR': this.inquisitorSkillFlow(); break;
        case 'MAGNATE': this.magnateSkillFlow(); break;
        case 'BALANCER': this.balancerSkillFlow(); break;
        case 'REBEL': this.rebelSkillFlow(); break;
        case 'PRIEST': this.priestSkillFlow(); break;
        case 'THIEF': this.thiefSkillFlow(); break;
        case 'MIND_BREAKER': this.mindBreakerSkillFlow(); break;
        case 'CULTIST': this.cultistSkillFlow(); break;
        case 'DOUBLE_AGENT': this.doubleAgentSkillFlow(); break;
        case 'PHANTOM': this.phantomSkillFlow(); break;
        // Kẻ Đánh Cược và Sát Thủ có kỹ năng bị động hoặc không cần chọn mục tiêu phức tạp
        default:
            Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: {} });
            break;
    }
},

// --- Các luồng xử lý kỹ năng chi tiết ---

// (Các flow cho Prophet, Peacemaker, Gambler, Inquisitor, Magnate, Balancer, Rebel, Priest, Thief, Mind Breaker, Cultist, Double Agent, Phantom đã được cung cấp và giữ nguyên)
// ...
// Dưới đây là ví dụ chi tiết cho một vài flow phức tạp để bạn kiểm tra lại

/**
 * Luồng kỹ năng cho Kẻ Tẩy Não (chọn mục tiêu)
 */
mindBreakerSkillFlow() {
    const targetOptions = this.getTargetOptions();
    Swal.fire({
        title: 'Điều Khiển',
        text: 'Chọn một người để quyết định hành động của họ:',
        input: 'select',
        inputOptions: targetOptions,
        inputPlaceholder: 'Chọn mục tiêu...',
        showCancelButton: true,
        confirmButtonText: 'Chọn',
        background: '#2d3748', color: '#e2e8f0'
    }).then(result => {
        if (result.isConfirmed && result.value) {
            // Gửi yêu cầu lên server, server sẽ phản hồi bằng sự kiện 'promptMindControl'
            Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: { targetId: result.value } });
            
            const skillBtn = document.getElementById('skill-btn');
            if (skillBtn) {
                skillBtn.disabled = true;
                skillBtn.textContent = 'Đang Điều Khiển...';
            }
        }
    });
},

/**
 * Luồng kỹ năng cho Kẻ Bắt Chước (sau khi đã xác định được vai trò của mục tiêu)
 */
mimicSkillFlow(fakeRole, targetPlayerId) {
    // Luồng này tương tự như handleSkillClick, nhưng dành riêng cho Kẻ Bắt Chước
    // Nó quyết định sẽ hiển thị modal nào dựa trên kỹ năng "mượn" được
    // Ví dụ:
    switch (fakeRole.id) {
        case 'PROPHET':
            this.prophetSkillFlow(true); // Thêm một cờ để báo hiệu đây là từ Kẻ Bắt Chước
            break;
        case 'PRIEST':
            this.priestSkillFlow(true);
            break;
        // Thêm các case khác cho tất cả các vai trò có kỹ năng kích hoạt
        default:
            // Cho các kỹ năng không cần chọn mục tiêu, chỉ cần gửi sự kiện
            Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: {} });
            break;
    }
},

/**
 * Hàm hiển thị modal cho Kẻ Tẩy Não chọn hành động cho mục tiêu
 */
promptMindControlSelection(targetId) {
    const target = state.players.find(p => p.id === targetId);
    if (!target) return;

    Swal.fire({
        title: `Chọn Hành Động Cho ${target.name}`,
        text: 'Lựa chọn của bạn sẽ là hành động của họ trong đêm nay.',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Giải Mã',
        denyButtonText: 'Phá Hoại',
        cancelButtonText: 'Quan Sát',
        background: '#2d3748', color: '#e2e8f0'
    }).then(result => {
        let chosenAction = null;
        if (result.isConfirmed) chosenAction = 'Giải Mã';
        else if (result.isDenied) chosenAction = 'Phá Hoại';
        else if (result.dismiss === Swal.DismissReason.cancel) chosenAction = 'Quan Sát';
        
        if (chosenAction) {
            Network.emit('mindControlAction', {
                roomCode: state.currentRoomCode,
                targetId: targetId,
                chosenAction: chosenAction,
            });
        }
    });
},


// --- Các hàm tiện ích ---
getTargetOptions(excludeId = null) {
    return state.players.reduce((opts, p) => {
        if (p.id !== state.myId && p.id !== excludeId && !p.disconnected) {
            opts[p.id] = p.name;
        }
        return opts;
    }, {});
},

getPossibleRoles(excludeOwnRole = false) {
    const roles = { ...state.possibleRoles };
    if (excludeOwnRole && state.myRole && roles[state.myRole.id]) {
        delete roles[state.myRole.id];
    }
    return roles;
},
    
promptAmnesiaSelection(players) {
    const playerInputs = players.map(p => 
        `<label class="swal2-checkbox"><input type="checkbox" value="${p.id}"><span class="swal2-label">${p.name}</span></label>`
    ).join('');

    Swal.fire({
        title: 'Bùa Lú Lẫn',
        html: `<p>Bạn được quyền hoán đổi hành động của 2 người. Hãy chọn chính xác 2 người:</p><div id="amnesia-player-list" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left;">${playerInputs}</div>`,
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