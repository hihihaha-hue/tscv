// game/config.js
// ======================================================================
// GAME CONFIGURATION ("The Rulebook")
// Chứa toàn bộ dữ liệu tĩnh của game: hằng số, vai trò, tiếng vọng.
// Đây là nơi duy nhất bạn cần sửa để thay đổi tên, mô tả, hoặc các chỉ số cơ bản.
// ======================================================================

// --- I. HẰNG SỐ CỦA GAME ---
const GAME_CONSTANTS = {
    CHOICE_DURATION: 30,      // Thời gian (giây) cho giai đoạn lựa chọn
    CHAOS_DURATION: 30,       // Thời gian (giây) cho giai đoạn hoàng hôn
    DECREE_REVEAL_DELAY: 5000 // Thời gian (ms) chờ sau khi công bố Tiếng Vọng
};

// --- II. DỮ LIỆU CÁC TIẾNG VỌNG (DECREES) ---
// Key: ID duy nhất của Tiếng Vọng.
// Value: Object chứa các thuộc tính. Các hàm trong này là "logic hooks".
const DECREES = {
    "VONG_AM": { 
        name: "Đêm Vọng Âm", 
        description: "Mọi Tiến Độ nhận được hoặc mất đi trong đêm nay sẽ được NHÂN ĐÔI!", 
        getPointMultiplier: () => 2 
    },
    "VE_BINH_TUAN_TRA": { 
        name: "Vệ Binh Tuần Tra", 
        description: "Đêm nay, Vệ Binh tuần tra gắt gao. Cấm mọi hành vi Vạch Trần và Phối Hợp.", 
        isChaosDisabled: true 
    },
    "LOI_NGUYEN_DAO_NGUOC": { 
        name: "Lời Nguyền Đảo Ngược", 
        description: "Lời nguyền khiến ngôi đền hỗn loạn! Phe có ít người hơn sẽ thành công.", 
        determineWinner: (giaiMaCount, phaHoaiCount) => (giaiMaCount === phaHoaiCount ? null : (giaiMaCount < phaHoaiCount ? 'Giải Mã' : 'Phá Hoại')) 
    },
    "CONG_NAP": { 
        name: "Cống Nạp Cho Vệ Binh", 
        description: "Cuối đêm, mỗi người có Tiến Độ cao nhất phải cống nạp 2 điểm cho mỗi người có Tiến Độ thấp nhất.", 
        // Hook này chạy sau khi điểm đã được tính xong
        endOfRoundEffect: (gs, results, pointMultiplier) => { 
            const highestPlayers = getPlayersByScore(gs.players, 'highest'); 
            const lowestPlayers = getPlayersByScore(gs.players, 'lowest'); 
            if (highestPlayers.length > 0 && lowestPlayers.length > 0 && highestPlayers[0].id !== lowestPlayers[0].id) { 
                const tax = 2 * pointMultiplier;
                highestPlayers.forEach(h => {
                    h.score -= tax * lowestPlayers.length;
                });
                lowestPlayers.forEach(l => {
                    l.score += tax * highestPlayers.length;
                });
                results.messages.push(`📜 **Sự cống nạp** đã được thực hiện!`); 
            } 
        } 
    },
    "AO_GIAC": { 
        name: "Ảo Giác", 
        description: "Mọi người hoán đổi hành động cho người bên cạnh (theo chiều kim đồng hồ).", 
        isChaosDisabled: true, 
        // Hook này chạy ngay khi Tiếng Vọng được công bố
        onReveal: (gs, io, roomCode) => { 
            const activePlayers = gs.players.filter(p => !p.isDefeated && p.chosenAction); 
            if (activePlayers.length < 2) return; 
            const chosenActions = activePlayers.map(p => p.chosenAction); 
            for (let i = 0; i < activePlayers.length; i++) { 
                const nextActionIndex = (i + 1) % activePlayers.length;
                activePlayers[i].chosenAction = chosenActions[nextActionIndex]; 
            } 
            io.to(roomCode).emit('logMessage', { type: 'warning', message: "🌀 Mọi hành động đã bị hoán đổi trong cơn ảo giác!" }); 
        } 
    },
    "BUA_LU_LAN": { 
        name: "Bùa Lú Lẫn", 
        description: "Người có Tiến Độ thấp nhất được hoán đổi hành động của 2 người bất kỳ.", 
        onReveal: (gs, io, roomCode, drawerId, rooms) => {
            const drawer = gs.players.find(p => p.id === drawerId);
            if (!drawer) return;

            if (drawer.isBot) {
                // logic.js sẽ cần import hàm này
                handleBotAmnesia(roomCode, drawerId, rooms, io);
            } else {
                gs.phase = 'special_action'; // Chuyển game sang trạng thái đặc biệt
                io.to(drawerId).emit('promptAmnesiaAction', { players: gs.players.map(p => ({ id: p.id, name: p.name })) }); 
                io.to(roomCode).except(drawerId).emit('logMessage', { type: 'warning', message: `🧠 Đang chờ ${drawer.name} yểm bùa...`}); 
            }
        } 
    },
    // TIẾNG VỌNG MỚI ĐÃ THÊM
    "DEM_CAM_LANG": {
        name: "Đêm Câm Lặng",
        description: "Một sức mạnh cổ xưa bao trùm ngôi đền, mọi kỹ năng đặc biệt đều bị vô hiệu hóa trong đêm nay."
    },
};

// --- III. DỮ LIỆU CÁC VAI TRÒ (ROLES) ---
// Key: ID duy nhất của vai trò.
// Value: Object chứa các thuộc tính.
const ROLES = {
    'SURVIVOR': { name: "Kẻ Sống Sót", description: "Thắng nếu bạn là người cuối cùng chưa từng bị âm Tiến Độ." },
    'PROPHET': { name: "Nhà Tiên Tri", description: "Thắng nếu bạn Vạch Trần đúng 3 lần. Dùng kỹ năng để nhìn thấy lựa chọn của 1 người.", hasActiveSkill: true, skillName: "Thiên Lý Nhãn" },
    'PEACEMAKER': { name: "Người Gìn Giữ Hòa Bình", description: "Thắng nếu có 3 đêm HÒA liên tiếp." },
    'SAINT': { name: "Thánh Sống", description: "Thắng nếu đạt 10 Tiến Độ mà chưa từng chọn 'Phá Hoại'. Lá phiếu 'Giải Mã' của bạn được tính là 2 phiếu.", hasActiveSkill: false /* Kỹ năng bị động */ },
    'TURNCOAT': { name: "Kẻ Lật Mặt", description: "Thắng nếu đạt 12 Tiến Độ và đã dùng đủ 3 hành động (Giải Mã, Phá Hoại, Quan Sát) trong 3 đêm gần nhất." },
    'PUPPETEER': { name: "Kẻ Thao Túng", description: "Thắng nếu 'Con Rối' bí mật của bạn thắng. Dùng kỹ năng để hoán đổi lựa chọn của 'Con Rối' với 1 người khác.", hasActiveSkill: true, skillName: "Giật Dây" },
    'GAMBLER': { name: "Kẻ Đánh Cược", description: "Thắng nếu đã từng đạt chính xác 7 và -7 Tiến Độ." },
    'INQUISITOR': { name: "Kẻ Phán Xử", description: "Thắng ở 15 Tiến Độ. Dùng kỹ năng để trừng phạt tất cả những kẻ đã chọn 'Phá Hoại' trong đêm, khiến họ bị -3 Tiến Độ.", hasActiveSkill: true, skillName: "Phán Quyết" },
    'MAGNATE': { name: "Nhà Tài Phiệt", description: "Nhận +1 Tiến Độ mỗi đêm nếu điểm của bạn > 0, và -1 nếu điểm < 0. Thắng nếu đạt 20 Tiến Độ." },
    'JEALOUS': { name: "Kẻ Ganh Ghét", description: "Thắng nếu vào cuối đêm, tất cả người chơi có Tiến Độ cao hơn bạn đều bị trừ điểm." },
    'BALANCER': { name: "Người Cân Bằng", description: "Thắng nếu cuối đêm, số người có Tiến Độ dương bằng số người có Tiến Độ âm (và phải > 0)." },
    'REBEL': { name: "Kẻ Nổi Loạn", description: "Thắng nếu bạn thắng 3 đêm với tư cách là thành viên duy nhất của phe thắng." },
    'OUTLAW': { name: "Kẻ Ngoại Pháp", description: "Miễn nhiễm với việc bị trừ Tiến Độ từ Tiếng Vọng. Thắng ở 15 Tiến Độ." },
    'ASSASSIN': { name: "Sát Thủ", description: "Thắng ở 15 Tiến Độ và phải ám sát thành công. Dùng kỹ năng để đoán đúng vai trò của 1 người và chia đôi Tiến Độ của họ.", hasActiveSkill: true, skillName: "Ám Sát" },
    // VAI TRÒ MỚI ĐÃ THÊM
    'PRIEST': { name: "Thầy Tế", description: "Mỗi đêm, dùng kỹ năng để ban phước cho 1 người. Người được ban phước sẽ không bị mất Tiến Độ trong đêm đó.", hasActiveSkill: true, skillName: "Thánh Nữ Ban Phước" },
};

// --- IV. EXPORTS ---
// Tạo các mảng ID để dễ dàng lặp qua hoặc chọn ngẫu nhiên
const ALL_DECREE_IDS = Object.keys(DECREES);
const ALL_ROLE_IDS = Object.keys(ROLES);

// Xuất tất cả mọi thứ để các module khác có thể sử dụng
module.exports = {
    ...GAME_CONSTANTS, // Trải các hằng số ra
    DECREES,
    ROLES,
    ALL_DECREE_IDS,
    ALL_ROLE_IDS
};

// --- V. CÁC HÀM TIỆN ÍCH NỘI BỘ (Không được export, chỉ dùng trong file này) ---
// Đặt hàm này ở đây để DECREES có thể sử dụng nó, giữ cho logic.js sạch sẽ hơn.
function getPlayersByScore(players, type) {
    const activePlayers = players.filter(p => !p.isDefeated && !p.disconnected);
    if (activePlayers.length === 0) return [];
    const scores = activePlayers.map(p => p.score);
    const criticalScore = type === 'highest' ? Math.max(...scores) : Math.min(...scores);
    return activePlayers.filter(p => p.score === criticalScore);
}