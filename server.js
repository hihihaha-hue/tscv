// server.js
// ======================================================================
// THỢ SĂN CỔ VẬT - SERVER BOOTSTRAP
// Nhiệm vụ chính: Khởi tạo server, Express, Socket.IO và kết nối các module.
// ======================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler'); // <-- Import module xử lý socket

// --- 1. Khởi tạo Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 2. Cấu hình Express ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 3. Trạng thái toàn cục của Server ---
// Biến rooms là trạng thái cốt lõi, cần được các module khác truy cập.
const rooms = {};

// --- 4. Khởi chạy Trình xử lý Socket ---
// Truyền instance `io` và object `rooms` vào module xử lý.
socketHandler.initialize(io, rooms);

// --- 5. Lắng nghe trên Port ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ đang lắng nghe trên cổng ${PORT}`);
}); // <-- Dấu ngoặc đóng của hàm callback server.listen