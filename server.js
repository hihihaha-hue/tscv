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
// --- 0. CẤU HÌNH BIẾN MÔI TRƯỜNG ---
// Dòng này PHẢI được đặt ở trên cùng để đảm bảo các biến môi trường
// từ file .env được tải trước khi chúng được sử dụng ở bất kỳ đâu khác.
require('dotenv').config();


// --- 1. IMPORTS CÁC THƯ VIỆN CẦN THIẾT ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 2. IMPORTS CÁC MODULE TỰ VIẾT ---
const socketHandler = require('./game/socketHandler'); // Logic xử lý game
const User = require('./game/models/User');            // Model người dùng


// --- 3. KHAI BÁO CÁC HẰNG SỐ VÀ CẤU HÌNH ---
// Lấy cổng từ biến môi trường của Render, nếu không có thì dùng cổng 3000 (cho máy local)
const PORT = process.env.PORT || 3000;
// Chuỗi bí mật để tạo và giải mã JSON Web Token
const JWT_SECRET = process.env.JWT_SECRET || 'chuoi-bi-mat-cua-ban'; // Nên đặt JWT_SECRET trong biến môi trường trên Render
// Lấy chuỗi kết nối MongoDB từ biến môi trường
const MONGO_URI = process.env.MONGO_URI;


// --- 4. GỠ LỖI BIẾN MÔI TRƯỜNG (Rất quan trọng cho việc triển khai) ---
console.log("--- DEBUGGING ENVIRONMENT VARIABLES ---");
if (MONGO_URI) {
    console.log("[OK] MONGO_URI variable has been found.");
    console.log("     Value starts with:", MONGO_URI.substring(0, 20) + "...");
} else {
    // Nếu không tìm thấy biến MONGO_URI, in ra lỗi và thoát ngay lập tức
    console.error("[FATAL ERROR] MONGO_URI environment variable is NOT DEFINED.");
    console.error("            Please set it in your hosting provider's environment settings (e.g., Render.com).");
    process.exit(1); // Thoát server với mã lỗi, ngăn không cho server chạy khi thiếu cấu hình
}
console.log("-------------------------------------");


// --- 5. KHỞI TẠO SERVER VÀ EXPRESS APP ---
const app = express();
const server = http.createServer(app);


// --- 6. EXPRESS MIDDLEWARE ---
// Cung cấp các file tĩnh (HTML, CSS, JS client, ảnh...) từ thư mục 'public'
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
// Middleware để Express có thể đọc và hiểu dữ liệu JSON từ body của request API
app.use(express.json());


// --- 7. KẾT NỐI CƠ SỞ DỮ LIỆU MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] Kết nối MongoDB thành công.'))
    .catch(err => {
        console.error('[DB FATAL ERROR] Lỗi kết nối MongoDB! Server sẽ không thể hoạt động đúng.', err);
        process.exit(1); // Thoát server nếu không kết nối được DB
    });


// --- 8. EXPRESS ROUTES (API ENDPOINTS) ---
// Route cơ bản để kiểm tra sức khỏe của server
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// Route chính, trả về file index.html cho người dùng
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// API Đăng ký tài khoản mới
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).send('Vui lòng cung cấp đủ tên người dùng và mật khẩu.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).send('Đăng ký thành công!');
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).send('Tên người dùng đã tồn tại.');
        }
        console.error("[Register Error]", error);
        res.status(500).send('Đã có lỗi xảy ra phía server.');
    }
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp đủ tên người dùng và mật khẩu.' });
        }
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }
        const payload = { userId: user._id, username: user.username };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: { id: user._id, username: user.username, level: user.level }
        });

    } catch (error) {
        console.error("[Login Error]", error);
        res.status(500).json({ message: 'Đã có lỗi xảy ra phía server.' });
    }
});


// --- 9. KHỞI TẠO VÀ CẤU HÌNH SOCKET.IO ---
const allowedOrigins = [ "https://thosancovat.onrender.com", "http://localhost:3000", "http://127.0.0.1:3000" ];
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Cho phép các request không có origin (ví dụ: mobile apps, Postman) hoặc từ các domain trong danh sách
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"]
    }
});

// --- 10. TÍCH HỢP LOGIC GAME VỚI SOCKET.IO ---
try {
    console.log('[SERVER] Đang khởi tạo Trình xử lý Socket...');
    const rooms = {}; // Đối tượng để lưu trữ trạng thái tất cả các phòng
    socketHandler.initialize(io, rooms);
    console.log('[SERVER] Trình xử lý Socket đã khởi tạo thành công.');
} catch (error) {
    console.error('[SOCKET FATAL ERROR] Không thể khởi tạo socketHandler:', error);
    process.exit(1);
}

// --- 11. KHỞI CHẠY SERVER ---
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`[SUCCESS] Server đang chạy trên cổng ${PORT}`);
    console.log(`         THỢ SĂN CỔ VẬT ĐÃ SẴN SÀNG!`);
    console.log(`===================================================`);
});