// public/client.js (PHIÊN BẢN HOÀN CHỈNH - CÓ CHÚ THÍCH CHI TIẾT)
// ======================================================================
// MODULE ĐIỀU KHIỂN CHÍNH CỦA CLIENT ("The Conductor")
// Nhiệm vụ:
// 1. Quản lý trạng thái của người chơi.
// 2. Gán các sự kiện cho các nút bấm trên giao diện.
// 3. Lắng nghe và xử lý tất cả các sự kiện từ server.
// ======================================================================


// --- I. TRẠNG THÁI TOÀN CỤC (GLOBAL STATE) ---
// Ghi chú: Đây là "bộ não" của client, lưu trữ mọi thông tin cần thiết.
// Mọi thay đổi về dữ liệu (như điểm số, người chơi) đều được cập nhật ở đây.
const state = {
    myId: null,             // ID duy nhất của người chơi này, được server cấp
    currentRoomCode: null,  // Mã phòng hiện tại
    currentHostId: null,    // ID của chủ phòng
    players: [],            // Mảng chứa thông tin của tất cả người chơi trong phòng
    gamePhase: 'lobby',     // Trạng thái hiện tại của game (lobby, started, gameover...)
    myRole: null,           // Vai trò của chính người chơi này
    gameHistory: [],
};


// --- II. KHỞI TẠO (INITIALIZATION) ---
// Ghi chú: Đoạn mã này sẽ chạy một lần duy nhất ngay khi file script được tải.
Network.initialize();      // Khởi tạo module Network để kết nối với server.
UI.loadPlayerName();       // Tải tên người chơi đã lưu từ lần trước (nếu có).
console.log("Client application initialized.");


// --- III. GÁN SỰ KIỆN TĨNH CHO CÁC THÀNH PHẦN GIAO DIỆN ---
// Ghi chú: Gán sự kiện "click" cho các nút bấm cố định có trong file index.html.
// Các sự kiện này chỉ cần được gán một lần.

// A. Màn hình chính (Home Screen)
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName(); // Lưu tên người chơi cho các lần chơi sau.
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});

UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName(); // Lưu tên người chơi cho các lần chơi sau.
    const code = UI.homeElements.roomCodeInput.value.trim().toUpperCase();
    if (code) {
        Network.emit('joinRoom', { roomCode: code, name: UI.homeElements.nameInput.value });
    } else {
        UI.homeElements.roomCodeInput.focus(); // Nếu chưa nhập mã, trỏ chuột vào ô.
    }
});

// B. Phòng chờ (Room Screen)
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('addBot', state.currentRoomCode);
});
UI.roomElements.startGameBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('startGame', state.currentRoomCode);
});
UI.roomElements.readyBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('playerReady', state.currentRoomCode);
});

// C. Các nút chức năng chung
document.getElementById('music-toggle-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.toggleMasterMute(); // <-- THAY ĐỔI TỪ toggleMusic() thành toggleMasterMute()
});
    const rulebookHTML = document.getElementById('rulebook-template').innerHTML;
    Swal.fire({
        title: 'Sách Luật Thợ Săn Cổ Vật',
        html: rulebookHTML,
        width: '80%',
        customClass: { container: 'rulebook-modal' },
        background: '#2d3748',
        color: '#e2e8f0',
        confirmButtonText: 'Đã Hiểu'
    });
});

document.getElementById('music-toggle-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.toggleMusic();
});
document.getElementById('history-log-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.showGameHistory(state.gameHistory);
});

document.querySelectorAll('.quick-chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        UI.playSound('click');
        const key = btn.getAttribute('data-key');
        if (key === 'suspect') {
            // Nếu là tin nhắn cần mục tiêu, hiển thị danh sách người chơi
            UI.promptForPlayerTarget('Bạn nghi ngờ ai?', (targetId) => {
                Network.emit('sendQuickChat', { roomCode: state.currentRoomCode, key: 'suspect', targetId: targetId });
            });
        } else {
            Network.emit('sendQuickChat', { roomCode: state.currentRoomCode, key: key });
        }
    });
});

// D. Chức năng Chat
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message && state.currentRoomCode) {
        Network.emit('sendMessage', { roomCode: state.currentRoomCode, message: message });
        chatInput.value = '';
    }
}
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });


// --- IV. LẮNG NGHE VÀ XỬ LÝ SỰ KIỆN TỪ SERVER ---
// Ghi chú: Đây là phần cốt lõi, nơi client nhận lệnh và dữ liệu từ server
// để cập nhật trạng thái và giao diện.

// A. Nhóm sự kiện kết nối và quản lý phòng chờ
Network.on('connect', () => {
    state.myId = Network.socket.id;
});

Network.on('roomError', (msg) => {
    UI.playSound('error');
    Swal.fire({ icon: 'error', title: 'Lỗi', text: msg, background: '#2d3748', color: '#e2e8f0' });
});

Network.on('kicked', () => {
    UI.playSound('error');
    Swal.fire('Bạn đã bị đuổi!').then(() => window.location.reload());
});

Network.on('joinedRoom', (data) => {
    UI.playSound('success');
    const music = document.getElementById('background-music');
    if (music.paused) music.play().catch(e => console.log("Cần tương tác để bật nhạc."));
    Object.assign(state, data);
    UI.showScreen('room');
    UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addCopyToClipboard();
});
Network.on('updatePlayerList', (players, hostId) => {
    Object.assign(state, { players, hostId });
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
});

Network.on('backToLobby', (data) => {
    Object.assign(state, { gamePhase: 'lobby', players: data.players, currentHostId: data.hostId });
    UI.showScreen('room');
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addLogMessage('info', 'Trò chơi kết thúc, trở về phòng chờ.');
});

// B. Nhóm sự kiện luồng game chính
Network.on('gameStarted', (data) => {
    UI.playSound('success');
    state.gamePhase = 'started';
    state.rolesInGame = data.rolesInGame;
    UI.showScreen('game');
    UI.addLogMessage('success', 'Cuộc thám hiểm bắt đầu!');
    const rolesList = data.rolesInGame.map(r => r.name).join(', ');
    UI.addLogMessage('info', `<strong>Các vai trò trong đêm nay:</strong> ${rolesList}`);
});

Network.on('newRound', (data) => {
    UI.showNightTransition(data.roundNumber);
    UI.playSound('new-round');
    setTimeout(() => {
        Object.assign(state, { gamePhase: 'choice', players: data.players });
        UI.gameElements.currentRound.textContent = data.roundNumber;
        UI.updatePlayerCards(state.players, state.myId);
        UI.renderChoiceButtons();
        UI.startTimer(data.duration);
        UI.gameElements.decreeDisplay.style.display = 'none';
    }, 1000);
});

    // 2. Chờ 1 giây để hiệu ứng bắt đầu, sau đó mới cập nhật giao diện bên dưới
    setTimeout(() => {
        Object.assign(state, { gamePhase: 'choice', players: data.players });
        UI.gameElements.currentRound.textContent = data.roundNumber;
        UI.updatePlayerCards(state.players, state.myId);
        UI.renderChoiceButtons();
        UI.startTimer(data.duration);
        UI.gameElements.decreeDisplay.style.display = 'none';
    }, 1000);
});
Network.on('decreeRevealed', (data) => {
    UI.playSound('decree');
    UI.displayDecree(data);
});

Network.on('roundResult', (data) => {
    state.gameHistory.push({ round: state.currentRound, results: data.results, votes: data.finalVoteCounts });
    Object.assign(state, { gamePhase: 'reveal', players: data.players });
    UI.clearTimer();
    UI.updatePhaseDisplay('Giai Đoạn Phán Xét', 'Kết quả đang được công bố...');
    UI.showRoundSummary(data.results, data.finalVoteCounts);
    if (state.myId === state.currentHostId) {
        setTimeout(() => {
            const btn = document.createElement('button');
            btn.textContent = 'Bắt Đầu Đêm Tiếp Theo';
            btn.onclick = () => { UI.playSound('click'); Network.emit('nextRound', state.currentRoomCode); };
            UI.gameElements.actionControls.innerHTML = '';
            UI.gameElements.actionControls.appendChild(btn);
        }, 8000);
    }
});
    // Hiển thị bảng tổng kết chi tiết, hấp dẫn
    UI.showRoundSummary(data.results, data.finalVoteCounts);

    if (state.myId === state.currentHostId) {
        setTimeout(() => {
            const nextRoundBtn = document.createElement('button');
            nextRoundBtn.textContent = 'Bắt Đầu Đêm Tiếp Theo';
            nextRoundBtn.addEventListener('click', () => {
                UI.playSound('click');
                Network.emit('nextRound', state.currentRoomCode);
            });
            UI.gameElements.actionControls.innerHTML = '';
            UI.gameElements.actionControls.appendChild(nextRoundBtn);
        }, 8000);
    }
});

Network.on('gameOver', (data) => {
    if (data.winner && data.winner.id === state.myId) {
        UI.playSound('success'); // Hoặc âm thanh victory.mp3
    } else {
        UI.playSound('error'); // Hoặc âm thanh defeat.mp3
    }
    state.gamePhase = 'gameover';
    UI.clearTimer();
    UI.showGameOver(data);
});


// C. Nhóm sự kiện nhận thông tin cá nhân
Network.on('yourRoleIs', (roleData) => {
    state.myRole = roleData;
    UI.displayRole(roleData);
    
    // Ghi chú: Nút kỹ năng được tạo động, nên ta phải gán sự kiện ngay sau khi nó được tạo ra.
    const skillBtn = document.getElementById('skill-btn');
    if (skillBtn) {
        skillBtn.addEventListener('click', () => {
            UI.playSound('click'); // Âm thanh dùng kỹ năng
            // ... (toàn bộ logic phức tạp xử lý các loại kỹ năng khác nhau)
            const roleId = state.myRole.id;
            const targetBasedRoles = ['PROPHET', 'PEACEMAKER', 'MAGNATE', 'REBEL', 'PRIEST', 'THIEF', 'PHANTOM'];
            if (targetBasedRoles.includes(roleId)) {
                UI.enterTargetSelectionMode(state.myRole.skillName, (targetId) => {
                    Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: { targetId } });
                    UI.updatePhaseDisplay('Đã dùng kỹ năng!', 'Đang chờ những người khác...');
                    skillBtn.disabled = true;
                });
            } else if (roleId === 'MIND_BREAKER') {
                UI.enterTargetSelectionMode(state.myRole.skillName, (targetId) => {
                    UI.promptForMindControlAction((chosenAction) => {
                        Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: { targetId, chosenAction } });
                        UI.updatePhaseDisplay('Đã dùng kỹ năng!', 'Đang chờ những người khác...');
                        skillBtn.disabled = true;
                    });
                });
            } else {
                Swal.fire({ title: `Dùng "${state.myRole.skillName}"?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Xác nhận', background: '#2d3748', color: '#e2e8f0' })
                .then((result) => {
                    if (result.isConfirmed) {
                        Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: {} });
                        skillBtn.disabled = true;
                    }
                });
            }
        });
    }
});

Network.on('privateInfo', (data) => Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' }));

// D. Nhóm sự kiện phản hồi hành động và cập nhật real-time
Network.on('playerChose', (playerId) => {
    const actionEl = document.getElementById(`action-${playerId}`);
    if (actionEl) actionEl.innerHTML = '✓ Đã chọn';
});

Network.on('playerAccused', (data) => {
    UI.playSound('accusation');
    UI.applyShakeEffect(data.targetId);
});

Network.on('chaosActionResolved', (data) => {
    document.body.classList.remove('selecting-target');
    UI.clearTimer();
    UI.addLogMessage('info', `<strong>[Hoàng Hôn]</strong> ${data.message}`);
    document.querySelectorAll('.player-card').forEach(card => card.parentNode.replaceChild(card.cloneNode(true), card));
});

Network.on('coordinationPhaseStarted', (data) => {
    Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.updatePhaseDisplay('Giai Đoạn Thám Hiểm', '<p>Chọn một người để đề nghị Phối Hợp, hoặc chọn hành động một mình.</p>');
    UI.gameElements.skipCoordinationBtn.style.display = 'inline-block'; // Hiện nút
    UI.gameElements.skipCoordinationBtn.disabled = false;
    UI.gameElements.skipCoordinationBtn.textContent = 'Hành động một mình';
    document.body.classList.add('selecting-target');
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleCoordinationTarget() {
           UI.gameElements.skipCoordinationBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('voteSkipCoordination', state.currentRoomCode);
    UI.gameElements.skipCoordinationBtn.disabled = true; // Vô hiệu hóa sau khi bấm
            document.body.classList.remove('selecting-target');
            document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
        });
    });
});

Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.updatePhaseDisplay('Hoàng Hôn', '<p>Chọn một người để Vạch Trần, hoặc chọn nghỉ ngơi.</p>');
    UI.gameElements.skipTwilightBtn.style.display = 'inline-block'; // Hiện nút
    UI.gameElements.skipTwilightBtn.disabled = false;
    UI.gameElements.skipTwilightBtn.textContent = 'Nghỉ ngơi';
    document.body.classList.add('selecting-target');
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleAccusationTarget() {
            UI.gameElements.skipTwilightBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('voteSkipTwilight', state.currentRoomCode);
    UI.gameElements.skipTwilightBtn.disabled = true; // Vô hiệu hóa sau khi bấm
        });
    });
});

Network.on('newMessage', (data) => {
    // UI.playSound('chat_message'); // Có thể thêm âm thanh này
    UI.addChatMessage(data.senderName, data.message);
});

// E. Nhóm sự kiện cho các Tiếng Vọng đặc biệt
Network.on('promptAmnesiaAction', (data) => {
    state.gamePhase = 'amnesia_selection';
    UI.promptForPlayerSwap(data.validTargets, (selection) => {
        Network.emit('submitAmnesiaAction', { 
            roomCode: state.currentRoomCode, 
            player1Id: selection.player1Id, 
            player2Id: selection.player2Id 
        });
        UI.updatePhaseDisplay('Đã hoán đổi!', 'Đang chờ server xử lý...');
    });
});
Network.on('promptArenaPick', (data) => {
    state.gamePhase = 'arena_picking';
    UI.promptForDuelistPick(data.validTargets, (selection) => {
        Network.emit('submitArenaPick', { roomCode: state.currentRoomCode, ...selection });
        UI.updatePhaseDisplay('Đã chọn Đấu Sĩ!', 'Đang chờ các Khán Giả đặt cược...');
    });
});
Network.on('promptArenaBet', (data) => {
    state.gamePhase = 'arena_betting';
    UI.promptForArenaBet(data, (bet) => {
        Network.emit('submitArenaBet', { roomCode: state.currentRoomCode, ...bet });
        UI.updatePhaseDisplay('Đã Đặt Cược!', 'Đang chờ trận đấu diễn ra...');
    });
});
    Network.on('updateSkipVoteCount', (data) => {
    const btn = document.getElementById(data.buttonId);
    if (btn) {
        btn.textContent = `${btn.textContent.split('(')[0].trim()} (${data.count}/${data.total})`;
    }
});
