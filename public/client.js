// ======================================================================
// THỢ SĂN CỔ VẬT - CLIENT LOGIC (PHIÊN BẢN NÂNG CẤP, DỄ BẢO TRÌ)
// ======================================================================

// --- I. KHỞI TẠO SOCKET VÀ KHAI BÁO BIẾN TRẠNG THÁI ---

// Kết nối tới server Socket.IO
const socket = io();

// `state` là một object duy nhất chứa tất cả trạng thái của client.
// Việc gom vào một nơi giúp dễ dàng theo dõi và gỡ lỗi.
const state = {
    myId: null,
    currentRoomCode: null,
    currentHostId: null,
    players: [],
    myRole: null,
    countdownTimer: null, // Biến để lưu trữ interval của bộ đếm ngược
};

// --- II. TRUY XUẤT CÁC PHẦN TỬ DOM ---

// Gom tất cả các phần tử DOM vào một object để tiện truy cập và quản lý.
const DOM = {
    screens: {
        home: document.getElementById('home-screen'),
        room: document.getElementById('room-screen'),
        game: document.getElementById('game-screen'),
    },
    home: {
        createRoomBtn: document.getElementById('create-room-btn'),
        joinRoomBtn: document.getElementById('join-room-btn'),
        roomCodeInput: document.getElementById('room-code-input'),
        nameInput: document.getElementById('player-name-input'),
    },
    room: {
        roomCodeDisplay: document.getElementById('room-code-display'),
        playerList: document.getElementById('player-list'),
        hostControls: document.getElementById('host-controls'),
        addBotBtn: document.getElementById('add-bot-btn'),
        startGameBtn: document.getElementById('start-game-btn'),
    },
    game: {
        roleDisplay: document.getElementById('role-display'),
        roundIndicator: document.getElementById('current-round'),
        decreeDisplay: document.getElementById('decree-display'),
        playersContainer: document.getElementById('players-container'),
        phaseTitle: document.getElementById('phase-title'),
        actionControls: document.getElementById('action-controls'),
        messageArea: document.getElementById('message-area'),
    },
};

// --- III. CÁC HÀM TIỆN ÍCH (HELPER FUNCTIONS) ---

/**
 * Hiển thị một màn hình và ẩn các màn hình khác.
 * @param {string} screenName - Tên màn hình cần hiển thị ('home', 'room', 'game').
 */
function showScreen(screenName) {
    for (const key in DOM.screens) {
        DOM.screens[key].style.display = key === screenName ? 'block' : 'none';
    }
}

/**
 * Thêm một tin nhắn vào khu vực hiển thị log của game.
 * @param {string} type - Loại tin nhắn ('info', 'success', 'error', 'warning').
 * @param {string} messageHTML - Nội dung tin nhắn (có thể chứa mã HTML).
 */
function logMessage(type, messageHTML) {
    const p = document.createElement('p');
    p.className = type;
    p.innerHTML = messageHTML;
    DOM.game.messageArea.prepend(p); // Dùng prepend để tin nhắn mới nhất luôn ở trên cùng
}

/**
 * Chơi một file âm thanh.
 * @param {string} soundFile - Tên file âm thanh (ví dụ: 'click.mp3').
 */
function playSound(soundFile) {
    // try...catch để game không bị crash nếu không load được âm thanh.
    try {
        new Audio(`/assets/sounds/${soundFile}`).play();
    } catch (e) {
        console.warn(`Không thể phát âm thanh: ${soundFile}`, e);
    }
}

/**
 * Lấy class CSS tương ứng với một lựa chọn hành động.
 * @param {string} choice - Hành động ('Giải Mã', 'Phá Hoại', 'Quan Sát').
 * @returns {string} - Tên class CSS.
 */
function getChoiceClass(choice) {
    switch (choice) {
        case 'Giải Mã': return 'success-text';
        case 'Phá Hoại': return 'error-text';
        case 'Quan Sát': return 'info-text';
        default: return '';
    }
}

// --- IV. CÁC HÀM RENDER (HIỂN THỊ DỮ LIỆU RA GIAO DIỆN) ---

/**
 * Cập nhật và hiển thị lại danh sách người chơi trong phòng chờ.
 */
function renderPlayerList() {
    DOM.room.playerList.innerHTML = ''; // Xóa danh sách cũ
    const isHost = state.myId === state.currentHostId;

    state.players.forEach(p => {
        const li = document.createElement('li');
        
        let playerInfoHTML = `<span>${p.name}</span>`;
        if (p.id === state.myId) playerInfoHTML += ' <em>(Bạn)</em>';
        if (p.id === state.currentHostId) playerInfoHTML += ' <strong class="host-tag">[Trưởng Đoàn]</strong>';
        if (p.disconnected) playerInfoHTML += ' <span class="disconnected-tag">(Mất tích)</span>';
        
        const controlsDiv = document.createElement('div');
        if (isHost && p.id !== state.myId) {
            const kickButton = document.createElement('button');
            kickButton.className = 'kick-btn';
            kickButton.textContent = 'Trục Xuất';
            kickButton.onclick = () => handleKickPlayer(p.id); // Gắn sự kiện trực tiếp
            controlsDiv.appendChild(kickButton);
        }

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = playerInfoHTML;
        
        li.appendChild(infoDiv);
        li.appendChild(controlsDiv);

        if (p.isBot) li.classList.add('bot');
        DOM.room.playerList.appendChild(li);
    });

    DOM.room.hostControls.style.display = isHost ? 'block' : 'none';
    if (DOM.room.startGameBtn) {
        DOM.room.startGameBtn.disabled = state.players.length < 2;
    }
}

/**
 * Hiển thị vai trò bí mật của người chơi.
 * @param {Object} role - Object chứa thông tin vai trò từ server.
 */
function renderRole(role) {
    if (!DOM.game.roleDisplay || !role || !role.name) {
        console.error("[CLIENT-ERROR] Không thể hiển thị vai trò. Dữ liệu hoặc phần tử HTML bị thiếu.", { role, element: DOM.game.roleDisplay });
        return;
    }
    DOM.game.roleDisplay.innerHTML = `
        <h4>Thiên Mệnh Của Bạn</h4>
        <strong>${role.name}</strong>
        <p>${role.description}</p>
    `;
    DOM.game.roleDisplay.style.display = 'block';
}

/**
 * Tạo và hiển thị các thẻ người chơi trong màn hình game.
 */
function renderPlayerCards() {
    DOM.game.playersContainer.innerHTML = '';
    state.players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.id = `player-card-${player.id}`;
        card.innerHTML = `
            <h3>${player.name}</h3>
            <p>Tiến Độ: <span class="player-score">${player.score}</span></p>
            <div class="chosen-action-wrapper">
                <p class="chosen-action info">Đang hành động...</p>
            </div>
        `;
        if (player.disconnected) card.classList.add('disconnected');
        DOM.game.playersContainer.appendChild(card);
    });
}

// --- V. CÁC HÀM XỬ LÝ SỰ KIỆN TỪ SERVER (SOCKET.ON) ---

/**
 * Thiết lập tất cả các trình lắng nghe sự kiện từ server.
 */
function setupSocketListeners() {
    socket.on('connect', () => {
        state.myId = socket.id;
        showScreen('home');
    });

    socket.on('roomError', (msg) => {
        // Nâng cấp alert bằng SweetAlert2 cho đẹp hơn
        alert(`Lỗi: ${msg}`);
    });

    socket.on('joinedRoom', (data) => {
        state.currentRoomCode = data.roomCode;
        state.currentHostId = data.hostId;
        state.players = data.players;
        DOM.room.roomCodeDisplay.textContent = state.currentRoomCode;
        renderPlayerList();
        showScreen('room');
    });

    socket.on('updatePlayerList', (players, hostId) => {
        state.players = players;
        state.currentHostId = hostId;
        renderPlayerList();
    });

    socket.on('kicked', () => {
        alert("Bạn đã bị Trưởng Đoàn trục xuất!");
        showScreen('home');
    });

    // SỬA LỖI #1: Chỉ hiển thị màn hình game, không ẩn vai trò.
    socket.on('gameStarted', () => {
        showScreen('game');
        DOM.game.messageArea.innerHTML = ''; // Xóa log cũ
        // Dòng code ẩn `roleDisplay` đã được XÓA BỎ khỏi đây.
    });

    // SỬA LỖI #2: Đã nhận vai trò thì gọi hàm renderRole.
    socket.on('yourRoleIs', (role) => {
        console.log('[CLIENT-DEBUG] Đã nhận được vai trò:', role);
        state.myRole = role;
        renderRole(role); // Gọi hàm render chuyên dụng
    });

    socket.on('newRound', (data) => {
        state.players = data.players;
        DOM.game.roundIndicator.textContent = data.roundNumber;
        DOM.game.phaseTitle.textContent = 'Hành Động Trong Đêm';
        DOM.game.decreeDisplay.style.display = 'none'; // Ẩn Tiếng Vọng của vòng trước
        
        renderPlayerCards(); // Vẽ lại thẻ người chơi cho vòng mới

        // Hiển thị các nút hành động
        DOM.game.actionControls.innerHTML = `
            <div id="timer-display">${data.duration}</div>
            <div id="player-choice-buttons-wrapper">
                <button class="choice-buttons loyal" onclick="handlePlayerChoice('Giải Mã')">Giải Mã</button>
                <button class="choice-buttons corrupt" onclick="handlePlayerChoice('Phá Hoại')">Phá Hoại</button>
                <button class="choice-buttons blank" onclick="handlePlayerChoice('Quan Sát')">Quan Sát</button>
            </div>
        `;
        logMessage('info', `--- Đêm thứ ${data.roundNumber} bắt đầu! ---`);

        // Bắt đầu đếm ngược
        let timeLeft = data.duration;
        clearInterval(state.countdownTimer); // Xóa bộ đếm cũ nếu có
        state.countdownTimer = setInterval(() => {
            timeLeft--;
            const timerEl = document.getElementById('timer-display');
            if (timerEl) timerEl.textContent = timeLeft >= 0 ? timeLeft : 0;
            if (timeLeft < 0) clearInterval(state.countdownTimer);
        }, 1000);
    });
    
    socket.on('playerChose', (playerId) => {
        const card = document.getElementById(`player-card-${playerId}`);
        if (card) {
            const actionEl = card.querySelector('.chosen-action');
            actionEl.textContent = '✅ Đã hành động';
            actionEl.className = 'chosen-action info';
        }
    });

    // (Các hàm xử lý sự kiện phức tạp khác như decree, chaos, roundResult... sẽ ở đây)
    // Ví dụ:
    socket.on('roundResult', data => {
        DOM.game.phaseTitle.textContent = 'Kết Quả Đêm';
        DOM.game.actionControls.innerHTML = '';
        logMessage('info', `Kết quả: ${data.finalVoteCounts['Giải Mã'] || 0} Giải Mã, ${data.finalVoteCounts['Phá Hoại'] || 0} Phá Hoại, ${data.finalVoteCounts['Quan Sát'] || 0} Quan Sát.`);
        
        data.results.messages.forEach(msg => logMessage('info', msg));

        data.players.forEach(p => {
            const card = document.getElementById(`player-card-${p.id}`);
            if (card) {
                const change = data.results.scoreChanges[p.id] || 0;
                if (change > 0) {
                    playSound('success.mp3');
                    logMessage('success', `👍 ${p.name} nhận được +${change} Tiến Độ.`);
                } else if (change < 0) {
                    playSound('error.mp3');
                    logMessage('error', `👎 ${p.name} mất ${change} Tiến Độ.`);
                }

                const actionEl = card.querySelector('.chosen-action');
                actionEl.textContent = `Hành động: ${p.chosenAction || 'Không rõ'}`;
                actionEl.className = `chosen-action ${getChoiceClass(p.chosenAction)}`;

                const scoreEl = card.querySelector('.player-score');
                scoreEl.textContent = p.score;
                scoreEl.classList.add(change > 0 ? 'score-up' : 'score-down');
                setTimeout(() => scoreEl.classList.remove('score-up', 'score-down'), 1000);
            }
        });
    });

    socket.on('promptNextRound', () => {
        DOM.game.actionControls.innerHTML = `<button class="skip-button" onclick="handleNextRound()">Đêm Tiếp Theo</button>`;
    });

    // ... (Thêm các trình xử lý sự kiện khác ở đây: gameOver, chaosPhaseStarted, v.v.)
}

// --- VI. CÁC HÀM XỬ LÝ HÀNH ĐỘNG CỦA NGƯỜI DÙNG (USER ACTIONS) ---

// Các hàm này được gọi khi người dùng nhấn vào các nút trên giao diện.
// Tên hàm rõ ràng giúp dễ hiểu chức năng của nút.

function handleCreateRoom() {
    socket.emit('createRoom', { name: DOM.home.nameInput.value });
}

function handleJoinRoom() {
    const code = DOM.home.roomCodeInput.value;
    if (code) {
        socket.emit('joinRoom', { roomCode: code, name: DOM.home.nameInput.value });
    }
}

function handleAddBot() {
    socket.emit('addBot', state.currentRoomCode);
}

function handleStartGame() {
    socket.emit('startGame', state.currentRoomCode);
}

function handlePlayerChoice(choice) {
    playSound('click.mp3');
    DOM.game.actionControls.innerHTML = '<p class="info">Đã hành động... Chờ đợi trong bóng tối...</p>';
    socket.emit('playerChoice', { roomCode: state.currentRoomCode, choice });
}

function handleKickPlayer(playerId) {
    if (confirm("Bạn có chắc muốn trục xuất Thợ Săn này khỏi đoàn?")) {
        socket.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId });
    }
}

function handleNextRound() {
    socket.emit('nextRound', state.currentRoomCode);
}

// --- VII. KHỞI CHẠY ỨNG DỤNG ---

/**
 * Hàm khởi tạo chính, thiết lập các sự kiện ban đầu.
 */
function initialize() {
    // Gắn sự kiện cho các nút ở màn hình chính
    DOM.home.createRoomBtn.addEventListener('click', handleCreateRoom);
    DOM.home.joinRoomBtn.addEventListener('click', handleJoinRoom);
    DOM.room.addBotBtn.addEventListener('click', handleAddBot);
    DOM.room.startGameBtn.addEventListener('click', handleStartGame);

    // Bắt đầu lắng nghe các sự kiện từ server
    setupSocketListeners();
    
    // Mặc định hiển thị màn hình home
    showScreen('home');
}

// Chạy hàm khởi tạo khi trang đã tải xong.
initialize();