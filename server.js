require('dotenv').config();

// --- 1. IMPORTS ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketHandler = require('./game/socketHandler');
const User = require('./game/models/User');

// --- 3. KHAI BÁO CÁC HẰNG SỐ ---
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'chuoi-bi-mat-cua-ban';
const MONGO_URI = process.env.MONGO_URI;

// --- 4. KIỂM TRA BIẾN MÔI TRƯỜNG ---
if (!MONGO_URI) {
    console.error("[FATAL ERROR] MONGO_URI environment variable is NOT DEFINED.");
    process.exit(1);
}

// --- 5. KHỞI TẠO SERVER VÀ EXPRESS APP ---
const app = express();
const server = http.createServer(app);

// --- 6. EXPRESS MIDDLEWARE ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.use(express.json());

// --- 7. KẾT NỐI CƠ SỞ DỮ LIỆU MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] Kết nối MongoDB thành công.'))
    .catch(err => {
        console.error('[DB FATAL ERROR] Lỗi kết nối MongoDB!', err);
        process.exit(1);
    });

// --- 8. EXPRESS ROUTES (API ENDPOINTS) ---
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// API Đăng ký tài khoản mới
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).send('Vui lòng cung cấp đủ tên người dùng và mật khẩu.');
        }

        console.log(`[REGISTER ATTEMPT] User: '${username}'`);

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        
        // Lưu người dùng vào DB
        const savedUser = await newUser.save();

        // <<< LOGGING MỚI >>>
        console.log(`[REGISTER SUCCESS] User '${savedUser.username}' saved to DB with ID: ${savedUser._id}`);

        res.status(201).send('Đăng ký thành công!');
    } catch (error) {
        if (error.code === 11000) {
            console.warn(`[REGISTER FAIL] Username '${req.body.username}' already exists.`);
            return res.status(409).send('Tên người dùng đã tồn tại.');
        }
        // <<< LOGGING MỚI >>>
        console.error("[REGISTER ERROR]", error.message);
        res.status(500).send('Đã có lỗi xảy ra phía server khi đăng ký.');
    }
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp đủ tên người dùng và mật khẩu.' });
        }
        
        console.log(`[LOGIN ATTEMPT] Searching for user: '${username}'`);
        
        const user = await User.findOne({ username });

        // <<< LOGGING MỚI >>>
        if (!user) {
            console.warn(`[LOGIN FAIL] User not found: '${username}'`);
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }
        console.log(`[LOGIN] Found user in DB: ${user.username} (ID: ${user._id})`);

        const isMatch = await bcrypt.compare(password, user.password);
        
        // <<< LOGGING MỚI >>>
        console.log(`[LOGIN] Password match for '${username}': ${isMatch}`);

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
        // <<< LOGGING MỚI >>>
        console.error("[LOGIN ERROR]", error.message);
        res.status(500).json({ message: 'Đã có lỗi xảy ra phía server khi đăng nhập.' });
    }
});

// --- 9 & 10. SOCKET.IO ---
const io = new Server(server, { /* ... cấu hình cors ... */ });
const rooms = {};
socketHandler.initialize(io, rooms);

// --- 11. KHỞI CHẠY SERVER ---
server.listen(PORT, () => {
    console.log(`[SUCCESS] Server đang chạy trên cổng ${PORT}`);
});