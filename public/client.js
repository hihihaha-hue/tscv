// ======================================================================
// MODULE ĐIỀU KHIỂN CHÍNH CỦA CLIENT ("The Conductor")
// Nhiệm vụ:
// 1. Quản lý trạng thái của người chơi.
// 2. Gán các sự kiện cho các nút bấm trên giao diện.
// 3. Lắng nghe và xử lý tất cả các sự kiện từ server.
// ======================================================================

// --- I. TRẠNG THÁI TOÀN CỤC (GLOBAL STATE) ---
const state = {
    myId: null,
    currentRoomCode: null,
    currentHostId: null,
    players: [],
    gamePhase: 'lobby',
    myRole: null,
    gameHistory: [],
};

// --- II. KHỞI TẠO (INITIALIZATION) ---
Network.initialize();
UI.loadPlayerName();
console.log("Client application initialized.");

// --- III. GÁN SỰ KIỆN TĨNH CHO CÁC THÀNH PHẦN GIAO DIỆN ---
// A. Màn hình chính (Home Screen)
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName();
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});

UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    UI.savePlayerName();
    const code = UI.homeElements.roomCodeInput.value.trim().toUpperCase();
    if (code) {
        Network.emit('joinRoom', { roomCode: code, name: UI.homeElements.nameInput.value });
    } else {
        UI.homeElements.roomCodeInput.focus();
    }
});

// B. Phòng chờ (Room Screen)
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');
    if (!state.currentRoomCode) {
        Swal.fire('Không có mã phòng!');
        return;
    }
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
    UI.toggleMasterMute();
});
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
document.getElementById('history-log-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.showGameHistory(state.gameHistory);
});

document.querySelectorAll('.quick-chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        UI.playSound('click');
        const key = btn.getAttribute('data-key');
        if (key === 'suspect') {
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
    state.currentRoomCode = data.roomCode;
    state.currentHostId = data.hostId;
    state.myId = data.myId;
    state.players = data.players;
    UI.showScreen('room');
    if (UI.roomElements.roomCodeDisplay) {
        UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
    } else {
        console.error('Không tìm thấy phần tử roomCodeDisplay!');
    }
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addCopyToClipboard();
});

Network.on('updatePlayerList', (players, hostId) => {
    state.players = players;
    state.currentHostId = hostId;
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
});

Network.on('backToLobby', (data) => {
    state.gamePhase = 'lobby';
    state.players = data.players;
    state.currentHostId = data.hostId;
    UI.showScreen('room');
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addLogMessage('info', 'Trò chơi kết thúc, trở về phòng chờ.');
});

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
        state.gamePhase = 'choice';
        state.players = data.players;
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
    state.gameHistory.push({ round: data.roundNumber, results: data.results, votes: data.finalVoteCounts });
    state.gamePhase = 'reveal';
    state.players = data.players;
    UI.clearTimer();
    UI.updatePhaseDisplay('Giai Đoạn Phán Xét', 'Kết quả đang được công bố...');
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
        UI.playSound('success');
    } else {
        UI.playSound('error');
    }
    state.gamePhase = 'gameover';
    UI.clearTimer();
    UI.showGameOver(data);
});

Network.on('yourRoleIs', (roleData) => {
    state.myRole = roleData;
    UI.displayRole(roleData);

    const skillBtn = document.getElementById('skill-btn');
    if (skillBtn) {
        skillBtn.addEventListener('click', () => {
            UI.playSound('click');
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

Network.on('privateInfo', (data) => {
    Swal.fire({ title: data.title, html: data.text, icon: 'info', background: '#2d3748', color: '#e2e8f0' });
});

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
    state.gamePhase = 'coordination';
    UI.updatePhaseDisplay('Giai Đoạn Thám Hiểm', '<p>Chọn một người để đề nghị Phối Hợp, hoặc chọn hành động một mình.</p>');
    UI.gameElements.skipCoordinationBtn.style.display = 'inline-block';
    UI.gameElements.skipCoordinationBtn.disabled = false;
    if (!UI.gameElements.actionControls.contains(UI.gameElements.skipCoordinationBtn)) {
        UI.gameElements.actionControls.appendChild(UI.gameElements.skipCoordinationBtn);
    }
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);

    const handleCoordinationTarget = function () {
        const targetId = this.getAttribute('data-player-id');
        Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
        UI.gameElements.skipCoordinationBtn.disabled = true;
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    };
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', handleCoordinationTarget, { once: true });
    });

    UI.gameElements.skipCoordinationBtn.addEventListener('click', () => {
        UI.playSound('click');
        Network.emit('voteSkipCoordination', state.currentRoomCode);
        UI.gameElements.skipCoordinationBtn.disabled = true;
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    }, { once: true });
});

Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.updatePhaseDisplay('Hoàng Hôn', '<p>Chọn một người để Vạch Trần, hoặc chọn nghỉ ngơi.</p>');
    UI.gameElements.skipTwilightBtn.style.display = 'inline-block';
    UI.gameElements.skipTwilightBtn.disabled = false;
    if (!UI.gameElements.actionControls.contains(UI.gameElements.skipTwilightBtn)) {
        UI.gameElements.actionControls.appendChild(UI.gameElements.skipTwilightBtn);
    }
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);

    const handleAccusationTarget = function () {
        const targetId = this.getAttribute('data-player-id');
        UI.promptForAccusation(targetId, this.querySelector('.player-name').textContent);
        UI.gameElements.skipTwilightBtn.disabled = true;
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    };
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', handleAccusationTarget, { once: true });
    });

    UI.gameElements.skipTwilightBtn.addEventListener('click', () => {
        UI.playSound('click');
        Network.emit('voteSkipTwilight', state.currentRoomCode);
        UI.gameElements.skipTwilightBtn.disabled = true;
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    }, { once: true });
});

Network.on('newMessage', (data) => {
    UI.addChatMessage(data.senderName, data.message);
});

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