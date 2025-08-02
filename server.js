// server.js
// ======================================================================
// PHIÊN BẢN TƯƠNG THÍCH VỚI RENDER - CẬP NHẬT ĐÚNG URL
// ======================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const socketHandler = require('./game/socketHandler');

// --- 1. Khởi tạo Server ---
const app = express();
const server = http.createServer(app);

// --- 2. Cấu hình Socket.IO cho Render ---
const io = new Server(server, {
    cors: {
        // =============================================================
        // --- ĐÂY LÀ DÒNG QUAN TRỌNG NHẤT CẦN SỬA ---
        // Sử dụng chính xác URL từ log của bạn
        origin: "https://tscv-6lrm.onrender.com", 
        // =============================================================
        methods: ["GET", "POST"]
    }
});

// --- 3. Cấu hình Express ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Thêm endpoint Health Check cho Render
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. Trạng thái toàn cục của Server ---
const rooms = {};

// --- 5. Khởi chạy Trình xử lý Socket ---
socketHandler.initialize(io, rooms);

// --- 6. Lắng nghe trên Port ---
// Render cung cấp port qua biến môi trường process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ đang lắng nghe trên cổng ${PORT}`);
});