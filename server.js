// ======================================================================
// THỢ SĂN CỔ VẬT - SERVER ENTRY POINT
// Nhiệm vụ: Khởi tạo server, Express, Socket.IO và kết nối các module game.
// ======================================================================

// --- 1. IMPORT CÁC MODULE CẦN THIẾT ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler'); // Import module xử lý socket

// --- 2. KHỞI TẠO SERVER VÀ EXPRESS ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Cho phép kết nối từ mọi nguồn
        methods: ["GET", "POST"]
    }
});

// --- 3. CẤU HÌNH EXPRESS ĐỂ PHỤC VỤ CÁC FILE CHO CLIENT ---
// Cung cấp các file trong thư mục 'public' (client.js, style.css, index.html, assets)
app.use(express.static(path.join(__dirname, 'public')));

// Route mặc định sẽ trả về file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. KHAI BÁO TRẠNG THÁI TOÀN CỤC ---
// Biến `rooms` là trạng thái cốt lõi, lưu trữ dữ liệu của tất cả các phòng chơi.
// Nó sẽ được truyền vào và chỉnh sửa bởi các module khác.
const rooms = {};

// --- 5. KHỞI CHẠY BỘ ĐIỀU KHIỂN SOCKET ---
// Gọi hàm `initialize` từ module `socketHandler` và
// truyền vào instance `io` và object `rooms` để nó có thể bắt đầu hoạt động.
socketHandler.initialize(io, rooms);

// --- 6. CHẠY SERVER VÀ LẮNG NGHE TRÊN PORT ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ "Thợ Săn Cổ Vật" đang lắng nghe trên cổng ${PORT}`);
    console.log(`[SERVER] Mở trình duyệt và truy cập http://localhost:${PORT} để bắt đầu.`);
});