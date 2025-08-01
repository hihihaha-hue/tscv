//======================================================================
// THỢ SĂN CỔ VẬT - CLIENT LOGIC (FIX LỖI HIỂN THỊ VAI TRÒ CUỐI CÙNG)
//======================================================================

const socket = io();

// --- I. DOM Elements ---
const screens = { home: document.getElementById('home-screen'), room: document.getElementById('room-screen'), game: document.getElementById('game-screen') };
const homeElements = { createRoomBtn: document.getElementById('create-room-btn'), joinRoomBtn: document.getElementById('join-room-btn'), roomCodeInput: document.getElementById('room-code-input'), nameInput: document.getElementById('player-name-input') };
const roomElements = { roomCodeDisplay: document.getElementById('room-code-display'), playerList: document.getElementById('player-list'), hostControls: document.getElementById('host-controls'), addBotBtn: document.getElementById('add-bot-btn'), startGameBtn: document.getElementById('start-game-btn') };
const gameElements = { roundIndicator: document.getElementById('current-round'), decreeDisplay: document.getElementById('decree-display'), playersContainer: document.getElementById('players-container'), phaseTitle: document.getElementById('phase-title'), actionControls: document.getElementById('action-controls'), messageArea: document.getElementById('message-area'), roleDisplay: document.getElementById('role-display') };

// --- II. Client State ---
let state = { myId: null, currentRoomCode: null, currentHostId: null, players: [], gamePhase: null, countdownTimer: null, myRole: null };

// --- III. Helper Functions ---
function showScreen(screenName) { Object.keys(screens).forEach(key => screens[key].style.display = (key === screenName) ? 'block' : 'none'); }
function logMessage(type, message) { const p = document.createElement('p'); p.className = type; p.innerHTML = message; gameElements.messageArea.prepend(p); }
function playSound(soundFile) { try { new Audio(`/assets/sounds/${soundFile}`).play(); } catch (e) { console.warn(`Không thể phát âm thanh: ${soundFile}`); } }
function createModal(title, contentHTML) { const e = document.querySelector('.modal-overlay'); if (e) e.remove(); const m = document.createElement('div'); m.className = 'modal-overlay'; const c = document.createElement('div'); c.className = 'modal-content'; c.innerHTML = `<h2>${title}</h2>${contentHTML}`; m.appendChild(c); document.body.appendChild(m); }
function closeModal() { const e = document.querySelector('.modal-overlay'); if (e) e.remove(); }
function getChoiceClass(choice) { switch (choice) { case 'Giải Mã': return 'loyal-text'; case 'Phá Hoại': return 'corrupt-text'; case 'Quan Sát': return 'blank-text'; default: return 'info'; } }

// --- IV. Render Functions ---
function renderPlayerList() { roomElements.playerList.innerHTML = ''; const isHost = state.myId === state.currentHostId; state.players.forEach(p => { const li = document.createElement('li'); let text = `<span>${p.name}</span>`; let controls = ''; if (p.id === state.myId) text += ' <em>(Bạn)</em>'; if (p.id === state.currentHostId) text += ' <strong class="host-tag">[Trưởng Đoàn]</strong>'; if (p.disconnected) text += ' <span class="disconnected-tag">(Mất tích)</span>'; if (isHost && p.id !== state.myId) { controls = `<button class="kick-btn" onclick="kickPlayer('${p.id}')">Trục Xuất</button>`; } li.innerHTML = `<div>${text}</div><div>${controls}</div>`; if (p.isBot) li.classList.add('bot'); roomElements.playerList.appendChild(li); }); roomElements.hostControls.style.display = isHost ? 'block' : 'none'; if (roomElements.startGameBtn) { roomElements.startGameBtn.disabled = state.players.length < 2; } }
function renderPlayerCards() { gameElements.playersContainer.innerHTML = ''; state.players.forEach(player => { const card = document.createElement('div'); card.className = 'player-card'; card.id = `player-card-${player.id}`; card.innerHTML = `<h3>${player.name}</h3><p>Tiến Độ: <span class="player-score">${player.score}</span></p><div class="chosen-action-wrapper"><p class="chosen-action info">Đang hành động...</p></div>`; if (player.disconnected) card.classList.add('disconnected'); gameElements.playersContainer.appendChild(card); }); }

// --- V. EVENT LISTENERS ---
homeElements.createRoomBtn.addEventListener('click', () => socket.emit('createRoom', { name: homeElements.nameInput.value }));
homeElements.joinRoomBtn.addEventListener('click', () => { const code = homeElements.roomCodeInput.value; if (code) socket.emit('joinRoom', { roomCode: code, name: homeElements.nameInput.value }); });
roomElements.addBotBtn.addEventListener('click', () => socket.emit('addBot', state.currentRoomCode));
roomElements.startGameBtn.addEventListener('click', () => socket.emit('startGame', state.currentRoomCode));

// --- VI. SOCKET.IO EVENT HANDLERS ---
socket.on('connect', () => { state.myId = socket.id; showScreen('home'); });
socket.on('roomError', msg => alert(`Lỗi: ${msg}`));
socket.on('joinedRoom', data => { state.currentRoomCode = data.roomCode; state.currentHostId = data.hostId; state.players = data.players; roomElements.roomCodeDisplay.textContent = state.currentRoomCode; showScreen('room'); renderPlayerList(); });
socket.on('updatePlayerList', (players, hostId) => { state.players = players; state.currentHostId = hostId; renderPlayerList(); });
socket.on('kicked', () => { alert("Bạn đã bị Trưởng Đoàn trục xuất!"); showScreen('home'); });
socket.on('gameStarted', () => { showScreen('game'); gameElements.messageArea.innerHTML = ''; if (gameElements.roleDisplay) gameElements.roleDisplay.style.display = 'none'; });

socket.on('yourRoleIs', (role) => {
    console.log('[CLIENT-DEBUG] Đã nhận được vai trò:', role);
    state.myRole = role;
    const roleDisplay = gameElements.roleDisplay;
    // [SỬA LỖI Ở ĐÂY] - Kiểm tra lại biến cho chắc chắn và thêm log lỗi chi tiết
    if (roleDisplay && role && role.name && role.description) {
        roleDisplay.innerHTML = `
            <h4>Thiên Mệnh Của Bạn</h4>
            <strong>${role.name}</strong>
            <p>${role.description}</p>
        `;
        roleDisplay.style.display = 'block';
    } else {
        console.error("[CLIENT-ERROR] Không thể hiển thị vai trò. Dữ liệu hoặc phần tử HTML bị thiếu.", { receivedRole: role, roleDisplayElement: roleDisplay });
    }
});

socket.on('newRound', data => { state.gamePhase = 'choice'; state.players = data.players; gameElements.roundIndicator.textContent = data.roundNumber; gameElements.phaseTitle.textContent = 'Hành Động Trong Đêm'; gameElements.decreeDisplay.style.display = 'none'; clearInterval(state.countdownTimer); renderPlayerCards(); let phaseHTML = `<div id="timer-display">${data.duration}</div><div id="player-choice-buttons-wrapper"><button class="choice-buttons loyal" onclick="sendPlayerChoice('Giải Mã')">Giải Mã</button><button class="choice-buttons corrupt" onclick="sendPlayerChoice('Phá Hoại')">Phá Hoại</button><button class="choice-buttons blank" onclick="sendPlayerChoice('Quan Sát')">Quan Sát</button></div>`; gameElements.actionControls.innerHTML = phaseHTML; logMessage('info', `--- Đêm thứ ${data.roundNumber} bắt đầu! ---`); let t = data.duration; state.countdownTimer = setInterval(() => { t--; const timerEl = document.getElementById('timer-display'); if (timerEl) timerEl.textContent = t >= 0 ? t : 0; if (t < 0) clearInterval(state.countdownTimer); }, 1000); });
socket.on('playerChose', playerId => { const card = document.getElementById(`player-card-${playerId}`); if (card) { const a = card.querySelector('.chosen-action'); a.textContent = '✅ Đã hành động'; a.className = 'chosen-action info'; } });
socket.on('decreeRevealed', data => { playSound('decree.mp3'); let decreeHTML = `<h3>📜 Tiếng Vọng Của Đền Thờ 📜</h3>`; data.decrees.forEach(decree => { decreeHTML += `<div class="decree-item"><p class="decree-title warning">${decree.name}</p><p class="decree-description">${decree.description}</p></div>`; }); gameElements.decreeDisplay.innerHTML = decreeHTML; gameElements.decreeDisplay.style.display = 'block'; logMessage('warning', `📜 **${data.drawerName}** đã nghe thấy một Tiếng Vọng!`); });
socket.on('chaosPhaseStarted', data => { state.gamePhase = 'chaos'; gameElements.phaseTitle.textContent = "Giờ Hoàng Hôn"; const totalPlayers = state.players.filter(p => !p.disconnected).length; let h = `<div id="timer-display">${data.duration}</div><div class="chaos-actions"><button onclick="showTargetSelection('Vạch Trần')">Vạch Trần</button><button onclick="showTargetSelection('Phối Hợp')">Phối Hợp</button></div><button id="skip-chaos-btn" class="skip-button" onclick="voteToSkipChaos()">Nghỉ Ngơi <span id="skip-vote-count">(0/${totalPlayers})</span></button>`; gameElements.actionControls.innerHTML = h; let t = data.duration; clearInterval(state.countdownTimer); state.countdownTimer = setInterval(() => { t--; const timerEl = document.getElementById('timer-display'); if (timerEl) timerEl.textContent = t >= 0 ? t : 0; if (t < 0) clearInterval(state.countdownTimer); }, 1000); });
socket.on('chaosActionResolved', data => { state.gamePhase = 'reveal_pending'; clearInterval(state.countdownTimer); gameElements.actionControls.innerHTML = ''; gameElements.phaseTitle.textContent = "Bình minh lên..."; logMessage('warning', data.message); closeModal(); });
socket.on('updateSkipVoteCount', (count, total) => { const countEl = document.getElementById('skip-vote-count'); if(countEl) countEl.textContent = `(${count}/${total})`; });
socket.on('updateScores', updatedPlayers => { updatedPlayers.forEach(p => { const scoreEl = document.querySelector(`#player-card-${p.id} .player-score`); if (scoreEl) scoreEl.textContent = p.score; }); });
socket.on('roundResult', data => { state.gamePhase = 'reveal'; gameElements.phaseTitle.textContent = 'Kết Quả Đêm'; gameElements.actionControls.innerHTML = ''; const { finalVoteCounts: counts } = data; logMessage('info', `Kết quả: ${counts['Giải Mã'] || 0} Giải Mã, ${counts['Phá Hoại'] || 0} Phá Hoại, ${counts['Quan Sát'] || 0} Quan Sát.`); data.results.messages.forEach(msg => logMessage('info', msg)); data.players.forEach(p => { const card = document.getElementById(`player-card-${p.id}`); if (card) { const change = data.results.scoreChanges[p.id] || 0; if (change > 0) { playSound('success.mp3'); logMessage('success', `👍 ${p.name} nhận được +${change} Tiến Độ.`); } else if (change < 0) { playSound('error.mp3'); logMessage('error', `👎 ${p.name} mất ${change} Tiến Độ.`); } const a = card.querySelector('.chosen-action'); a.textContent = `Hành động: ${p.chosenAction || 'Không rõ'}`; a.className = `chosen-action ${getChoiceClass(p.chosenAction)}`; const s = card.querySelector('.player-score'); s.textContent = p.score; s.classList.add(change > 0 ? 'score-up' : 'score-down'); setTimeout(() => s.classList.remove('score-up', 'score-down'), 1000); } }); });
socket.on('promptNextRound', () => { gameElements.actionControls.innerHTML = `<button class="skip-button" onclick="socket.emit('nextRound', state.currentRoomCode)">Đêm Tiếp Theo</button>`; });
socket.on('gameOver', data => { state.gamePhase = 'gameover'; gameElements.phaseTitle.textContent = '🏆 CUỘC THÁM HIỂM KẾT THÚC 🏆'; gameElements.actionControls.innerHTML = ''; let message = ''; if (data.winner) { let reasonText = `đã tìm thấy Cổ Vật với ${data.winner.score} Tiến Độ!`; if (data.winner.reason) reasonText = data.winner.reason; message = `🎉 **${data.winner.name}** ${reasonText} 🎉`; } else if (data.loser) { message = `☠️ **${data.loser.name}** đã bị Lời Nguyền nuốt chửng! ☠️`; } logMessage('warning', message); let finalHTML = `<h2 class="warning">${message}</h2>`; if (state.myId === state.currentHostId) { finalHTML += `<button class="skip-button" onclick="socket.emit('playAgain', state.currentRoomCode)">Thám Hiểm Lần Nữa</button>`; } else { finalHTML += `<p class="info">Đang chờ Trưởng Đoàn bắt đầu cuộc thám hiểm mới...</p>`; } gameElements.actionControls.innerHTML = finalHTML; });
socket.on('actionsSwapped', data => logMessage('warning', data.message));
socket.on('promptAmnesiaAction', data => { let c = '<h4>Chọn 2 Thợ Săn để yểm bùa:</h4><div class="player-selection-grid">'; data.players.forEach(p => c += `<button id="amnesia-target-${p.id}" onclick="selectAmnesiaTarget('${p.id}')">${p.name}</button>`); c += '</div><p id="amnesia-status">Đã chọn: (Chưa ai)</p><button id="amnesia-confirm-btn" disabled>Xác nhận</button>'; createModal("Bùa Lú Lẫn", c); });
socket.on('playerDisconnected', data => { logMessage('error', `Thợ săn ${data.newName} đã mất tích trong đền thờ.`); const c = document.getElementById(`player-card-${data.playerId}`); if (c) { c.querySelector('h3').textContent = data.newName; c.classList.add('disconnected'); } });

// --- VII. Functions Called by Inline JS ---
function sendPlayerChoice(choice) { playSound('click.mp3'); gameElements.actionControls.innerHTML = '<p class="info">Đã hành động... Chờ đợi trong bóng tối...</p>'; socket.emit('playerChoice', { roomCode: state.currentRoomCode, choice }); }
function showTargetSelection(actionType) { playSound('click.mp3'); let t = actionType === 'Vạch Trần' ? 'Vạch Trần Ai?' : 'Phối Hợp Với Ai?'; let c = '<div class="player-selection-grid">'; state.players.forEach(p => { if (p.id !== state.myId && !p.disconnected) c += `<button onclick="requestChaosAction('${p.id}', '${actionType}')">${p.name}</button>`; }); c += '</div>'; createModal(t, c); }
function requestChaosAction(targetId, actionType) { playSound('click.mp3'); if (actionType === 'Vạch Trần') { let g = `<p>Bạn vạch trần <strong>${state.players.find(p=>p.id===targetId).name}</strong>. Hành động của họ là:</p><button class="choice-buttons loyal" onclick="submitChallengeGuess('${targetId}', 'Giải Mã')">Giải Mã</button><button class="choice-buttons corrupt" onclick="submitChallengeGuess('${targetId}', 'Phá Hoại')">Phá Hoại</button><button class="choice-buttons blank" onclick="submitChallengeGuess('${targetId}', 'Quan Sát')">Quan Sát</button>`; createModal("Đưa Ra Cáo Buộc", g); } else { socket.emit('requestChaosAction', { roomCode: state.currentRoomCode, targetId, actionType: 'Phối Hợp' }); closeModal(); } }
function submitChallengeGuess(targetId, guess) { playSound('click.mp3'); socket.emit('requestChaosAction', { roomCode: state.currentRoomCode, targetId, actionType: 'Vạch Trần', guess }); closeModal(); }
function voteToSkipChaos() { playSound('click.mp3'); socket.emit('playerVotedToSkip', state.currentRoomCode); const b = document.getElementById('skip-chaos-btn'); if (b) { b.disabled = true; b.textContent = 'Đã bỏ phiếu...'; } }
function kickPlayer(playerId) { if (confirm("Bạn có chắc muốn trục xuất Thợ Săn này khỏi đoàn?")) socket.emit('kickPlayer', { roomCode: state.currentRoomCode, playerId }); }
function selectAmnesiaTarget(playerId) { playSound('click.mp3'); if (!window.specialSelection) window.specialSelection = []; const i = window.specialSelection.indexOf(playerId); if (i > -1) { window.specialSelection.splice(i, 1); document.getElementById(`amnesia-target-${playerId}`).classList.remove('selected'); } else if (window.specialSelection.length < 2) { window.specialSelection.push(playerId); document.getElementById(`amnesia-target-${playerId}`).classList.add('selected'); } document.getElementById('amnesia-status').textContent = `Đã chọn: ${window.specialSelection.map(id => state.players.find(p=>p.id===id).name).join(', ') || '(Chưa ai)'}`; const b = document.getElementById('amnesia-confirm-btn'); b.disabled = window.specialSelection.length !== 2; b.onclick = () => { socket.emit('amnesiaAction', { roomCode: state.currentRoomCode, player1Id: window.specialSelection[0], player2Id: window.specialSelection[1] }); closeModal(); delete window.specialSelection; }; }