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
// Khởi chạy module mạng và truyền 'state' vào cho nó.
// Module UI không cần initialize vì nó chỉ là một object chứa các hàm.
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

// Sự kiện cho các nút ở phòng chờ (Room Screen)
UI.roomElements.addBotBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('addBot', state.currentRoomCode);
});

UI.roomElements.startGameBtn.addEventListener('click', () => {
    UI.playSound('click');
    Network.emit('startGame', state.currentRoomCode);
});

// Ghi log ra console để xác nhận client đã được khởi tạo thành công
console.log("Client application initialized successfully. Waiting for connection...");


// --- IV. RULEBOOK LOGIC ---
document.getElementById('rulebook-btn').addEventListener('click', () => {
    UI.playSound('click');
    // Dùng SweetAlert2 để hiển thị modal
    Swal.fire({
        title: 'Sách Luật Thợ Săn Cổ Vật',
       html: `
            <div class="rulebook-content">
                <h3>Cách Chơi</h3>
                <p>Mỗi đêm diễn ra qua 4 giai đoạn: Hành Động, Tiếng Vọng, Giờ Hoàng Hôn, và Kết Quả. Mục tiêu của bạn là hoàn thành Thiên Mệnh (điều kiện thắng riêng) hoặc đạt đủ Tiến Độ trước người khác.</p>
                
                <h3>Các Vai Trò (15)</h3>
                <ul>
                    <li><strong>Nhà Tiên Tri:</strong> Thắng nếu Vạch Trần đúng 3 lần LIÊN TIẾP và điểm >= 2/3 mốc thắng. Nội tại: Vạch Trần sai chỉ bị -1 điểm. Kĩ năng: Xem hành động của 1 người.</li>
                    <li><strong>Người Gìn Giữ Hòa Bình:</strong> Thắng nếu có 3 đêm HÒA liên tiếp. Nội tại: Nhận +1 điểm mỗi khi HÒA. Kĩ năng: Vô hiệu hóa phiếu của 1 người.</li>
                    <li><strong>Kẻ Đánh Cược:</strong> Thắng nếu đã từng đạt chính xác +7 và -7 điểm. Nội tại: Mọi điểm bị mất có 50% bị chia đôi, 50% bị nhân đôi. Kĩ năng: Nếu phe thắng nhận +8 điểm, thua bị -4.</li>
                    <li><strong>Kẻ Phán Xử:</strong> Thắng khi đạt 15 điểm. Nội tại: Vạch Trần đúng kẻ 'Phá Hoại', nhận thêm +1 điểm. Kĩ năng: Tất cả người chọn 'Phá Hoại' bị trừ điểm bằng số người đã Phá Hoại.</li>
                    <li><strong>Nhà Tài Phiệt:</strong> Thắng khi đạt mốc điểm cao nhất. Nội tại: Cuối đêm, nếu điểm > 0 nhận +1, nếu điểm < 0 bị -1. Kĩ năng: Chọn 1 người, nếu phe họ thắng, cả hai nhận +2 điểm.</li>
                    <li><strong>Người Cân Bằng:</strong> Thắng nếu tổng điểm dương = giá trị đối của tổng điểm âm. Nội tại: Nhận +1 điểm nếu số người điểm dương = số người điểm âm. Kĩ năng: Điểm của người cao nhất và thấp nhất được tính trung bình cộng.</li>
                    <li><strong>Kẻ Nổi Loạn:</strong> Thắng nếu thắng 3 đêm là người duy nhất của phe thắng. Nội tại: Hành động không thể bị thay đổi. Kĩ năng: Tuyên bố hành động, nếu là người duy nhất làm, chọn 1 người để trừ điểm.</li>
                    <li><strong>Thầy Tế:</strong> Thắng khi đạt điểm cơ bản. Nội tại: Ban phước đúng người bị mất điểm, bạn được +1 điểm. Kĩ năng: Chọn 1 người để họ không bị mất điểm.</li>
                    <li><strong>Kẻ Trộm:</strong> Thắng khi đạt 15 điểm. Nội tại: Nếu >= 2 người mất điểm, bạn nhận thêm điểm. Kĩ năng: Chọn 1 người, nếu họ được cộng điểm, bạn cắp một nửa.</li>
                    <li><strong>Kẻ Tẩy Não:</strong> Thắng nếu có 5 đêm Vạch Trần thất bại. Nội tại: Mỗi lần có Vạch Trần thất bại, bạn nhận +2 điểm. Kĩ năng: Chọn 1 người và quyết định hành động của họ.</li>
                    <li><strong>Kẻ Hiến Tế:</strong> Thắng nếu đạt -15 điểm. Nội tại: Mọi điểm bị mất được giảm 1. Kĩ năng: Tự mất 2 điểm để nhận 1 trong 3 hiệu ứng ngẫu nhiên.</li>
                    <li><strong>Kẻ Hai Mang:</strong> Thắng khi đạt mốc điểm cao nhất. Nội tại: Nếu không thuộc phe thắng, được +1 điểm. Kĩ năng: Tất cả phiếu 'Quan Sát' trở thành phiếu cho phe đối nghịch với bạn.</li>
                    <li><strong>Sát Thủ:</strong> Thắng khi đạt 15 điểm. Nội tại: Ai Vạch Trần/Phối Hợp với bạn, bạn biết hành động của họ đêm sau. Kĩ năng: Được giao 1 'Mục Tiêu' và trừng phạt họ.</li>
                    <li><strong>Bóng Ma:</strong> Thắng khi Ám Quẻ thành công 5 lần. Nội tại: Phiếu không tính, luôn nhận +1 điểm. Kĩ năng: Ám 1 người, nếu họ được cộng điểm, bạn cắp 1 điểm và lần sau miễn phí.</li>
                    <li><strong>Kẻ Bắt Chước:</strong> Thắng khi đạt điểm cơ bản. Nội tại: Tự động sao chép hành động của 1 người ngẫu nhiên. Kĩ năng: Trả 2 điểm để dùng ké kỹ năng của người bị bắt chước.</li>
                </ul>

                <h3>Các Tiếng Vọng (17)</h3>
                <ul>
                    <li><strong>Vọng Âm Khuếch Đại:</strong> Mọi điểm nhận hoặc mất trong đêm được nhân đôi.</li>
                    <li><strong>Đêm Tĩnh Lặng:</strong> Cấm Vạch Trần và Phối Hợp.</li>
                    <li><strong>Bùa Lú Lẫn:</strong> Người thấp điểm nhất hoán đổi hành động của 2 người.</li>
                    <li><strong>Ảo Giác Dịch Chuyển:</strong> Tất cả người chơi đổi hành động cho người bên cạnh.</li>
                    <li><strong>Phán Xét Đảo Ngược:</strong> Phe thường thắng giờ sẽ thua, và ngược lại.</li>
                    <li><strong>Giao Ước Bắt Buộc:</strong> Tất cả phải Vạch Trần hoặc Phối Hợp.</li>
                    <li><strong>Cống Nạp:</strong> Người cao điểm nhất cống nạp 2 điểm cho người thấp nhất.</li>
                    <li><strong>Lời Nguyền Hỉ Hả:</strong> Ai rơi xuống điểm âm sẽ về 0, những người khác bị -1 điểm.</li>
                    <li><strong>Lựa Chọn Của Kẻ Yếu:</strong> Phiếu 'Quan Sát' sẽ cộng cho phe đang yếu thế hơn.</li>
                    <li><strong>Cái Giá Của Sự Thờ Ơ:</strong> Người 'Quan Sát' bị trừ điểm bằng số phiếu 'Phá Hoại'.</li>
                    <li><strong>Vũ Điệu Hỗn Loạn:</strong> Hành động của mọi người bị xáo trộn và chia lại ngẫu nhiên.</li>
                    <li><strong>Đêm Suy Tàn:</strong> Phe thua cuộc bị chia đôi Tiến Độ. Hòa thì tất cả bị chia đôi.</li>
                    <li><strong>Vụ Nổ Hư Vô:</strong> Nếu kết quả là hòa, điểm của tất cả mọi người reset về 0.</li>
                    <li><strong>Thách Thức Kẻ Dẫn Đầu:</strong> Vạch Trần đúng người cao điểm nhất, bạn tráo đổi điểm với họ.</li>
                    <li><strong>Di Sản Kẻ Tiên Phong:</strong> Người thắng đêm nay được chọn Tiếng Vọng cho đêm sau.</li>
                    <li><strong>Đấu Trường Sinh Tử:</strong> Hai người thấp điểm nhất đấu tay đôi, những người khác đặt cược.</li>
                    <li><strong>Đêm Song Trùng:</strong> Có hai Tiếng Vọng được áp dụng trong cùng một đêm.</li>
                </ul>
            </div>
            `,
        width: '80%',
        customClass: {
            container: 'rulebook-modal'
        },
        background: '#2d3748',
        color: '#e2e8f0',
        confirmButtonText: 'Đã Hiểu'
    });
});

// --- V. CHAT LOGIC ---
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message) {
        Network.emit('sendMessage', {
            roomCode: state.currentRoomCode,
            message: message
        });
        chatInput.value = '';
    }
}

sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});