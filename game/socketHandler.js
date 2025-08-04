// game/socketHandler.js
// ======================================================================
// SOCKET HANDLER ("The Traffic Controller")
// PHIÊN BẢN NÂNG CẤP TOÀN DIỆN - SỬA LỖI LUỒNG GAME & NGẮT KẾT NỐI
// ======================================================================

// [SỬA LỖI] Thêm ARTIFACTS vào đây để import nó từ config.js
const { ROLES, DECREES, ARTIFACTS } = require('./config.js');

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
                disconnected: false,
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

        // [SỬA LỖI] Đảm bảo sự kiện này gửi cả allRoles và allDecrees
        socket.on('requestGameData', () => {
            socket.emit('gameData', {
                allRoles: ROLES,
                allDecrees: DECREES,
                allArtifacts: ARTIFACTS // Dòng này giờ sẽ hoạt động vì ARTIFACTS đã được import
            });
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
		 socket.on('useArtifact', (data) => {
            gameLogic.handleUseArtifact(socket, data.roomCode, data.artifactId, data.payload, rooms, io);
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
               room.gameState = gameLogic.createGameState(room.players, io);
                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                          roleData.currentSkillCost = 0;
						   if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) {
                                roleData.description.skill += ` <strong>Mục tiêu của bạn: ${target.name}</strong>`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });

                io.to(roomCode).emit('gameStarted', {
                    // Dữ liệu này đảm bảo gửi đầy đủ các object vai trò
                    rolesInGame: room.gameState.rolesInGame.map(roleId => ({
                        id: roleId,
                        ...ROLES[roleId]
                    })),
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
        
        socket.on('requestRematch', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId) {
                console.log(`[Rematch] Host ${socket.id} yêu cầu chơi lại phòng ${roomCode}`);
                gameLogic.resetRoomForRematch(room);
                io.to(roomCode).emit('returnToLobby', {
                    roomCode: roomCode,
                    hostId: room.hostId,
                    players: room.players
                });
            }
        });
        
        // --- [NÂNG CẤP QUAN TRỌNG] XỬ LÝ NGẮT KẾT NỐI ---
        socket.on('disconnect', () => {
            console.log(`[Disconnect] Người chơi đã ngắt kết nối: ${socket.id}`);
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                let playerIndex = room.players.findIndex(p => p.id === socket.id);
                const gamePlayer = room.gameState?.players.find(p => p.id === socket.id);

                if (playerIndex !== -1 || gamePlayer) {
                    const disconnectedPlayer = room.players[playerIndex] || gamePlayer;
                    console.log(`[Disconnect] Tìm thấy ${disconnectedPlayer.name} trong phòng ${roomCode}.`);
                    
                    if (gamePlayer) gamePlayer.disconnected = true;
                    if(room.players[playerIndex]) room.players[playerIndex].disconnected = true;

                    if (socket.id === room.hostId) {
                        const newHost = room.players.find(p => p.id !== socket.id && !p.isBot && !p.disconnected);
                        if (newHost) {
                            room.hostId = newHost.id;
                            console.log(`[Host Change] Host mới là ${newHost.name}`);
                            io.to(roomCode).emit('logMessage', { type: 'info', message: `Do Trưởng Đoàn đã rời đi, ${newHost.name} giờ là Trưởng Đoàn mới.` });
                            io.to(roomCode).emit('hostChanged', newHost.id);
                        } else {
                            const humanPlayersLeft = room.players.filter(p => !p.isBot && !p.disconnected);
                            if (humanPlayersLeft.length === 0) {
                                console.log(`[Cleanup] Không còn người chơi, xóa phòng ${roomCode}.`);
                                delete rooms[roomCode];
                                return;
                            }
                        }
                    }

                    if (room.gameState) {
                         io.to(roomCode).emit('logMessage', { type: 'error', message: `${disconnectedPlayer.name} đã bị ngắt kết nối.` });
                    } else {
                        room.players.splice(playerIndex, 1);
                    }

                    const currentPlayers = room.gameState ? room.gameState.players : room.players;
                    io.to(roomCode).emit('updatePlayerList', currentPlayers, room.hostId);
                    
                    break;
                }
            }
        });
    });
}

module.exports = { initialize };