// game/socketHandler.js
// ======================================================================
// THỢ SĂN CỔ VẬT - SOCKET EVENT HANDLER
// Nhiệm vụ: Lắng nghe các sự kiện từ client và gọi các hàm logic tương ứng.
// Đây là lớp giao tiếp giữa client và core game logic.
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
        // console.log(`[SOCKET] User connected: ${socket.id}`);

        // --- HÀM NỘI BỘ (HELPER) ---
        /**
         * Xử lý logic khi một người chơi tham gia phòng.
         * @param {string} code - Mã phòng.
         * @param {string} name - Tên người chơi.
         */
        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) {
                return socket.emit('roomError', `Phòng '${code}' không tồnTAIN!`);
            }
            if (room.gameState) {
                return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu!');
            }
            if (room.players.length >= room.maxPlayers) {
                return socket.emit('roomError', 'Đoàn đã đủ người!');
            }
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

        // --- LẮNG NGHE SỰ KIỆN TỪ CLIENT ---

        // 1. Quản lý phòng chờ (Lobby)
        socket.on('createRoom', data => {
            let code;
            do {
                code = Math.random().toString(36).substring(2, 6).toUpperCase();
            } while (rooms[code]);
            rooms[code] = { players: [], hostId: socket.id, maxPlayers: 12, gameState: null };
            handleJoinRoom(code, data.name);
        });

        socket.on('joinRoom', data => {
            handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name);
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

        // 2. Bắt đầu và Chơi lại Game
        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length >= 2) {
                // Gọi hàm từ module logic để tạo trạng thái game
                room.gameState = gameLogic.createGameState(room.players);
                
                // Gửi vai trò riêng cho từng người chơi thực
                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        if (p.roleId === 'PUPPETEER') {
                            const puppet = room.gameState.players.find(pup => pup.id === p.puppetId);
                            if(puppet) {
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

        socket.on('playAgain', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase === 'gameover') {
                 // Logic tương tự startGame
                 room.gameState = gameLogic.createGameState(room.players);
                 room.gameState.players.forEach(p => {
                     if (!p.isBot) {
                         const roleData = { ...ROLES[p.roleId], id: p.roleId };
                         if (p.roleId === 'PUPPETEER') { /*...*/ }
                         io.to(p.id).emit('yourRoleIs', roleData);
                     }
                 });
                 io.to(roomCode).emit('gameStarted');
                 gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // 3. Hành động trong game
        socket.on('playerChoice', data => {
            gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io);
        });

        socket.on('requestChaosAction', data => {
            gameLogic.handleChaosAction(data.roomCode, socket.id, data.targetId, data.actionType, data.guess, rooms, io);
        });

        socket.on('playerVotedToSkip', (roomCode) => {
            const gs = rooms[roomCode]?.gameState;
            if (!gs || gs.phase !== 'chaos' || gs.roundData.chaosActionTaken) return;
            gs.roundData.votesToSkip.add(socket.id);
            const totalPlayers = gs.players.filter(p => !p.disconnected && !p.isDefeated).length;
            io.to(roomCode).emit('updateSkipVoteCount', gs.roundData.votesToSkip.size, totalPlayers);
            if (gs.roundData.votesToSkip.size >= totalPlayers) {
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
            gameLogic.startChaosPhase(data.roomCode, rooms, io);
        });

        socket.on('nextRound', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase !== 'gameover') {
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // 4. Xử lý ngắt kết nối
        socket.on('disconnect', () => {
            // console.log(`[SOCKET] User disconnected: ${socket.id}`);
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const playerIndex = room.players.findIndex(p => p.id === socket.id);

                if (playerIndex !== -1) {
                    // Nếu game đang diễn ra
                    if (room.gameState) {
                        const playerInGame = room.gameState.players.find(p => p.id === socket.id);
                        if (playerInGame) {
                            playerInGame.disconnected = true;
                            playerInGame.name = `${playerInGame.name} (Mất tích)`;
                            io.to(roomCode).emit('playerDisconnected', { playerId: socket.id, newName: playerInGame.name });
                        }
                    } else {
                        // Nếu đang ở phòng chờ, loại bỏ người chơi
                        room.players.splice(playerIndex, 1);
                    }

                    // Nếu không còn người chơi thật nào, xóa phòng
                    const realPlayersLeft = room.players.some(p => !p.isBot);
                    if (!realPlayersLeft) {
                        delete rooms[roomCode];
                        break; // Thoát khỏi vòng lặp vì phòng đã bị xóa
                    }

                    // Nếu host ngắt kết nối, chuyển host cho người tiếp theo
                    if (socket.id === room.hostId && room.players.length > 0) {
                        const newHost = room.players.find(p => !p.isBot) || room.players[0];
                        room.hostId = newHost.id;
                    }
                    
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                    break; // Thoát khỏi vòng lặp vì đã tìm thấy và xử lý người chơi
                }
            }
        });

    });
}

module.exports = { initialize };