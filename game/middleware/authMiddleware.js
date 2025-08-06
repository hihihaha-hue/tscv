// game/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'chuoi-bi-mat-cua-ban';

const authMiddleware = (req, res, next) => {
    // 1. Lấy token từ header của request
    // Định dạng chuẩn là: "Authorization: Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Tách để lấy phần token

    // 2. Nếu không có token, từ chối truy cập
    if (!token) {
        return res.status(401).json({ message: 'Không có quyền truy cập. Vui lòng đăng nhập.' });
    }

    // 3. Xác thực token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            // Nếu token không hợp lệ (sai, hết hạn...), từ chối truy cập
            return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
        }

        // 4. Nếu token hợp lệ, lưu thông tin người dùng vào request
        // để các route phía sau có thể sử dụng.
        req.user = decoded; 
        
        // 5. Cho phép request đi tiếp đến logic chính
        next();
    });
};

module.exports = authMiddleware;