// game/socketHandler.js
// ======================================================================
// SOCKET HANDLER ("The Traffic Controller")
// PHIÊN BẢN NÂNG CẤP TOÀN DIỆN - SỬA LỖI LUỒNG GAME & NGẮT KẾT NỐI
// ======================================================================

// [SỬA LỖI] Đảm bảo dòng này tồn tại để import logic game
const gameLogic = require('./logic.js');
const { ROLES, DECREES, ARTIFACTS, SKILL_COSTS } = require('./config.js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // <<< THÊM DÒNG NÀY
const JWT_SECRET = process.env.JWT_SECRET || 'chuoi-bi-mat-cua-ban';
function generateRoomCode(existingRooms) {
    let code;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (existingRooms[code]); // Lặp lại nếu mã đã tồn tại
    return code;
}

function initialize(io, rooms) {
    io.on('connection', (socket) => {
        console.log(`[Connection] Một người chơi đã kết nối: ${socket.id}`);

        // --- HÀM TIỆN ÍCH ---
        function handleJoinRoom(code, name, userPayload) {
			 console.log(`[handleJoinRoom] Bắt đầu xử lý cho người dùng '${userPayload.username}' vào phòng '${code}'`); 
            const room = rooms[code];
            
            // <<< ĐÂY LÀ DÒNG ĐÃ SỬA LỖI >>>
            if (!room) return socket.emit('roomError', `Đoàn thám hiểm '${code}' không tồn tại!`);
            
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu, không thể tham gia!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');

            const newPlayer = {
                id: socket.id,
                name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(),
                isBot: false,
                isReady: false,
                disconnected: false,
                dbId: userPayload.userId,
                username: userPayload.username,
                reconnectionToken: crypto.randomBytes(16).toString('hex'), // Tạo token MỘT LẦN
            };
            
            
            room.players.push(newPlayer);
            socket.join(code);
            
            socket.emit('joinedRoom', { 
                roomCode: code, 
                hostId: room.hostId, 
                myId: socket.id, 
                players: room.players,
               reconnectionToken: crypto.randomBytes(16).toString('hex'),
            });
            
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
			console.log(`[handleJoinRoom] ĐÃ XỬ LÝ XONG. Đã gửi 'joinedRoom' cho client.`);	
        }

        // --- SỰ KIỆN PHÒNG CHỜ ---
      
       socket.on('createRoom', (data) => {
            try {
                // 1. Xác thực người dùng bằng token
                if (!data.token) {
                    throw new Error("Yêu cầu cần xác thực.");
                }
                const userPayload = jwt.verify(data.token, JWT_SECRET);

                // 2. Tạo mã phòng và đối tượng phòng mới
                const newRoomCode = generateRoomCode(rooms);
                const newRoom = {
                    hostId: socket.id,
                    players: [],
                    maxPlayers: 10,
                    gameState: null,
                    settings: { // Cài đặt mặc định
                        bannedRoles: [],
                        bannedDecrees: [],
                        winScore: 20
                    }
                };
                rooms[newRoomCode] = newRoom;
                console.log(`[Room Created] Phòng mới '${newRoomCode}' đã được tạo bởi ${userPayload.username}.`);

                // 3. Tạo đối tượng người chơi cho Host
                const hostPlayer = {
                    id: socket.id,
                    name: (data.name || userPayload.username).substring(0, 15).trim(),
                    isBot: false,
                    isReady: true, // Host luôn sẵn sàng
                    disconnected: false,
                    dbId: userPayload.userId,
                    username: userPayload.username,
                    reconnectionToken: crypto.randomBytes(16).toString('hex'),
                };
                newRoom.players.push(hostPlayer);

                // 4. Cho socket của Host tham gia phòng và gửi lại thông báo thành công
                socket.join(newRoomCode);
                socket.emit('joinedRoom', {
                    roomCode: newRoomCode,
                    hostId: newRoom.hostId,
                    myId: socket.id,
                    players: newRoom.players,
                    reconnectionToken: hostPlayer.reconnectionToken, // Gửi token kết nối lại
                });

            } catch (err) {
                console.error("Lỗi khi tạo phòng:", err.message);
                socket.emit('authError', 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
            }
        });

        socket.on('joinRoom', (data) => {
            try {
                // Kiểm tra token
                if (!data.token) {
                    throw new Error("Yêu cầu cần xác thực.");
                }
                const userPayload = jwt.verify(data.token, JWT_SECRET);

                // Token hợp lệ, tiến hành vào phòng
                handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name, userPayload);

            } catch (err) {
                console.error("Lỗi xác thực khi vào phòng:", err.message);
                socket.emit('authError', 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
            }
        });

    

        socket.on('requestGameData', () => {
            socket.emit('gameData', {
                allRoles: ROLES,
                allDecrees: DECREES,
                allArtifacts: ARTIFACTS
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
    // Luôn kiểm tra xem roomCode có hợp lệ không
    if (!roomCode || typeof roomCode !== 'string') {
        return socket.emit('roomError', 'Mã phòng không hợp lệ.');
    }

    const room = rooms[roomCode];
    if (!room) {
        return socket.emit('roomError', `Phòng ${roomCode} không tồn tại.`);
    }

    // Đảm bảo chỉ có Host mới có thể bắt đầu game
    if (socket.id !== room.hostId) {
        return socket.emit('roomError', 'Chỉ có Trưởng Đoàn mới có thể bắt đầu ván đấu.');
    }

    // Kiểm tra tất cả người chơi (không phải bot, không phải host) đã sẵn sàng chưa
    const allReady = room.players.filter(p => !p.isBot && p.id !== room.hostId).every(p => p.isReady);

    if (room.players.length < 2) {
        return socket.emit('roomError', 'Cần ít nhất 2 người chơi để bắt đầu.');
    }
    
    if (!allReady) {
        return socket.emit('roomError', 'Vẫn còn người chơi chưa sẵn sàng!');
    }

    // Nếu tất cả điều kiện đều đạt, bắt đầu game
    console.log(`[Game Start] Host ${socket.id} đang bắt đầu game cho phòng ${roomCode}`);
    
    // Tạo trạng thái game
    room.gameState = gameLogic.createGameState(room.players, io, room.settings);
    
    // Gửi vai trò riêng cho từng người chơi
    room.gameState.players.forEach(p => {
        if (!p.isBot) {
            const roleData = { ...ROLES[p.roleId], id: p.roleId };
            roleData.currentSkillCost = SKILL_COSTS[0] ?? 0; // Chi phí ban đầu

            if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                if (target) {
                    roleData.description.skill += ` <strong>Mục tiêu của bạn: ${target.name}</strong>`;
                }
            }
            io.to(p.id).emit('yourRoleIs', roleData);
        }
    });

    // Thông báo cho tất cả mọi người trong phòng rằng game đã bắt đầu
    io.to(roomCode).emit('gameStarted', {
        rolesInGame: room.gameState.rolesInGame.map(roleId => ({
            id: roleId,
            ...ROLES[roleId]
        })),
        players: room.gameState.players
    });
    
    // Bắt đầu vòng đầu tiên sau một khoảng trễ ngắn
    setTimeout(() => {
        gameLogic.startNewRound(roomCode, rooms, io);
    }, 1500);
});
        // --- SỰ KIỆN HÀNH ĐỘNG TRONG GAME ---
        socket.on('playerChoice', (data) => gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io, data.payload));
        socket.on('voteCoordination', (data) => gameLogic.handleCoordination(data.roomCode, socket.id, data.targetId, rooms, io));
        socket.on('voteSkipCoordination', (roomCode) => gameLogic.handleVoteToSkip(roomCode, socket.id, 'coordination', rooms, io));
        socket.on('voteSkipTwilight', (roomCode) => gameLogic.handleVoteToSkip(roomCode, socket.id, 'twilight', rooms, io));
        socket.on('requestAccusation', (data) => gameLogic.handleTwilightAction(data.roomCode, socket.id, data.targetId, 'Vạch Trần', data.guess, rooms, io));
        socket.on('useRoleSkill', (data) => gameLogic.handleUseSkill(socket, data.roomCode, data.payload, rooms, io));
		socket.on('submitArtifactChoice', (data) => {
    gameLogic.handleArtifactDecision(data.roomCode, socket.id, data.decision, rooms, io);
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

        // SỰ KIỆN CHƠI LẠI
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
		socket.on('attemptReconnection', (data) => {
    const { roomCode, reconnectionToken } = data;
    const room = rooms[roomCode];
    
    if (!room || !room.gameState) {
        return socket.emit('reconnectionFailed');
    }

    const playerToReconnect = room.gameState.players.find(p => p.reconnectionToken === reconnectionToken);

    if (playerToReconnect && playerToReconnect.disconnected) {
        const timeSinceDisconnect = Date.now() - (playerToReconnect.disconnectTime || 0);
        const RECONNECT_WINDOW_MS = 120000; // 2 phút

        if (timeSinceDisconnect < RECONNECT_WINDOW_MS) {
            // Kết nối lại thành công!
            console.log(`[Reconnect] Người chơi ${playerToReconnect.name} đã kết nối lại thành công!`);
            
            // Cập nhật socket ID mới cho người chơi cũ
            playerToReconnect.id = socket.id;
            playerToReconnect.disconnected = false;
            delete playerToReconnect.disconnectTime;

            socket.join(roomCode);

            // Gửi toàn bộ trạng thái game hiện tại cho người chơi đó
            socket.emit('reconnectionSuccessful', {
                gameState: room.gameState,
                myRole: room.gameState.players.find(p => p.id === socket.id).roleId, // Gửi lại vai trò
                // Gửi thêm bất cứ dữ liệu cần thiết nào
            });
            
            // Thông báo cho những người khác
            io.to(roomCode).emit('logMessage', { type: 'success', message: `${playerToReconnect.name} đã kết nối trở lại!` });
            io.to(roomCode).emit('updatePlayerList', room.gameState.players, room.hostId);

        } else {
            socket.emit('reconnectionFailed', 'Đã hết thời gian kết nối lại.');
        }
    } else {
        socket.emit('reconnectionFailed', 'Không tìm thấy người chơi để kết nối lại.');
    }
});
socket.on('updateRoomSettings', (data) => {
    const room = rooms[data.roomCode];
    // Chỉ Host mới có quyền thay đổi cài đặt
    if (room && socket.id === room.hostId) {
        // Validate dữ liệu từ client để đảm bảo an toàn
        const validatedSettings = {
            bannedRoles: Array.isArray(data.settings.bannedRoles) ? data.settings.bannedRoles : [],
            bannedDecrees: Array.isArray(data.settings.bannedDecrees) ? data.settings.bannedDecrees : [],
            winScore: Math.max(5, Math.min(50, parseInt(data.settings.winScore) || 20))
        };
        
        room.settings = validatedSettings; // Lưu cài đặt vào đối tượng phòng
        
        // Thông báo cho TẤT CẢ người chơi trong phòng về cài đặt mới
        io.to(data.roomCode).emit('roomSettingsUpdated', room.settings);
        console.log(`[Settings] Host đã cập nhật cài đặt cho phòng ${data.roomCode}:`, room.settings);
    }
});

        // --- XỬ LÝ NGẮT KẾT NỐI ---
        socket.on('disconnect', () => {
            console.log(`[Disconnect] Người chơi đã ngắt kết nối: ${socket.id}`);
            
            // Phải duyệt qua tất cả các phòng để tìm người chơi này
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                let wasPlayerFound = false;

                // Kịch bản 1: Game đã bắt đầu, người chơi nằm trong gameState
                if (room.gameState) {
                    const gamePlayer = room.gameState.players.find(p => p.id === socket.id);
                    
                    if (gamePlayer) {
                        wasPlayerFound = true;
                        console.log(`[Disconnect] Tìm thấy ${gamePlayer.name} trong ván đấu đang diễn ra tại phòng ${roomCode}.`);

                        // --- ĐÂY LÀ PHẦN CỐT LÕI CHO TÍNH NĂNG RECONNECT ---
                        // 1. Đánh dấu người chơi là đã ngắt kết nối, không xóa họ.
                        gamePlayer.disconnected = true;
                        
                        // 2. Ghi lại thời gian ngắt kết nối để tính toán cửa sổ reconnect.
                        gamePlayer.disconnectTime = Date.now();
                        // ----------------------------------------------------

                        io.to(roomCode).emit('logMessage', { type: 'error', message: `${gamePlayer.name} đã bị ngắt kết nối.` });
                    }
                } 
                // Kịch bản 2: Game chưa bắt đầu, người chơi đang ở trong lobby
                else {
                    const lobbyPlayerIndex = room.players.findIndex(p => p.id === socket.id);

                    if (lobbyPlayerIndex !== -1) {
                        wasPlayerFound = true;
                        const disconnectedPlayerName = room.players[lobbyPlayerIndex].name;
                        console.log(`[Disconnect] Tìm thấy ${disconnectedPlayerName} trong phòng chờ ${roomCode}.`);
                        
                        // Xóa người chơi khỏi phòng chờ vì game chưa bắt đầu, không cần giữ lại state
                        room.players.splice(lobbyPlayerIndex, 1);
                        io.to(roomCode).emit('logMessage', { type: 'info', message: `${disconnectedPlayerName} đã rời khỏi đoàn thám hiểm.` });
                    }
                }

                // Nếu tìm thấy người chơi trong phòng này (dù ở lobby hay trong game)
                if (wasPlayerFound) {
                    // Logic xử lý chuyển Host (giữ nguyên vì nó quan trọng)
                    if (socket.id === room.hostId) {
                        // Tìm một người chơi khác (không phải bot, chưa ngắt kết nối) để làm host mới
                        const newHost = room.players.find(p => p.id !== socket.id && !p.isBot && !p.disconnected);
                        
                        if (newHost) {
                            room.hostId = newHost.id;
                            console.log(`[Host Change] Host mới của phòng ${roomCode} là ${newHost.name}`);
                            io.to(roomCode).emit('logMessage', { type: 'info', message: `Do Trưởng Đoàn đã rời đi, ${newHost.name} giờ là Trưởng Đoàn mới.` });
                            io.to(roomCode).emit('hostChanged', newHost.id);
                        } else {
                            // Kiểm tra xem còn người chơi nào không
                            const humanPlayersLeft = room.players.filter(p => !p.isBot && !p.disconnected);
                            if (humanPlayersLeft.length === 0) {
                                console.log(`[Cleanup] Không còn người chơi, xóa phòng ${roomCode}.`);
                                delete rooms[roomCode];
                                // Không cần làm gì thêm, phòng đã bị xóa
                                return; // Thoát khỏi hàm `disconnect` luôn
                            }
                        }
                    }
                    
                    // Cập nhật danh sách người chơi cho tất cả mọi người trong phòng
                    // Nếu game đang chạy, gửi danh sách từ gameState, ngược lại gửi từ room.players
                    const currentPlayers = room.gameState ? room.gameState.players : room.players;
                    io.to(roomCode).emit('updatePlayerList', currentPlayers, room.hostId);
                    
                    // Đã tìm thấy và xử lý, không cần duyệt các phòng khác nữa
                    break; 
                }
            }
        });

    });
}

module.exports = { initialize };