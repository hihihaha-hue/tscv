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
const socketHandler = require('./game/socketHandler');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt =require('jsonwebtoken');
const User = require('./game/models/User');

// --- 2. Constants ---
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
// QUAN TRỌNG: Bạn nên lưu các chuỗi bí mật này trong biến môi trường
const JWT_SECRET = process.env.JWT_SECRET || 'chuoi-bi-mat-cua-ban';


// --- 3. Server & App Initialization ---
const app = express();
const server = http.createServer(app);

// --- 4. Express Middleware ---
// Middleware phải được khai báo SAU KHI `app` được khởi tạo
const publicPath = path.join(__dirname, 'public'); 
app.use(express.static(publicPath));
// Dòng này RẤT QUAN TRỌNG để đọc được `req.body` từ các request API
app.use(express.json());

// --- 5. Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] Kết nối MongoDB thành công.'))
    .catch(err => {
        console.error('[DB FATAL ERROR] Lỗi kết nối MongoDB! Server sẽ không thể hoạt động đúng.', err);
        process.exit(1); // Thoát server nếu không kết nối được DB
    });

// --- 6. Express Routes (API Endpoints) ---
// Các routes phải được khai báo SAU KHI middleware và DB được thiết lập
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// API Đăng ký
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Kiểm tra xem dữ liệu có được gửi lên không
        if (!username || !password) {
            return res.status(400).send('Vui lòng cung cấp đủ tên người dùng và mật khẩu.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).send('Đăng ký thành công!');
    } catch (error) {
        // Kiểm tra lỗi trùng tên người dùng
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
        // 1. Lấy dữ liệu từ body của request
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp đủ tên người dùng và mật khẩu.' });
        }

        // 2. Tìm người dùng trong database bằng username
        const user = await User.findOne({ username });

        // 3. Nếu không tìm thấy người dùng, trả về lỗi.
        //    Sử dụng một thông báo lỗi chung để tăng tính bảo mật (không tiết lộ username có tồn tại hay không).
        if (!user) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }

        // 4. So sánh mật khẩu được gửi lên với mật khẩu đã được hash trong DB
        const isMatch = await bcrypt.compare(password, user.password);

        // 5. Nếu mật khẩu không khớp, trả về lỗi.
        if (!isMatch) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }

        // 6. Nếu xác thực thành công, tạo JSON Web Token (JWT)
        const payload = {
            userId: user._id, // Thông tin quan trọng nhất để định danh người dùng
            username: user.username
        };
        
        const token = jwt.sign(
            payload,
            JWT_SECRET, // Sử dụng chuỗi bí mật đã định nghĩa ở đầu file
            { expiresIn: '7d' } // Token sẽ hết hạn sau 7 ngày
        );

        // 7. Gửi token và thông tin cơ bản của người dùng về cho client
        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: {
                id: user._id,
                username: user.username,
                level: user.level // Gửi thêm level hoặc các thông tin khác nếu cần
            }
        });

    } catch (error) {
        console.error("[Login Error]", error);
        res.status(500).json({ message: 'Đã có lỗi xảy ra phía server.' });
    }
});


// --- 7. CORS & Socket.IO Initialization ---
const allowedOrigins = [ "https://thosancovat.onrender.com", "http://localhost:3000", "http://127.0.0.1:3000" ];
const corsOptions = { /* ... giữ nguyên ... */ };
const io = new Server(server, { cors: corsOptions, transports: ['polling', 'websocket'] });

// --- 8. Socket.IO Integration ---
try {
    console.log('[SERVER] Đang khởi tạo Trình xử lý Socket...');
    const rooms = {};
    socketHandler.initialize(io, rooms);
    console.log('[SERVER] Trình xử lý Socket đã khởi tạo thành công.');
} catch (error) {
    console.error('[SOCKET FATAL ERROR] Không thể khởi tạo socketHandler:', error);
    process.exit(1);
}

// --- 9. Start Server ---
server.listen(PORT, () => {
    console.log(`[SUCCESS] Server đang chạy ở chế độ '${NODE_ENV}' trên cổng ${PORT}`);
    console.log('===================================================');
    console.log('         THỢ SĂN CỔ VẬT ĐÃ SẴN SÀNG!');
    console.log('===================================================');
});