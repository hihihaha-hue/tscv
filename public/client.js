// ======================================================================
// MODULE ĐIỀU KHIỂN CHÍNH CỦA CLIENT ("The Conductor")
// PHIÊN BẢN HOÀN CHỈNH VÀ ĐÃ SỬA LỖI CÚ PHÁP
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
        if (key === 'suspect') {
            UI.promptForPlayerTarget('Bạn nghi ngờ ai?', (targetId) => {
                Network.emit('sendQuickChat', { roomCode: state.currentRoomCode, key: 'suspect', targetId: targetId });
            });
        } else {
            Network.emit('sendQuickChat', { roomCode: state.currentRoomCode, key: key });
        }
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
    if (UI.roomElements.roomCodeDisplay) {
        UI.roomElements.roomCodeDisplay.textContent = state.currentRoomCode;
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
    }, 2500);
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
            UI.showNextDayButton(() => {
                Network.emit('nextRound', state.currentRoomCode);
            });
        }, 5000);
    }
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
    UI.addLogMessage(`<strong>[Hoàng Hôn]</strong> ${data.message}`, 'info');
    document.querySelectorAll('.player-card').forEach(card => card.parentNode.replaceChild(card.cloneNode(true), card));
});
Network.on('coordinationPhaseStarted', (data) => {
    state.gamePhase = 'coordination';
    UI.updatePhaseDisplay('Giai Đoạn Thám Hiểm', '<p>Chọn một người để đề nghị Phối Hợp, hoặc chọn hành động một mình.</p>');
    UI.gameElements.skipCoordinationBtn.style.display = 'inline-block';
    UI.gameElements.skipCoordinationBtn.disabled = false;
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleCoordinationTarget() {
            const targetId = this.getAttribute('data-player-id');
            Network.emit('voteCoordination', { roomCode: state.currentRoomCode, targetId });
            UI.gameElements.skipCoordinationBtn.disabled = true;
            document.body.classList.remove('selecting-target');
            document.querySelectorAll('.player-card').forEach(c => c.removeEventListener('click', handleCoordinationTarget));
        }, { once: true });
    });
    UI.gameElements.skipCoordinationBtn.addEventListener('click', function handleSkip() {
        UI.playSound('click');
        Network.emit('voteSkipCoordination', state.currentRoomCode);
        UI.gameElements.skipCoordinationBtn.disabled = true;
        document.body.classList.remove('selecting-target');
    }, { once: true });
});
Network.on('twilightPhaseStarted', (data) => {
    state.gamePhase = 'twilight';
    UI.updatePhaseDisplay('Hoàng Hôn', '<p>Chọn một người để Vạch Trần, hoặc chọn nghỉ ngơi.</p>');
    UI.gameElements.skipTwilightBtn.style.display = 'inline-block';
    UI.gameElements.skipTwilightBtn.disabled = false;
    document.body.classList.add('selecting-target');
    UI.startTimer(data.duration);
    document.querySelectorAll('.player-card:not(.is-self):not(.disconnected)').forEach(card => {
        card.addEventListener('click', function handleAccusationTarget() {
            const targetId = this.getAttribute('data-player-id');
            UI.promptForAccusation(targetId, this.querySelector('.player-name').textContent);
            UI.gameElements.skipTwilightBtn.disabled = true;
            document.body.classList.remove('selecting-target');
            document.querySelectorAll('.player-card').forEach(c => c.removeEventListener('click', handleAccusationTarget));
        }, { once: true });
    });
    UI.gameElements.skipTwilightBtn.addEventListener('click', function handleSkip() {
        UI.playSound('click');
        Network.emit('voteSkipTwilight', state.currentRoomCode);
        UI.gameElements.skipTwilightBtn.disabled = true;
        document.body.classList.remove('selecting-target');
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
        let baseText = btn.textContent.split('(')[0].trim();
        if (baseText.includes('một mình')) baseText = 'Hành động một mình';
        if (baseText.includes('ngơi')) baseText = 'Nghỉ ngơi';
        btn.textContent = `${baseText} (${data.count}/${data.total})`;
    }
});