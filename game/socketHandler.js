// game/socketHandler.js
// ======================================================================
// SOCKET HANDLER ("The Traffic Controller")
// Nhiệm vụ: Lắng nghe, xác thực và điều phối tất cả các sự kiện từ client.
// Đây là cầu nối duy nhất giữa Client và Core Game Logic.
// ======================================================================

// Nhập các module cần thiết
const gameLogic = require('./logic.js'); // "Bộ Não" xử lý luật chơi
const { ROLES } = require('./config.js');   // "Sách Luật" chứa thông tin về các vai trò


function initialize(io, rooms) {
    io.on('connection', (socket) => {
        // Mỗi khi có một người chơi mới mở game trên trình duyệt, một 'socket' mới sẽ được tạo ra.
        // Tất cả các sự kiện của người chơi đó sẽ được xử lý bên trong hàm này.
        console.log(`[Connection] Một người chơi đã kết nối: ${socket.id}`);

        // ==========================================================
        // --- I. HÀM NỘI BỘ (HELPER FUNCTIONS) ---
        // ==========================================================

        /**
         * Hàm tiện ích xử lý logic khi một người chơi tham gia phòng.
         * Được dùng chung cho cả 'createRoom' và 'joinRoom' để tránh lặp code.
         * @param {string} code - Mã phòng để tham gia.
         * @param {string} name - Tên người chơi.
         */
        function handleJoinRoom(code, name) {
            const room = rooms[code];
            if (!room) return socket.emit('roomError', `Phòng '${code}' không tồn tại!`);
            if (room.gameState) return socket.emit('roomError', 'Cuộc thám hiểm đã bắt đầu!');
            if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Đoàn đã đủ người!');

            const newPlayer = {
                id: socket.id,
                name: (name || `Thợ Săn ${room.players.length + 1}`).substring(0, 15).trim(),
                isBot: false,
                isReady: false // <-- THÊM DÒNG NÀY
            };
            room.players.push(newPlayer);
            socket.join(code);
            io.to(code).emit('updatePlayerList', room.players, room.hostId);
            socket.emit('joinedRoom', { roomCode: code, hostId: room.hostId, myId: socket.id, players: room.players });
            console.log(`[Join] Người chơi ${newPlayer.name} (${socket.id}) đã vào phòng ${code}`);
        }

        // THÊM MỚI: Lắng nghe sự kiện khi người chơi bấm nút Sẵn sàng
        socket.on('playerReady', (roomCode) => {
            const room = rooms[roomCode];
            // Chỉ xử lý khi phòng tồn tại và game chưa bắt đầu
            if (room && !room.gameState) {
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    // Đảo ngược trạng thái sẵn sàng của người chơi (true -> false, false -> true)
                    player.isReady = !player.isReady;
                    // Thông báo cho tất cả mọi người trong phòng về danh sách người chơi đã cập nhật
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                }
            }
        });
	    socket.on('sendQuickChat', (data) => { // data: { roomCode, key, targetId }
    const room = rooms[data.roomCode];
    const sender = room?.players.find(p => p.id === socket.id);
    if (!sender) return;

    let message = '';
    const target = room.players.find(p => p.id === data.targetId);

    // Xây dựng tin nhắn ở server để đảm bảo an toàn
    switch(data.key) {
        case 'suspect':
            if (target) message = `Tôi nghi ngờ ${target.name}!`;
            break;
        case 'praise':
            message = `Nước đi hay lắm! 👍`;
            break;
        case 'hurry':
            message = `Mọi người ơi, nhanh lên nào! ⏰`;
            break;
    }

    if (message) {
        io.to(data.roomCode).emit('newMessage', {
            senderName: sender.name,
            message: message
        });
    }
});
        // ==========================================================
        // --- II. SỰ KIỆN QUẢN LÝ PHÒNG CHỜ (LOBBY EVENTS) ---
        // ==========================================================

        // Lắng nghe sự kiện khi người chơi muốn tạo phòng mới.
        socket.on('createRoom', data => {
            let code;
            // Tạo một mã phòng ngẫu nhiên và đảm bảo nó chưa tồn tại.
            do {
                code = Math.random().toString(36).substring(2, 6).toUpperCase();
            } while (rooms[code]);

            // Khởi tạo phòng mới trong biến 'rooms' toàn cục.
            rooms[code] = {
                players: [],
                hostId: socket.id, // Người tạo phòng là chủ phòng
                maxPlayers: 12,
                gameState: null      // gameState = null nghĩa là game chưa bắt đầu
            };
            console.log(`[Create] Người chơi ${socket.id} đã tạo phòng ${code}`);
            // Dùng hàm helper để xử lý việc tham gia phòng.
            handleJoinRoom(code, data.name);
        });

        // Lắng nghe sự kiện khi người chơi muốn tham gia phòng đã có.
        socket.on('joinRoom', data => {
            handleJoinRoom(data.roomCode?.trim().toUpperCase(), data.name);
        });

        // Lắng nghe sự kiện khi chủ phòng muốn thêm Bot.
        socket.on('addBot', roomCode => {
            const room = rooms[roomCode];
            // Kiểm tra: phòng phải tồn tại, người yêu cầu phải là chủ phòng, và phòng chưa đầy.
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
	    // THÊM MỚI: Lắng nghe sự kiện bỏ phiếu bỏ qua Phối hợp
socket.on('voteSkipCoordination', (roomCode) => {
    const room = rooms[roomCode];
    if (room && room.gameState && room.gameState.phase === 'coordination') {
        // Gọi logic để xử lý việc bỏ phiếu
        gameLogic.handleVoteToSkip(roomCode, socket.id, 'coordination', rooms, io);
    }
});

// THÊM MỚI: Lắng nghe sự kiện bỏ phiếu Nghỉ ngơi
socket.on('voteSkipTwilight', (roomCode) => {
    const room = rooms[roomCode];
    if (room && room.gameState && room.gameState.phase === 'twilight') {
        gameLogic.handleVoteToSkip(roomCode, socket.id, 'twilight', rooms, io);
    }
});

        // Lắng nghe sự kiện khi chủ phòng muốn đuổi một người chơi.
        socket.on('kickPlayer', (data) => {
    const room = rooms[data.roomCode];
    if (room && socket.id === room.hostId) {
        // Nếu là người chơi thật (socket tồn tại)
        const targetSocket = io.sockets.sockets.get(data.playerId);
        if (targetSocket) {
            targetSocket.emit('kicked');
            targetSocket.leave(data.roomCode);
        }
        // Nếu là bot hoặc người chơi thật, đều xóa khỏi danh sách
        room.players = room.players.filter(p => p.id !== data.playerId);
        // Nếu game đang chạy, cũng xóa khỏi gameState.players
        if (room.gameState) {
            room.gameState.players = room.gameState.players.filter(p => p.id !== data.playerId);
        }
        io.to(data.roomCode).emit('updatePlayerList', room.players, room.hostId);
    }
});

        // ==========================================================
        // --- III. SỰ KIỆN LUỒNG GAME (GAME FLOW EVENTS) ---
        // ==========================================================

        // Lắng nghe sự kiện khi chủ phòng bắt đầu game.
        socket.on('startGame', (roomCode) => {
            const room = rooms[roomCode];
            // Kiểm tra: phòng phải tồn tại, người yêu cầu là chủ phòng, và có ít nhất 2 người chơi.
            if (room && socket.id === room.hostId && room.players.length >= 2) {
                console.log(`[Start Game] Game bắt đầu tại phòng ${roomCode}`);
                // Gọi "Bộ Não" để tạo trạng thái game.
                room.gameState = gameLogic.createGameState(room.players);

                // Gửi vai trò riêng tư cho từng người chơi.
                room.gameState.players.forEach(p => {
                    if (!p.isBot) {
                        const roleData = { ...ROLES[p.roleId], id: p.roleId };
                        // Thêm thông tin đặc biệt cho Sát Thủ.
                        if (p.roleId === 'ASSASSIN' && p.bountyTargetId) {
                            const target = room.gameState.players.find(t => t.id === p.bountyTargetId);
                            if (target) {
                                roleData.description += ` **Mục tiêu** của bạn là: <strong>${target.name}</strong>.`;
                            }
                        }
                        io.to(p.id).emit('yourRoleIs', roleData);
                    }
                });

                // Thông báo cho tất cả người chơi rằng game đã bắt đầu.
                io.to(roomCode).emit('gameStarted', {
                    rolesInGame: room.gameState.rolesInGame.map(roleId => ({ id: roleId, name: ROLES[roleId].name }))
                });
                // Gọi "Bộ Não" để bắt đầu vòng chơi đầu tiên.
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });

        // Lắng nghe khi chủ phòng muốn bắt đầu một vòng mới (sau khi vòng trước kết thúc).
        socket.on('nextRound', roomCode => {
            const room = rooms[roomCode];
            // Chỉ chủ phòng mới có quyền này và game không được ở trạng thái kết thúc.
            if (room && socket.id === room.hostId && room.gameState?.phase !== 'gameover') {
                gameLogic.startNewRound(roomCode, rooms, io);
            }
        });
        
        // Lắng nghe khi người chơi muốn quay về sảnh chờ sau khi game kết thúc.
        socket.on('playAgain', (roomCode) => {
            const room = rooms[roomCode];
            if (room && socket.id === room.hostId && room.gameState?.phase === 'gameover') {
                room.gameState = null; // Reset trạng thái game.
                // Đưa tất cả người chơi trở về màn hình phòng chờ.
                io.to(roomCode).emit('backToLobby', { players: room.players, hostId: room.hostId });
            }
        });


        // ==========================================================
        // --- IV. SỰ KIỆN HÀNH ĐỘNG TRONG GAME (IN-GAME ACTIONS) ---
        // ==========================================================

        // Lắng nghe lựa chọn hành động (Giải Mã, Phá Hoại, Quan Sát).
        socket.on('playerChoice', data => {
            gameLogic.handlePlayerChoice(data.roomCode, socket.id, data.choice, rooms, io);
        });

        // Lắng nghe yêu cầu Phối Hợp.
        socket.on('requestCoordination', data => {
            gameLogic.handleCoordination(data.roomCode, socket.id, data.targetId, rooms, io);
        });

        // Lắng nghe yêu cầu Vạch Trần (Accusation).
        // SỬA ĐỔI: Tên sự kiện đã được đổi từ `requestTwilightAction` thành `requestAccusation` cho rõ ràng.
        // SỬA ĐỔI: Tham số truyền vào đã được sửa lại cho đúng với định nghĩa của hàm handleTwilightAction.
       socket.on('requestAccusation', data => { // data: { roomCode, targetId, guess }
            const room = rooms[data.roomCode];
            if (room && room.gameState) {
                // <-- NÂNG CẤP: Gửi sự kiện cho hiệu ứng hình ảnh ngay lập tức
                io.to(data.roomCode).emit('playerAccused', {
                    initiatorId: socket.id,
                    targetId: data.targetId
                });
            }
            // Sau đó mới gọi logic để xử lý kết quả
            gameLogic.handleTwilightAction(data.roomCode, socket.id, data.targetId, 'Vạch Trần', data.guess, rooms, io);
        });

        // Lắng nghe yêu cầu sử dụng kỹ năng đặc biệt của vai trò.
        socket.on('useRoleSkill', data => {
            gameLogic.handleUseSkill(socket, data.roomCode, data.payload, rooms, io);
        });
        
        // Lắng nghe sự kiện người chơi bỏ phiếu bỏ qua giai đoạn Hoàng Hôn.
        socket.on('playerVotedToSkip', (roomCode) => {
            const gs = rooms[roomCode]?.gameState;
            // SỬA: Kiểm tra đúng phase 'twilight'.
            if (!gs || gs.phase !== 'twilight') return;
            gs.roundData.votesToSkip.add(socket.id);
            const totalPlayers = gs.players.filter(p => !p.disconnected && !p.isDefeated).length;
            io.to(roomCode).emit('updateSkipVoteCount', gs.roundData.votesToSkip.size, totalPlayers);
            // Nếu tất cả đã bỏ phiếu, kết thúc giai đoạn.
            if (gs.roundData.votesToSkip.size >= totalPlayers) {
                // SỬA: Gọi đúng hàm endTwilightPhase.
                gameLogic.endTwilightPhase(roomCode, "Tất cả Thợ Săn đã đồng ý nghỉ ngơi qua hoàng hôn.", rooms, io);
            }
        });
		 // Lắng nghe kết quả từ Bùa Lú Lẫn
        socket.on('submitAmnesiaAction', (data) => {
            const room = rooms[data.roomCode];
            const gs = room?.gameState;
            // Chỉ người chơi được yêu cầu và trong đúng phase mới được thực hiện
            if (gs && gs.phase === 'amnesia_selection') {
                gameLogic.handleAmnesiaAction(data.roomCode, data, rooms, io);
            }
        });
		  socket.on('submitArenaPick', (data) => {
            // Xác thực: chỉ người chọn được chỉ định mới có quyền gửi
            // (Bạn có thể thêm logic xác thực chi tiết hơn)
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

        // Lắng nghe và phát lại tin nhắn chat.
        socket.on('sendMessage', (data) => {
            const room = rooms[data.roomCode];
            const player = room?.players.find(p => p.id === socket.id);
            if (room && player) {
                io.to(data.roomCode).emit('newMessage', {
                    senderName: player.name,
                    message: data.message.substring(0, 200) // Giới hạn độ dài tin nhắn
                });
            }
        });

        // ==========================================================
        // --- V. XỬ LÝ NGẮT KẾT NỐI (DISCONNECTION) ---
        // ==========================================================

        socket.on('disconnect', () => {
            console.log(`[Disconnect] Người chơi đã ngắt kết nối: ${socket.id}`);
            // Phải lặp qua tất cả các phòng để tìm xem người chơi này ở đâu.
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const playerIndex = room.players.findIndex(p => p.id === socket.id);

                if (playerIndex !== -1) {
                    // Nếu game đã bắt đầu, chỉ đánh dấu người chơi là "mất tích" chứ không xóa.
                    if (room.gameState) {
                        const playerInGame = room.gameState.players.find(p => p.id === socket.id);
                        if (playerInGame) {
                            playerInGame.disconnected = true;
                            playerInGame.name = `${playerInGame.name} (Mất tích)`;
                            io.to(roomCode).emit('playerDisconnected', { playerId: socket.id, newName: playerInGame.name });
                        }
                    } else {
                        // Nếu game chưa bắt đầu, xóa người chơi khỏi phòng chờ.
                        room.players.splice(playerIndex, 1);
                    }

                    // Nếu không còn người chơi thật nào, xóa phòng.
                    if (room.players.every(p => p.isBot || p.disconnected) && room.players.length > 0) {
                        console.log(`[Cleanup] Xóa phòng ${roomCode} vì không còn người chơi.`);
                        delete rooms[roomCode];
                        break; // Thoát vòng lặp vì đã xử lý xong.
                    }

                    // Nếu người ngắt kết nối là chủ phòng, chuyển quyền cho người chơi thật tiếp theo.
                    if (socket.id === room.hostId && !room.players.every(p => p.isBot)) {
                        const newHost = room.players.find(p => !p.isBot && !p.disconnected);
                        if (newHost) {
                            room.hostId = newHost.id;
                            console.log(`[Host Change] Chủ phòng mới của phòng ${roomCode} là ${newHost.name}`);
                        }
                    }
                    
                    // Cập nhật lại danh sách người chơi cho mọi người.
                    io.to(roomCode).emit('updatePlayerList', room.players, room.hostId);
                    break; // Thoát vòng lặp
                }
            }
        });
    });
}

// Xuất hàm initialize để server.js có thể gọi.
module.exports = { initialize };