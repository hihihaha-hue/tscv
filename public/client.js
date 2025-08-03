// ======================================================================
// MODULE ĐIỀU KHIỂN CHÍNH CỦA CLIENT ("The Conductor")
// PHIÊN BẢN HOÀN CHỈNH - ĐÃ SỬA LỖI CÚ PHÁP
// ======================================================================

// --- I. TRẠNG THÁI TOÀN CỤC (GLOBAL STATE) ---
const state = {
    myId: null,
    currentRoomCode: null,
    currentHostId: null,
    players: [],
    gamePhase: 'lobby',
    myRole: null,
    rolesInGame: [],
    gameHistory: [],
};

// --- II. KHỞI TẠO (INITIALIZATION) ---
Network.initialize();
UI.loadPlayerName();
UI.initEventListeners();
if (UI.gameElements.nextDayBtn) {
    UI.gameElements.nextDayBtn.addEventListener('click', () => {
        if (state.myId === state.currentHostId) {
            UI.playSound('click');
            Network.emit('nextRound', state.currentRoomCode);
        }
    });
}
console.log("Client application initialized.");

// --- III. SỰ KIỆN UI ---
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
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');
    if (!state.currentRoomCode) return;
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
document.getElementById('music-toggle-btn').addEventListener('click', () => {
    UI.playSound('click');
    UI.toggleMasterMute();
});

document.getElementById('rulebook-btn').addEventListener('click', () => {
    UI.playSound('click');
    const fullRulebookHTML = document.getElementById('rulebook-template').innerHTML;
    let finalHTML;
    if (state.gamePhase !== 'lobby' && state.rolesInGame && state.rolesInGame.length > 0) {
        const rolesInGameHTML = `
            <div class="rulebook-section">
                <h3>Các Vai Trò Trong Trận Này</h3>
                ${state.rolesInGame.map(role => `
                    <details class="role-details" open>
                        <summary>${role.name}</summary>
                        <div class="role-description-content">
                            <p><strong>Thiên Mệnh:</strong> ${role.description.win}</p>
                            <p><strong>Nội Tại:</strong> ${role.description.passive}</p>
                            <p><strong>Kỹ Năng:</strong> ${role.description.skill}</p>
                        </div>
                    </details>
                `).join('')}
            </div>
            <hr>
        `;
        finalHTML = rolesInGameHTML + fullRulebookHTML;
    } else {
        finalHTML = fullRulebookHTML;
    }
    Swal.fire({
        title: 'Sách Luật Thợ Săn Cổ Vật',
        html: finalHTML,
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
        Network.emit('sendQuickChat', { roomCode: state.currentRoomCode, key: key });
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

// --- IV. SỰ KIỆN TỪ SERVER ---
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
    state.rolesInGame = [];
    state.players = data.players;
    state.currentHostId = data.hostId;
    UI.showScreen('room');
    UI.updatePlayerList(state.players, state.currentHostId, state.myId);
    UI.addLogMessage('Trò chơi kết thúc, trở về phòng chờ.', 'info');
});
Network.on('gameStarted', (data) => {
    UI.playSound('success');
    state.gamePhase = 'started';
    state.rolesInGame = data.rolesInGame;
    UI.showScreen('game');
    UI.addLogMessage('Cuộc thám hiểm bắt đầu!', 'success');
    UI.displayRolesInGame(data.rolesInGame);
    
    // Cập nhật giao diện ban đầu
    UI.updatePlayerCards(state.players, state.myId);
    UI.updateLeaderboard(state.players);
});
Network.on('newRound', (data) => {
    UI.showNightTransition(data.roundNumber);
    UI.playSound('new-round');
    setTimeout(() => {
        state.gamePhase = 'choice';
        state.players = data.players;
        
        // Cập nhật giao diện cho vòng mới
        UI.updatePlayerCards(state.players, state.myId);
        UI.updateLeaderboard(state.players);
        
        UI.setupPhaseUI('choice');
        UI.startTimer(data.duration);
        if (UI.gameElements.decreeDisplay) UI.gameElements.decreeDisplay.style.display = 'none';
    }, 2500);
});
Network.on('decreeRevealed', (data) => {
    UI.playSound('decree');
    UI.displayDecree(data);
});

Network.on('roundResult', (data) => {
    state.gameHistory.push({ round: data.roundNumber, results: data.results, votes: data.finalVoteCounts });
    state.gamePhase = 'reveal';
    state.players = data.players; // Cập nhật state với điểm số mới
    UI.clearTimer();
    
    UI.setupPhaseUI('reveal');
    UI.showRoundSummary(data.results, data.finalVoteCounts);

    // Cập nhật bảng xếp hạng với điểm số mới
    UI.updateLeaderboard(state.players);

    setTimeout(() => {
        UI.setupPhaseUI('end_of_round', { isHost: state.myId === state.currentHostId });
    }, 6000);
});

Network.on('gameOver', (data) => {
    UI.playSound(data.winner ? 'success' : 'error');
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
            const targetBasedRoles = ['PROPHET', 'PEACEMAKER', 'MAGNATE', 'REBEL', 'PRIEST', 'THIEF', 'PHANTOM', 'MIMIC'];
            if (targetBasedRoles.includes(roleId)) {
                UI.enterTargetSelectionMode(state.myRole.skillName, (targetId) => {
                    Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: { targetId } });
                    UI.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng' });
                });
            } else if (roleId === 'MIND_BREAKER') {
                UI.enterTargetSelectionMode(state.myRole.skillName, (targetId) => {
                    UI.promptForMindControlAction((chosenAction) => {
                        Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: { targetId, chosenAction } });
                        UI.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng' });
                    });
                });
            } else {
                Swal.fire({
                    title: `Dùng "${state.myRole.skillName}"?`,
                    icon: 'question', showCancelButton: true, confirmButtonText: 'Xác nhận',
                    background: '#2d3748', color: '#e2e8f0'
                }).then((result) => {
                    if (result.isConfirmed) {
                        Network.emit('useRoleSkill', { roomCode: state.currentRoomCode, payload: {} });
                        UI.setupPhaseUI('wait', { title: 'Đã Dùng Kỹ Năng' });
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
    UI.addLogMessage(`<strong>[Hoàng Hôn]</strong> ${data.message}`, 'info');
    document.querySelectorAll('.player-card').forEach(card => card.parentNode.replaceChild(card.cloneNode(true), card));
});
Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.setupPhaseUI('coordination');
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);
    const handleCoordinationTarget = function () {
        const targetId = this.getAttribute('data-player-id');
        Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
        UI.setupPhaseUI('wait', { title: 'Đã Phối Hợp!', description: '<p>Đang chờ kết quả...</p>' });
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    };
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', handleCoordinationTarget, { once: true });
    });
    UI.gameElements.skipCoordinationBtn.addEventListener('click', () => {
        UI.playSound('click');
        Network.emit('voteSkipCoordination', state.currentRoomCode);
        UI.setupPhaseUI('wait');
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    }, { once: true });
});
Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.setupPhaseUI('twilight');
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);
    const handleAccusationTarget = function () {
        const targetId = this.getAttribute('data-player-id');
        UI.promptForAccusation(targetId, this.querySelector('.player-name').textContent);
        UI.setupPhaseUI('wait', { title: 'Đã Vạch Trần!', description: '<p>Đang chờ kết quả...</p>' });
        document.body.classList.remove('selecting-target');
        document.querySelectorAll('.player-card').forEach(c => c.parentNode.replaceChild(c.cloneNode(true), c));
    };
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', handleAccusationTarget, { once: true });
    });
    UI.gameElements.skipTwilightBtn.addEventListener('click', () => {
        UI.playSound('click');
        Network.emit('voteSkipTwilight', state.currentRoomCode);
        UI.setupPhaseUI('wait');
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
        Network.emit('submitAmnesiaAction', { roomCode: state.currentRoomCode, ...selection });
        UI.setupPhaseUI('wait', { title: 'Đã Hoán Đổi' });
    });
});
Network.on('promptArenaPick', (data) => {
    state.gamePhase = 'arena_picking';
    UI.promptForDuelistPick(data.validTargets, (selection) => {
        Network.emit('submitArenaPick', { roomCode: state.currentRoomCode, ...selection });
        UI.setupPhaseUI('wait', { title: 'Đã Chọn Đấu Sĩ' });
    });
});
Network.on('promptArenaBet', (data) => {
    state.gamePhase = 'arena_betting';
    UI.promptForArenaBet(data, (bet) => {
        Network.emit('submitArenaBet', { roomCode: state.currentRoomCode, ...bet });
        UI.setupPhaseUI('wait', { title: 'Đã Đặt Cược' });
    });
});
Network.on('updateSkipVoteCount', (data) => {
    const btn = document.getElementById(data.buttonId);
    if (btn) {
        let baseText = btn.textContent.split('(')[0].trim();
        if (baseText.includes('một mình')) baseText = 'Hành động một mình';
        if (baseText.includes('ngơi')) baseText = 'Nghỉ ngơi';
        btn.textContent = `${baseText} (${data.count}/${data.total})`;
    }
});