// public/client.js (PHIÊN BẢN HOÀN THIỆN CUỐI CÙNG - ĐÃ NÂNG CẤP ÂM THANH)
// ======================================================================

// --- I. TRẠNG THÁI TOÀN CỤC ---
const state = {
    myId: null, currentRoomCode: null, currentHostId: null,
    players: [], gamePhase: 'lobby', myRole: null,
};

// --- II. KHỞI TẠO ---
Network.initialize(state);
UI.loadPlayerName(); // <-- NÂNG CẤP: Tải tên người chơi đã lưu khi vào game
console.log("Client application initialized.");

// --- III. GÁN SỰ KIỆN TĨNH ---

// A. Màn hình chính
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName(); // <-- NÂNG CẤP: Lưu tên người chơi khi tạo phòng
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});
UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName(); // <-- NÂNG CẤP: Lưu tên người chơi khi vào phòng
    const code = UI.homeElements.roomCodeInput.value.trim().toUpperCase();
    if (code) Network.emit('joinRoom', { roomCode: code, name: UI.homeElements.nameInput.value });
    else UI.homeElements.roomCodeInput.focus();
});

// B. Phòng chờ
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('addBot', state.currentRoomCode);
});
UI.roomElements.startGameBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('startGame', state.currentRoomCode);
});


// C. Sách Luật & Chat
document.getElementById('rulebook-btn').addEventListener('click', () => {
    UI.playSound('click');
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
// D. Nút điều khiển nhạc
document.getElementById('music-toggle-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.toggleMusic();
});

// --- IV. LẮNG NGHE SỰ KIỆN TỪ SERVER ---

Network.on('connect', () => {
    // Lưu ID khi kết nối thành công
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
    if(music.paused) {
        music.play().catch(e => console.log("Người dùng cần tương tác để bật nhạc."));
    }
     Object.assign(state, { myId: data.myId, currentRoomCode: data.roomCode, currentHostId: data.hostId, players: data.players });
    UI.showScreen('room');
    UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addCopyToClipboard();
});


Network.on('updatePlayerList', (players, hostId) => {
    Object.assign(state, { players, currentHostId: hostId });
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
});

Network.on('backToLobby', (data) => {
    Object.assign(state, { gamePhase: 'lobby', players: data.players, currentHostId: data.hostId });
    UI.showScreen('room');
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addLogMessage('info', 'Trò chơi kết thúc, trở về phòng chờ.');
});

Network.on('gameStarted', (data) => {
    UI.playSound('success');
    state.gamePhase = 'started';
    UI.showScreen('game');
    UI.addLogMessage('success', 'Cuộc thám hiểm bắt đầu!');
    const rolesList = data.rolesInGame.map(r => r.name).join(', ');
    UI.addLogMessage('info', `<strong>Các vai trò trong đêm nay:</strong> ${rolesList}`);
});

Network.on('decreeRevealed', (data) => {
    UI.playSound('decree');
    UI.displayDecree(data);
});

Network.on('gameOver', (data) => {
    // NÂNG CẤP: Âm thanh thắng/thua riêng biệt
    if (data.winner && data.winner.id === state.myId) {
        UI.playSound('success'); // Bạn thắng
    } else {
        UI.playSound('error'); // Bạn thua hoặc người khác thắng
    }
    state.gamePhase = 'gameover';
    UI.clearTimer();
    UI.showGameOver(data);
});

// Các trình lắng nghe sự kiện khác giữ nguyên
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
Network.on('playerAccused', (data) => {
    UI.playSound('accusation'); // Phát âm thanh Vạch Trần
    UI.applyShakeEffect(data.targetId); // Kích hoạt hiệu ứng rung lắc
});

Network.on('yourRoleIs', (roleData) => {
    state.myRole = roleData;
    UI.displayRole(roleData);
    const skillBtn = document.getElementById('skill-btn');
    if (skillBtn) {
        skillBtn.addEventListener('click', () => {
            UI.playSound('click'); // Thêm âm thanh click cho nút kỹ năng
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

Network.on('newRound', (data) => {
    UI.playSound('new-round'); // <-- NÂNG CẤP: Âm thanh khi có vòng mới
    Object.assign(state, { gamePhase: 'choice', players: data.players });
    UI.gameElements.currentRound.textContent = data.roundNumber;
    UI.updatePlayerCards(state.players, state.myId);
    UI.renderChoiceButtons();
    UI.startTimer(data.duration);
    UI.gameElements.decreeDisplay.style.display = 'none';
});Network.on('gameOver',

Network.on('playerChose', (playerId) => {
    const actionEl = document.getElementById(`action-${playerId}`);
    if (actionEl) actionEl.innerHTML = '✓ Đã chọn';
});

Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.updatePhaseDisplay('Giai Đoạn Phối Hợp', '<p>Chọn một người để đề nghị Phối Hợp.</p>');
    UI.startTimer(data.duration);
    document.body.classList.add('selecting-target');
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleCoordinationTarget() {
            UI.playSound('click');
            Network.emit('requestCoordination', { roomCode: state.currentRoomCode, targetId: card.getAttribute('data-player-id') });
            document.body.classList.remove('selecting-target');
            document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
        });
    });
});

Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.updatePhaseDisplay('Giờ Hoàng Hôn', '<p>Chọn một người để Vạch Trần.</p>');
    UI.startTimer(data.duration);
    document.body.classList.add('selecting-target');
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleAccusationTarget() {
            UI.playSound('click');
            UI.promptForAccusation(card.getAttribute('data-player-id'), card.querySelector('.player-name').textContent);
        });
    });
});

Network.on('chaosActionResolved', (data) => {
    document.body.classList.remove('selecting-target');
    UI.clearTimer();
    UI.addLogMessage('info', `<strong>[Hoàng Hôn]</strong> ${data.message}`);
    document.querySelectorAll('.player-card').forEach(card => card.parentNode.replaceChild(card.cloneNode(true), card));
});

Network.on('roundResult', (data) => {
    Object.assign(state, { gamePhase: 'reveal', players: data.players });
    UI.clearTimer();
    UI.updatePhaseDisplay('Giai Đoạn Phán Xét', '<p>Kết quả đang được công bố...</p>');
    
    // THAY ĐỔI: Gọi hàm renderResults cũ để cập nhật thẻ người chơi
    UI.renderResults(data.results, data.players);
    // SAU ĐÓ, gọi hàm mới để hiển thị bảng tổng kết
    UI.showRoundSummary(data.results, data.finalVoteCounts); 

    if (state.myId === state.currentHostId) {
        // Đặt thời gian chờ lâu hơn một chút để người chơi có thời gian đọc bảng
        setTimeout(() => {
            const nextRoundBtn = document.createElement('button');
            nextRoundBtn.textContent = 'Bắt Đầu Đêm Tiếp Theo';
            nextRoundBtn.addEventListener('click', () => {
                UI.playSound('click');
                Network.emit('nextRound', state.currentRoomCode);
            });
            UI.gameElements.actionControls.innerHTML = '';
            UI.gameElements.actionControls.appendChild(nextRoundBtn);
        }, 6000); // Tăng thời gian chờ
    }
});
Network.on('newMessage', (data) => UI.addChatMessage(data.senderName, data.message));

Network.on('privateInfo', (data) => Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' }));