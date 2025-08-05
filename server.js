// game/server.js

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler');

// --- 1. Khởi tạo Server ---
const app = express();
const server = http.createServer(app);

// --- 2. Cấu hình Socket.IO cho Render ---
// [SỬA LỖI] Cấu hình CORS và transports để tương thích với Render
const io = new Server(server, {
    cors: {
        origin: "*", // Cho phép tất cả các nguồn gốc, Render sẽ xử lý bảo mật ở lớp ngoài
        methods: ["GET", "POST"]
    },
    // [THÊM MỚI] Đảm bảo polling và websocket đều được cho phép
    transports: ['polling', 'websocket'] 
});


// --- 3. Cấu hình Express ---
app.use(express.static(path.join(__dirname, 'public')));
// Thêm endpoint Health Check cho Render
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// Route chính để gửi file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. Trạng thái toàn cục của Server ---
const rooms = {};

// --- 5. Khởi chạy Trình xử lý Socket ---
socketHandler.initialize(io, rooms);

// --- 6. Lắng nghe trên Port ---
const PORT = process.env.PORT || 3000;
// [SỬA LỖI] Xóa HOST = '0.0.0.0'. Express và Render sẽ tự xử lý điều này.
server.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ đang lắng nghe trên port ${PORT}`);
});