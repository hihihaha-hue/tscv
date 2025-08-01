// public/client.js
// ======================================================================
// CLIENT INITIALIZER ("The Conductor")
// Nhiệm vụ: Khởi tạo ứng dụng, định nghĩa trạng thái và kết nối các module.
// ======================================================================

// --- I. TRẠNG THÁI TOÀN CỤC CỦA CLIENT (THE "SINGLE SOURCE OF TRUTH") ---
// Đây là "bộ não" của client. Mọi thông tin đều được lưu ở đây.
// Các module khác (UI, Network) sẽ đọc và ghi vào object này.
const state = {
    myId: null,             // ID socket của người chơi này
    currentRoomCode: null,  // Mã phòng hiện tại
    currentHostId: null,    // ID của trưởng đoàn
    players: [],            // Danh sách người chơi trong phòng [{id, name, isBot}, ...]
    gamePhase: null,        // Giai đoạn hiện tại của game ('choice', 'chaos', 'reveal'...)
    countdownTimer: null,   // Biến chứa bộ đếm ngược (để có thể xóa khi cần)
    myRole: null,           // Object chứa thông tin vai trò của người chơi này
    
    // Nơi lưu trữ danh sách các vai trò có trong ván chơi.
    // Sẽ được cập nhật từ server khi game bắt đầu.
    possibleRoles: {}       
};

// --- II. KHỞI TẠO CÁC MODULE ---
// "Đưa bộ não vào các bộ phận khác"
// Cung cấp (inject) object `state` cho UI và Network để chúng có thể truy cập và sửa đổi.
// Thứ tự khởi tạo ở đây không quá quan trọng, nhưng logic là UI cần có trước để Network có thể gọi.
UI.initialize(state);
Network.initialize(state);

// --- III. GÁN CÁC SỰ KIỆN TĨNH BAN ĐẦU ---
// Gán sự kiện click cho các nút luôn có mặt trên trang khi tải lần đầu.
// Các nút động (được tạo ra trong quá trình chơi) sẽ được gán sự kiện trong module UI.

// Sự kiện cho các nút ở màn hình chính (Home Screen)
UI.homeElements.createRoomBtn.addEventListener('click', () => {
    UI.playSound('click'); // Phát âm thanh phản hồi
    // Gọi module Network để gửi yêu cầu lên server
    Network.emit('createRoom', { name: UI.homeElements.nameInput.value });
});

UI.homeElements.joinRoomBtn.addEventListener('click', () => {
    UI.playSound('click');
    const code = UI.homeElements.roomCodeInput.value;
    if (code) { // Chỉ gửi nếu người dùng đã nhập mã phòng
        Network.emit('joinRoom', { roomCode: code, name: UI.homeElements.nameInput.value });
    } else {
        // Có thể thêm thông báo lỗi ở đây nếu muốn
        UI.homeElements.roomCodeInput.focus();
    }
});

// Sự kiện cho các nút ở phòng chờ (Room Screen) - Chỉ Host mới thấy và tương tác được
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');

    Network.emit('addBot', state.currentRoomCode);
});

UI.roomElements.startGameBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('startGame', state.currentRoomCode);
});

// Ghi log ra console để xác nhận client đã được khởi tạo thành công
// Rất hữu ích cho việc debug.
console.log("Client application initialized successfully. Waiting for connection...");