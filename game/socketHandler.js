// game/socketHandler.js
// ======================================================================
// SOCKET HANDLER ("The Traffic Controller")
// PHIÊN BẢN NÂNG CẤP TOÀN DIỆN - SỬA LỖI LUỒNG GAME & NGẮT KẾT NỐI
// ======================================================================

const gameLogic = require('./logic.js');
const { ROLES } = require('./config.js');

function initialize(io, rooms) {
    io.on('connection', (socket) => {
        console.log(`[Connection] Một người chơi đã kết nối: ${socket.id}`);

        // --- HÀM TIỆN ÍCH ---
        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) return socket.emit('roomError', `Đoàn thám hiểm '${code}' không tồn tại!`);
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu, không thể tham gia!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');

            const newPlayer = {
                id: socket.id,
                name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(),
                isBot: false,
                isReady: false,
                disconnected: false, // Thêm trạng thái ngắt kết nối
            };
            room.players.push(newPlayer);
            socket.join(code);
            socket.emit('joinedRoom', { roomCode: code, hostId: room.hostId, myId: socket.id, players: room.players });
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
        }

        // --- SỰ KIỆN PHÒNG CHỜ ---
        socket.on('createRoom', (data) => {
            let code;
            do { code = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (rooms[code]);
            rooms[code] = { players: [], hostId: socket.id, maxPlayers: 12, gameState: null };
            handleJoinRoom(code, data.name);
        });

        socket.on('joinRoom', (data) => {
            handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name);
        });

        socket.on('playerReady', (roomCode) => {
            const room = rooms[roomCode];
            if (!room || room.gameState) return;
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.isReady = !player.isReady;
                io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });

        socket.on('addBot', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length < room.maxPlayers) {
                const botPlayer = {
                    id: `bot-${Date.now()}`,
                    name: `AI ${room.players.length + 1}`,
                    isBot: true,
                    isReady: true,
                    disconnected: false,
                    personality: ['aggressive', 'cautious', 'random'][Math.floor(Math.random() * 3)]
                };
                room.players.push(botPlayer);
                io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });

        socket.on('kickPlayer', (data) => {
            const room = rooms[data.roomCode];
            if (!room || socket.id !== room.hostId) return;

            const targetPlayer = room.players.find(p => p.id === data.playerId);
            if (!targetPlayer) return;

            if (!targetPlayer.isBot) {
                const targetSocket = io.sockets.sockets.get(data.playerId);
                if (targetSocket) {
                    targetSocket.emit('kicked');
                    targetSocket.leave(data.roomCode);
                }
            }

            room.players = room.players.filter(p => p.id !== data.playerId);
            if (room.gameState) {
                room.gameState.players = room.gameState.players.filter(p => p.id !== data.playerId);
            }
            io.to(data.roomCode).emit('updatePlayerList', room.players, room.hostId);
            console.log(`[Kick] Đã đuổi ${targetPlayer.name} (${data.playerId}) khỏi phòng ${data.roomCode}.`);
        });

        // --- SỰ KIỆN LUỒNG GAME ---
        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            const allReady = room?.players.filter(p => !p.isBot && p.id !== room.hostId).every(p => p.isReady);

            if (room && socket.id === room.hostId && room.players.length >= 2 && allReady) {
                room.gameState = gameLogic.createGameState(room.players);

                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                          roleData.currentSkillCost = 0;
						   if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            // Tìm đối tượng người chơi là mục tiêu để lấy tên
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) {
                                // Nối tên mục tiêu vào phần mô tả kỹ năng
                                roleData.description.skill += ` <strong>Mục tiêu của bạn: ${target.name}</strong>`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });

                io.to(roomCode).emit('gameStarted', {
                    rolesInGame: room.gameState.rolesInGame.map(roleId => ({ id: roleId, ...ROLES[roleId] })),
                    players: room.gameState.players
                });
                
                setTimeout(() => {
                    gameLogic.startNewRound(roomCode, rooms, io);
                }, 1500);
            

            } else if (room && socket.id === room.hostId && !allReady) {
                socket.emit('roomError', 'Vẫn còn người chơi chưa sẵn sàng!');
            }
        });

        socket.on('nextRound', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState && room.gameState.phase !== 'gameover') {
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // --- SỰ KIỆN HÀNH ĐỘNG TRONG GAME ---
        // Các sự kiện này chủ yếu gọi đến gameLogic, giữ nguyên
        socket.on('playerChoice', (data) => gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io));
        socket.on('voteCoordination', (data) => gameLogic.handleCoordination(data.roomCode, socket.id, data.targetId, rooms, io));
        socket.on('voteSkipCoordination', (roomCode) => gameLogic.handleVoteToSkip(roomCode, socket.id, 'coordination', rooms, io));
        socket.on('voteSkipTwilight', (roomCode) => gameLogic.handleVoteToSkip(roomCode, socket.id, 'twilight', rooms, io));
        socket.on('requestAccusation', (data) => gameLogic.handleTwilightAction(data.roomCode, socket.id, data.targetId, 'Vạch Trần', data.guess, rooms, io));
        socket.on('useRoleSkill', (data) => gameLogic.handleUseSkill(socket, data.roomCode, data.payload, rooms, io));

        socket.on('sendMessage', (data) => {
            const room = rooms[data.roomCode];
            const player = room?.players.find(p => p.id === socket.id);
            if (room && player) {
                io.to(data.roomCode).emit('newMessage', {
                    senderName: player.name,
                    message: data.message.substring(0, 200)
                });
            }
        });

        // --- [NÂNG CẤP QUAN TRỌNG] XỬ LÝ NGẮT KẾT NỐI ---
        socket.on('disconnect', () => {
            console.log(`[Disconnect] Người chơi đã ngắt kết nối: ${socket.id}`);
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const playerIndex = room.players.findIndex(p => p.id === socket.id);

                if (playerIndex !== -1) {
                    const disconnectedPlayer = room.players[playerIndex];
                    console.log(`[Disconnect] Tìm thấy ${disconnectedPlayer.name} trong phòng ${roomCode}.`);

                    // Nếu host ngắt kết nối, chuyển host cho người tiếp theo
                    if (socket.id === room.hostId) {
                        const newHost = room.players.find(p => p.id !== socket.id && !p.isBot);
                        if (newHost) {
                            room.hostId = newHost.id;
                            console.log(`[Host Change] Host mới là ${newHost.name}`);
                            io.to(roomCode).emit('logMessage', { type: 'info', message: `Do Trưởng Đoàn đã rời đi, ${newHost.name} giờ là Trưởng Đoàn mới.` });
                        } else {
                            // Nếu không còn người chơi nào, xóa phòng
                            console.log(`[Cleanup] Không còn người chơi, xóa phòng ${roomCode}.`);
                            delete rooms[roomCode];
                            return; // Thoát khỏi hàm
                        }
                    }

                    // Nếu game đang diễn ra, đánh dấu người chơi là 'disconnected' thay vì xóa
                    if (room.gameState) {
                        const gamePlayer = room.gameState.players.find(p => p.id === socket.id);
                        if (gamePlayer) {
                            gamePlayer.disconnected = true;
                        }
                         io.to(roomCode).emit('logMessage', { type: 'error', message: `${disconnectedPlayer.name} đã bị ngắt kết nối.` });
                    } else {
                        // Nếu đang ở phòng chờ, xóa người chơi khỏi danh sách
                        room.players.splice(playerIndex, 1);
                    }

                    // Cập nhật danh sách người chơi cho mọi người
                    const currentPlayers = room.gameState ? room.gameState.players : room.players;
                    io.to(roomCode).emit('updatePlayerList', currentPlayers, room.hostId);
                    
                    break; // Thoát khỏi vòng lặp vì đã tìm thấy và xử lý
                }
            }
        });
    });
}

module.exports = { initialize };