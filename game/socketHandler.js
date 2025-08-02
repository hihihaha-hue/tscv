// game/socketHandler.js
// ======================================================================
// SOCKET HANDLER ("The Traffic Controller")
// PHIÊN BẢN HOÀN CHỈNH VÀ ĐÃ SỬA LỖI CÚ PHÁP
// ======================================================================

const gameLogic = require('./logic.js');
const { ROLES } = require('./config.js');

function initialize(io, rooms) {
    io.on('connection', (socket) => {
        console.log(`[Connection] Một người chơi đã kết nối: ${socket.id}`);

        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) return socket.emit('roomError', `Phòng '${code}' không tồn tại!`);
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');

            const newPlayer = {
                id: socket.id,
                name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(),
                isBot: false,
                isReady: false
            };
            room.players.push(newPlayer);
            socket.join(code);
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
            socket.emit('joinedRoom', { roomCode: code, hostId: room.hostId, myId: socket.id, players: room.players });
            console.log(`[Join] Người chơi ${newPlayer.name} (${socket.id}) đã vào phòng ${code}`);
        }

        socket.on('playerReady', (roomCode) => {
            const room = rooms[roomCode];
            if (room && !room.gameState) {
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.isReady = !player.isReady;
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                }
            }
        });

        socket.on('sendQuickChat', (data) => {
            const room = rooms[data.roomCode];
            const sender = room?.players.find(p => p.id === socket.id);
            if (!sender) return;
            let message = '';
            const target = room.players.find(p => p.id === data.targetId);
            switch(data.key) {
                case 'suspect': if (target) message = `Tôi nghi ngờ ${target.name}!`; break;
                case 'praise': message = `Nước đi hay lắm! 👍`; break;
                case 'hurry': message = `Mọi người ơi, nhanh lên nào! ⏰`; break;
            }
            if (message) {
                io.to(data.roomCode).emit('newMessage', { senderName: sender.name, message: message });
            }
        });

        socket.on('createRoom', data => {
            let code;
            do {
                code = Math.random().toString(36).substring(2, 6).toUpperCase();
            } while (rooms[code]);
            rooms[code] = {
                players: [],
                hostId: socket.id,
                maxPlayers: 12,
                gameState: null
            };
            console.log(`[Create] Người chơi ${socket.id} đã tạo phòng ${code}`);
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
                    name: `AI ${room.players.length + 1}`,
                    isBot: true,
                    personality: personalities[Math.floor(Math.random() * personalities.length)]
                };
                room.players.push(botPlayer);
                io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });
        
        socket.on('voteSkipCoordination', (roomCode) => {
            const room = rooms[roomCode];
            if (room && room.gameState && room.gameState.phase === 'coordination') {
                gameLogic.handleVoteToSkip(roomCode, socket.id, 'coordination', rooms, io);
            }
        });

        socket.on('voteSkipTwilight', (roomCode) => {
            const room = rooms[roomCode];
            if (room && room.gameState && room.gameState.phase === 'twilight') {
                gameLogic.handleVoteToSkip(roomCode, socket.id, 'twilight', rooms, io);
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
                if (room.gameState) {
                    room.gameState.players = room.gameState.players.filter(p => p.id !== data.playerId);
                }
                io.to(data.roomCode).emit('updatePlayerList', room.players, room.hostId);
            }
        });

        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.players.length >= 2) {
                console.log(`[Start Game] Game bắt đầu tại phòng ${roomCode}`);
                room.gameState = gameLogic.createGameState(room.players);

                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) {
                                roleData.description.skill += ` <strong>Mục tiêu</strong> của bạn là: <strong>${target.name}</strong>.`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });

                // Gửi danh sách vai trò cho tất cả người chơi
                io.to(roomCode).emit('gameStarted', {
                    rolesInGame: room.gameState.rolesInGame.map(roleId => ({ id: roleId, ...ROLES[roleId] }))
                });
                
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        socket.on('nextRound', roomCode => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase !== 'gameover') {
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });
        
        socket.on('playAgain', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase === 'gameover') {
                room.gameState = null;
                io.to(roomCode).emit('backToLobby', { players: room.players, hostId: room.hostId });
            }
        });

        socket.on('playerChoice', data => {
            gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io);
        });

        socket.on('voteCoordination', (data) => {
            const room = rooms[data.roomCode];
            if (room && room.gameState && room.gameState.phase === 'coordination') {
                gameLogic.handleCoordination(data.roomCode, socket.id, data.targetId, rooms, io);
            }
        });

       socket.on('requestAccusation', data => {
            const room = rooms[data.roomCode];
            if (room && room.gameState) {
                io.to(data.roomCode).emit('playerAccused', {
                    initiatorId: socket.id,
                    targetId: data.targetId
                });
            }
            gameLogic.handleTwilightAction(data.roomCode, socket.id, data.targetId, 'Vạch Trần', data.guess, rooms, io);
        });

        socket.on('useRoleSkill', data => {
            gameLogic.handleUseSkill(socket, data.roomCode, data.payload, rooms, io);
        });
        
        socket.on('submitAmnesiaAction', (data) => {
            const room = rooms[data.roomCode];
            const gs = room?.gameState;
            if (gs && gs.phase === 'amnesia_selection') {
                gameLogic.handleAmnesiaAction(data.roomCode, data, rooms, io);
            }
        });

        socket.on('submitArenaPick', (data) => {
            gameLogic.handleArenaPick(data.roomCode, data, rooms, io);
        });

        socket.on('submitArenaBet', (data) => {
            const room = rooms[data.roomCode];
            const gs = room?.gameState;
            if (gs && gs.phase === 'arena_betting') {
                gameLogic.handleArenaBet(data.roomCode, socket.id, data, rooms);
                socket.emit('logMessage', {type: 'success', message: 'Lựa chọn đặt cược của bạn đã được ghi nhận.'})
            }
        });

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

        socket.on('disconnect', () => {
            console.log(`[Disconnect] Người chơi đã ngắt kết nối: ${socket.id}`);
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

                    if (room.players.every(p => p.isBot || p.disconnected) && room.players.length > 0) {
                        console.log(`[Cleanup] Xóa phòng ${roomCode} vì không còn người chơi.`);
                        delete rooms[roomCode];
                        break;
                    }

                    if (socket.id === room.hostId && room.players.some(p => !p.isBot && !p.disconnected)) {
                        const newHost = room.players.find(p => !p.isBot && !p.disconnected);
                        if (newHost) {
                            room.hostId = newHost.id;
                            console.log(`[Host Change] Chủ phòng mới của phòng ${roomCode} là ${newHost.name}`);
                        }
                    }
                    
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                    break;
                }
            }
        });
    });
}

module.exports = { initialize };