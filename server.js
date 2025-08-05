
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler');

// --- 1. Khởi tạo Server ---
const app = express();
const server = http.createServer(app);

// --- 2. Cấu hình Socket.IO cho Render ---
// [SỬA LỖI] Cho phép nhiều nguồn gốc, bao gồm cả localhost để phát triển
const allowedOrigins = [
    "https://tscv-6lrm.onrender.com", 
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Cho phép các yêu cầu không có origin (ví dụ: ứng dụng di động, curl)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = 'Chính sách CORS không cho phép truy cập từ Origin này.';
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        methods: ["GET", "POST"]
    }
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
const HOST = '0.0.0.0'; // QUAN TRỌNG: Thêm dòng này

server.listen(PORT, HOST, () => {
    console.log(`[SERVER] Máy chủ đang lắng nghe trên ${HOST}:${PORT}`);
});