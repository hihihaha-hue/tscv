// game/server.js
// ======================================================================
// SERVER ENTRY POINT ("The Heart")
// PHIÊN BẢN HOÀN CHỈNH: Tái cấu trúc, an toàn và xử lý lỗi mạnh mẽ.
//
// File này có nhiệm vụ:
// 1. Khởi tạo và cấu hình server Express.
// 2. Thiết lập và tích hợp server Socket.IO.
// 3. Phục vụ các file tĩnh (HTML, CSS, JS) cho client.
// 4. Khởi chạy trình xử lý logic game (socketHandler).
// 5. Lắng nghe kết nối trên một cổng (port) và xử lý lỗi khởi động.
// ======================================================================

// --- 1. Imports ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler'); // Logic xử lý chính của game

// --- 2. Constants ---
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// --- 3. Server & Socket.IO Initialization ---
const app = express();
const server = http.createServer(app);

// --- 4. CORS Configuration for Socket.IO ---
// [UPGRADE] Cho phép cả tên miền production và localhost để dễ dàng phát triển
const allowedOrigins = [
    "https://thosancovat.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

const corsOptions = {
    origin: function (origin, callback) {
        // Cho phép kết nối không có origin (ví dụ: mobile apps, curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'Chính sách CORS không cho phép truy cập từ Origin này.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST"]
};

const io = new Server(server, {
    cors: corsOptions,
    transports: ['polling', 'websocket']
});

console.log(`[SERVER] Chế độ CORS được thiết lập cho các origins:`, allowedOrigins);

// --- 5. Express Middleware ---
const publicPath = path.join(__dirname, 'public'); 
app.use(express.static(publicPath));
console.log(`[SERVER] Phục vụ các file tĩnh từ: ${publicPath}`);

// --- 6. Express Routes ---
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- 7. Socket.IO Integration ---
try {
    console.log('[SERVER] Đang khởi tạo Trình xử lý Socket (socketHandler)...');
    const rooms = {}; // Trạng thái toàn cục chứa tất cả các phòng chơi
    socketHandler.initialize(io, rooms);
    console.log('[SERVER] Trình xử lý Socket đã được khởi tạo thành công.');
} catch (error) {
    console.error('[FATAL ERROR] Không thể khởi tạo socketHandler. Lỗi:', error);
    process.exit(1);
}

// --- 8. Start Server ---
try {
    server.listen(PORT, () => {
        console.log(`[SUCCESS] Server đang chạy ở chế độ '${NODE_ENV}'.`);
        console.log(`[SUCCESS] Lắng nghe thành công trên cổng: ${PORT}`);
        console.log('===================================================');
        console.log('         THỢ SĂN CỔ VẬT ĐÃ SẴN SÀNG!');
        console.log('===================================================');
    });
} catch (error) {
    console.error(`[FATAL ERROR] Không thể khởi động server trên cổng ${PORT}.`);
    console.error('Lỗi chi tiết:', error);
    process.exit(1);
}