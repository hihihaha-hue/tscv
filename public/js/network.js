// public/js/network.js
// ======================================================================
// NETWORK MODULE ("The Messenger")
// Quản lý giao tiếp với server qua Socket.IO cho client.js
// ======================================================================
const Network = {
    socket: null,

    initialize() {
        if (!this.socket) {
            this.socket = io(); // Khởi tạo kết nối Socket.IO
        }
    },

    emit(eventName, data) {
        if (this.socket) {
            this.socket.emit(eventName, data);
        } else {
            console.error("Socket chưa được khởi tạo.");
        }
    },

    on(eventName, callback) {
        if (this.socket) {
            this.socket.on(eventName, callback);
        } else {
            console.error("Socket chưa được khởi tạo.");
        }
    }
};