// game/socketHandler.js
// ======================================================================
// SOCKET EVENT HANDLER ("The Nervous System") - Phiên bản Gameplay Hoàn Chỉnh
// Nhiệm vụ: Lắng nghe các sự kiện từ client và gọi các hàm logic tương ứng.
// ======================================================================

const gameLogic = require('./logic.js');
const { ROLES } = require('./config.js');

/**
 * Khởi tạo tất cả các trình lắng nghe sự kiện socket.
 * @param {Server} io - Instance của Socket.IO Server.
 * @param {Object} rooms - Object lưu trữ trạng thái của tất cả các phòng chơi.
 */
function initialize(io, rooms) {
    io.on('connection', (socket) => {
          
	     socket.on('sendMessage', (data) => {
        const room = rooms[data.roomCode];
        const player = room?.players.find(p => p.id === socket.id);
        if (room && player) {
            // Phát lại tin nhắn cho tất cả mọi người trong phòng
            io.to(data.roomCode).emit('newMessage', {
                senderName: player.name,
                message: data.message.substring(0, 200) // Giới hạn độ dài tin nhắn
            });
        }
    });
        // --- HÀM NỘI BỘ (HELPER) ---
        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) return socket.emit('roomError', `Phòng '${code}' không tồn tại!`);
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');
            
            const newPlayer = { id: socket.id, name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(), isBot: false };
            room.players.push(newPlayer);
            socket.join(code);
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
            socket.emit('joinedRoom', { roomCode: code, hostId: room.hostId, myId: socket.id, players: room.players });
        }

        // --- LẮNG NGHE SỰ KIỆN TỪ CLIENT ---

        // 1. Quản lý phòng chờ (Lobby)
        socket.on('createRoom', data => {
            let code;
            do { code = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (rooms[code]);
            rooms[code] = { players: [], hostId: socket.id, maxPlayers: 12, gameState: null };
            handleJoinRoom(code, data.name);
        });

        socket.on('joinRoom', data => handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name));

        socket.on('addBot', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length < room.maxPlayers) {
                const personalities = ['aggressive', 'cautious', 'random'];
                const botPlayer = { id: `bot-${Date.now()}`, name: `Thợ Săn AI ${room.players.length + 1}`, isBot: true, personality: personalities[Math.floor(Math.random() * personalities.length)] };
                room.players.push(botPlayer);
                io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });

        socket.on('kickPlayer', (data) => {
            const room = rooms[data.roomCode];
            if (room && socket.id === room.hostId) {
                const targetSocket = io.sockets.sockets.get(data.playerId);
                if (targetSocket) {
                    targetSocket.emit('kicked');
                    targetSocket.leave(data.roomCode);
                }
                room.players = room.players.filter(p => p.id !== data.playerId);
                io.to(data.roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });
        
        socket.on('changeName', data => {
            const player = rooms[data.roomCode]?.players.find(p => p.id === socket.id);
            if (player) {
                player.name = data.newName.substring(0, 15).trim() || player.name;
                io.to(data.roomCode).emit('updatePlayerList', rooms[data.roomCode].players, rooms[data.roomCode].hostId);
            }
        });

        // 2. Bắt đầu và Chơi lại Game
        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length >= 2) {
                room.gameState = gameLogic.createGameState(room.players);
                
                // Gửi vai trò và thông tin đặc biệt cho từng người chơi
                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        // Gửi thông tin riêng cho Sát Thủ
                        if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) {
                                roleData.description += ` **Mục tiêu** của bạn là: <strong>${target.name}</strong>.`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });
    
                io.to(roomCode).emit('gameStarted', {
                    rolesInGame: room.gameState.rolesInGame.map(roleId => ({ id: roleId, name: ROLES[roleId].name }))
                });
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        socket.on('playAgain', (roomCode) => {
             const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase === 'gameover') {
                 // Logic tương tự startGame
                 room.gameState = gameLogic.createGameState(room.players);
                 room.gameState.players.forEach(p => {
                     if (!p.isBot) {
                         const roleData = { ...ROLES[p.roleId], id: p.roleId };
                         if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) { roleData.description += ` **Mục tiêu** của bạn là: <strong>${target.name}</strong>.`; }
                         }
                         io.to(p.id).emit('yourRoleIs', roleData);
                     }
                 });
                 io.to(roomCode).emit('gameStarted', { rolesInGame: room.gameState.rolesInGame.map(roleId => ({ id: roleId, name: ROLES[roleId].name })) });
                 gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // 3. Hành động trong game
        socket.on('playerChoice', data => gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io));
        socket.on('requestChaosAction', data => gameLogic.handleChaosAction(data.roomCode, socket.id, data.targetId, data.actionType, data.guess, rooms, io));
        socket.on('useRoleSkill', data => gameLogic.handleUseSkill(socket, data.roomCode, data.payload, rooms, io));

        // 4. Các sự kiện tương tác đặc biệt
        socket.on('amnesiaAction', data => {
            const gs = rooms[data.roomCode]?.gameState;
            if (!gs || gs.phase !== 'special_action' || socket.id !== gs.roundData.drawerId) return;
            const p1 = gs.players.find(p => p.id === data.player1Id);
            const p2 = gs.players.find(p => p.id === data.player2Id);
            if (p1 && p2) {
                [p1.chosenAction, p2.chosenAction] = [p2.chosenAction, p1.chosenAction];
                io.to(data.roomCode).emit('logMessage', { type: 'warning', message: `🧠 Hành động của **${p1.name}** và **${p2.name}** đã bị hoán đổi!` });
            }
            gameLogic.startChaosPhase(data.roomCode, rooms, io);
        });

        socket.on('mindControlAction', data => {
            const gs = rooms[data.roomCode]?.gameState;
            if (!gs) return;
            const mindBreaker = gs.players.find(p => p.id === socket.id && p.roleId === 'MIND_BREAKER');
            const target = gs.players.find(p => p.id === data.targetId);
            if (mindBreaker && target) {
                target.chosenAction = data.chosenAction;
                io.to(data.roomCode).emit('logMessage', { type: 'warning', message: `🧠 Một thế lực vô hình đã điều khiển hành động của **${target.name}**.` });
                io.to(data.roomCode).emit('playerChose', data.targetId);
            }
        });

        socket.on('playerVotedToSkip', (roomCode) => {
            const gs = rooms[roomCode]?.gameState;
            if (!gs || gs.phase !== 'chaos') return;
            gs.roundData.votesToSkip.add(socket.id);
            const totalPlayers = gs.players.filter(p => !p.disconnected && !p.isDefeated).length;
            io.to(roomCode).emit('updateSkipVoteCount', gs.roundData.votesToSkip.size, totalPlayers);
            if (gs.roundData.votesToSkip.size >= totalPlayers) {
                gameLogic.endChaosPhase(roomCode, "Tất cả Thợ Săn đã đồng ý nghỉ ngơi qua hoàng hôn.", rooms, io);
            }
        });

        socket.on('nextRound', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase !== 'gameover') {
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // 5. Xử lý ngắt kết nối
        socket.on('disconnect', () => {
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    if (room.gameState) {
                        const playerInGame = room.gameState.players.find(p => p.id === socket.id);
                        if (playerInGame) {
                            playerInGame.disconnected = true;
                            playerInGame.name = `${playerInGame.name} (Mất tích)`;
                            io.to(roomCode).emit('playerDisconnected', { playerId: socket.id, newName: playerInGame.name });
                        }
                    } else {
                        room.players.splice(playerIndex, 1);
                    }
                    if (room.players.every(p => p.isBot)) {
                        delete rooms[roomCode];
                        break;
                    }
                    if (socket.id === room.hostId && !room.players.every(p => p.isBot)) {
                        const newHost = room.players.find(p => !p.isBot) || room.players[0];
                        room.hostId = newHost.id;
                    }
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                    break;
                }
            }
        });

    }); // Kết thúc io.on('connection')
} // Kết thúc hàm initialize

module.exports = { initialize };