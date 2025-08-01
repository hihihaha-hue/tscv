// game/socketHandler.js
// ======================================================================
// THỢ SĂN CỔ VẬT - SOCKET EVENT HANDLER
// Lắng nghe tất cả sự kiện từ client và gọi các hàm logic tương ứng.
// Đóng vai trò là "Controller" trong mô hình.
// ======================================================================

const gameLogic = require('./logic.js');
const { ROLES } = require('./config.js');

/**
 * Khởi tạo tất cả các trình lắng nghe sự kiện của Socket.IO.
 * @param {Server} io - Instance của Socket.IO server.
 * @param {Object} rooms - Object chứa tất cả các phòng chơi.
 */
function initialize(io, rooms) {

    io.on('connection', (socket) => {
        // console.log(`[SOCKET] User connected: ${socket.id}`);

        // --- A. ROOM & LOBBY MANAGEMENT ---

        socket.on('createRoom', data => {
            let code;
            do {
                code = Math.random().toString(36).substring(2, 6).toUpperCase();
            } while (rooms[code]);
            rooms[code] = { players: [], hostId: socket.id, maxPlayers: 12, gameState: null };
            handleJoinRoom(code, data.name);
        });

        socket.on('joinRoom', data => {
            handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name)
        });

        socket.on('addBot', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length < room.maxPlayers) {
                const personalities = ['aggressive', 'cautious', 'random'];
                const botPlayer = {
                    id: `bot-${Date.now()}`,
                    name: `Thợ Săn AI ${room.players.length + 1}`,
                    isBot: true,
                    personality: personalities[Math.floor(Math.random() * personalities.length)]
                };
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

        // --- B. CORE GAME ACTIONS ---

        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length >= 2) {
                // Gọi hàm logic để tạo trạng thái game
                room.gameState = gameLogic.createGameState(room.players);

                // Gửi vai trò riêng cho từng người chơi
                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        if (p.roleId === 'PUPPETEER') {
                            const puppet = room.gameState.players.find(pup => pup.id === p.puppetId);
                            if (puppet) {
                                roleData.description += ` Con rối của bạn là: <strong>${puppet.name}</strong>.`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });

                io.to(roomCode).emit('gameStarted');
                // Gọi hàm logic để bắt đầu vòng mới
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        socket.on('playerChoice', data => {
            // Ủy quyền xử lý cho module logic
            gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io);
        });

        socket.on('requestChaosAction', data => {
            // Ủy quyền xử lý cho module logic
            gameLogic.handleChaosAction(data.roomCode, socket.id, data.targetId, data.actionType, data.guess, rooms, io);
        });

        socket.on('playerVotedToSkip', (roomCode, botId = null) => {
            const gs = rooms[roomCode]?.gameState;
            if (!gs || gs.phase !== 'chaos' || gs.roundData.chaosActionTaken) return;
            
            const voterId = botId || socket.id;
            gs.roundData.votesToSkip.add(voterId);
            const totalPlayers = gs.players.filter(p => !p.disconnected).length;
            io.to(roomCode).emit('updateSkipVoteCount', gs.roundData.votesToSkip.size, totalPlayers);
            
            if (gs.roundData.votesToSkip.size >= totalPlayers) {
                // Gọi hàm logic để kết thúc giai đoạn
                gameLogic.endChaosPhase(roomCode, "Tất cả Thợ Săn đã đồng ý nghỉ ngơi qua hoàng hôn.", rooms, io);
            }
        });
        
        socket.on('amnesiaAction', data => {
            const gs = rooms[data.roomCode]?.gameState;
            if (!gs || gs.phase !== 'special_action') return;
            const p1 = gs.players.find(p => p.id === data.player1Id);
            const p2 = gs.players.find(p => p.id === data.player2Id);

            if (p1 && p2) {
                [p1.chosenAction, p2.chosenAction] = [p2.chosenAction, p1.chosenAction];
                io.to(data.roomCode).emit('logMessage', { type: 'warning', message: `🧠 Hành động của **${p1.name}** và **${p2.name}** đã bị hoán đổi!` });
            }
            // Sau khi đổi, bắt đầu giai đoạn tiếp theo
            gameLogic.startChaosPhase(data.roomCode, rooms, io);
        });

        socket.on('nextRound', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState.phase !== 'gameover') {
                // Ủy quyền xử lý cho module logic
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        socket.on('playAgain', (roomCode) => {
            const room = rooms[roomCode];
            // Tương tự như startGame
            if (room && socket.id === room.hostId && room.gameState.phase === 'gameover') {
                room.gameState = gameLogic.createGameState(room.players);
                // Gửi lại vai trò mới cho mọi người
                 room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        if (p.roleId === 'PUPPETEER') {
                            const puppet = room.gameState.players.find(pup => pup.id === p.puppetId);
                            if (puppet) {
                                roleData.description += ` Con rối của bạn là: <strong>${puppet.name}</strong>.`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });
                io.to(roomCode).emit('gameStarted');
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // --- C. CONNECTION HANDLING ---

        socket.on('disconnect', () => {
            // console.log(`[SOCKET] User disconnected: ${socket.id}`);
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const playerIndex = room.players.findIndex(p => p.id === socket.id);

                if (playerIndex !== -1) {
                    if (room.gameState) {
                        // Nếu game đang diễn ra, đánh dấu người chơi bị mất kết nối
                        const playerInGame = room.gameState.players.find(p => p.id === socket.id);
                        if (playerInGame) {
                            playerInGame.disconnected = true;
                            playerInGame.name = `${playerInGame.name} (Mất tích)`;
                            io.to(roomCode).emit('playerDisconnected', { playerId: socket.id, newName: playerInGame.name });
                        }
                    } else {
                        // Nếu ở phòng chờ, xóa người chơi
                        room.players.splice(playerIndex, 1);
                    }

                    // Nếu không còn người chơi thật nào, xóa phòng
                    if (room.players.filter(p => !p.isBot).length === 0) {
                        delete rooms[roomCode];
                        break; 
                    }

                    // Nếu host bị ngắt kết nối, chuyển host cho người chơi thật tiếp theo
                    if (socket.id === room.hostId && room.players.length > 0) {
                        const newHost = room.players.find(p => !p.isBot) || room.players[0];
                        room.hostId = newHost.id;
                    }

                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                    break; 
                }
            }
        });

        // --- D. HELPER FUNCTIONS (Scoped to this connection) ---
        
        /**
         * Xử lý logic khi người chơi tham gia phòng.
         * @param {string} code - Mã phòng
         * @param {string} name - Tên người chơi
         */
        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) return socket.emit('roomError', `Phòng '${code}' không tồn tại!`);
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');

            const newPlayer = {
                id: socket.id,
                name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(),
                isBot: false
            };
            
            room.players.push(newPlayer);
            socket.join(code);
            
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
            socket.emit('joinedRoom', {
                roomCode: code,
                hostId: room.hostId,
                myId: socket.id,
                players: room.players
            });
        }
    });
}

module.exports = { initialize };