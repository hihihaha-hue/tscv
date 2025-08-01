// game/config.js

const DECREES = {
    "VONG_AM": { name: "Đêm Vọng Âm", description: "Mọi Tiến Độ nhận được hoặc mất đi trong đêm nay sẽ nhân đôi!", getPointMultiplier: () => 2 },
    "VE_BINH_TUAN_TRA": { name: "Vệ Binh Tuần Tra", description: "Đêm nay, Vệ Binh tuần tra gắt gao. Cấm mọi hành vi Vạch Trần và Phối Hợp.", isChaosDisabled: true },
    "LOI_NGUYEN_DAO_NGUOC": { name: "Lời Nguyền Đảo Ngược", description: "Lời nguyền khiến ngôi đền hỗn loạn! Nhóm đông hơn sẽ thành công.", determineWinner: (c, t) => (c === t ? null : (c > t ? 'Giải Mã' : 'Phá Hoại')) },
    "CONG_NAP": { name: "Cống Nạp Cho Vệ Binh", description: "Cuối đêm, người có Tiến Độ cao nhất phải cống nạp 2 điểm cho người thấp nhất.", endOfRoundEffect: (gs, results, pointMultiplier) => { const h = getPlayersByScore(gs.players, 'highest'); const l = getPlayersByScore(gs.players, 'lowest'); if (h.length > 0 && l.length > 0 && h[0].id !== l[0].id) { const tax = 2 * pointMultiplier; h.forEach(p => p.score -= tax); l.forEach(p => p.score += tax * h.length / l.length); results.messages.push(`📜 **Sự cống nạp** đã được thực hiện!`); } } },
    "AO_GIAC": { name: "Ảo Giác", description: "Mọi người hoán đổi hành động cho người bên cạnh.", isChaosDisabled: true, onReveal: (gs, io, roomCode) => { const a = gs.players.filter(p => !p.isDefeated && p.chosenAction); if (a.length < 2) return; const c = a.map(p => p.chosenAction); for (let i = 0; i < a.length; i++) { a[i].chosenAction = c[(i === 0) ? a.length - 1 : i - 1]; } io.to(roomCode).emit('actionsSwapped', { message: "🌀 Mọi hành động đã bị hoán đổi trong cơn ảo giác!" }); } },
    "BUA_LU_LAN": { name: "Bùa Lú Lẫn", description: "Người có Tiến Độ thấp nhất được hoán đổi hành động của 2 người.", onReveal: (gs, io, roomCode, drawerId) => { const drawer = gs.players.find(p => p.id === drawerId); if (drawer.isBot) handleBotAmnesia(roomCode, drawerId); else { gs.phase = 'special_action'; io.to(drawerId).emit('promptAmnesiaAction', { players: gs.players.map(p => ({ id: p.id, name: p.name })) }); io.to(roomCode).except(drawerId).emit('logMessage', { type: 'warning', message: `🧠 Đang chờ ${drawer.name} yểm bùa...`}); } } },
};

const ROLES = {
    'SURVIVOR': { name: "Kẻ Sống Sót", description: "Thắng nếu bạn là người cuối cùng chưa từng bị âm Tiến Độ." },
    'PROPHET': { name: "Nhà Tiên Tri", description: "Thắng nếu bạn Vạch Trần đúng 3 lần.", hasActiveSkill: true, skillName: "Thiên Lý Nhãn", skillDescription: "Nhìn thấy lựa chọn của 1 người." },
    'PEACEMAKER': { name: "Người Gìn Giữ Hòa Bình", description: "Thắng nếu có 3 đêm HÒA liên tiếp." },
    'SAINT': { name: "Thánh Sống", description: "Thắng nếu đạt 10 Tiến Độ mà chưa từng chọn 'Phá Hoại'.", hasActiveSkill: true, skillName: "Thánh Quang Hộ Thể", skillDescription: "Lá phiếu 'Giải Mã' của bạn được tính là 2 phiếu." },
    'TURNCOAT': { name: "Kẻ Lật Mặt", description: "Thắng nếu đạt 12 Tiến Độ và đã dùng đủ 3 hành động trong 3 đêm gần nhất." },
    'PUPPETEER': { name: "Kẻ Thao Túng", description: "Thắng nếu 'Con Rối' bí mật của bạn thắng.", hasActiveSkill: true, skillName: "Giật Dây", skillDescription: "Hoán đổi lựa chọn của 'Con Rối' với 1 người khác." },
    'GAMBLER': { name: "Kẻ Đánh Cược", description: "Thắng nếu đã từng đạt chính xác 7 và -7 Tiến Độ." },
    'INQUISITOR': { name: "Kẻ Phán Xử", description: "Thắng ở 15 Tiến Độ. Dùng kỹ năng để trừng phạt những kẻ 'Phá Hoại'.", hasActiveSkill: true, skillName: "Phán Quyết", skillDescription: "Khiến tất cả người chọn 'Phá Hoại' bị -3 Tiến Độ." },
    'MAGNATE': { name: "Nhà Tài Phiệt", description: "Nhận lãi/phạt mỗi đêm. Thắng nếu đạt 20 Tiến Độ." },
    'JEALOUS': { name: "Kẻ Ganh Ghét", description: "Thắng nếu vào cuối đêm, tất cả người chơi có Tiến Độ cao hơn bạn đều bị trừ điểm." },
    'BALANCER': { name: "Người Cân Bằng", description: "Thắng nếu số người có Tiến Độ dương bằng số người có Tiến Độ âm." },
    'REBEL': { name: "Kẻ Nổi Loạn", description: "Thắng nếu bạn thắng 3 đêm với tư cách là thành viên duy nhất của phe thắng." },
    'OUTLAW': { name: "Kẻ Ngoại Pháp", description: "Miễn nhiễm với việc bị trừ Tiến Độ từ Tiếng Vọng. Thắng ở 15 Tiến Độ." },
    'ASSASSIN': { name: "Sát Thủ", description: "Thắng ở 15 Tiến Độ và phải ám sát thành công.", hasActiveSkill: true, skillName: "Ám Sát", skillDescription: "Đoán đúng vai trò của 1 người để chia đôi Tiến Độ của họ." },
};

const ALL_DECREE_IDS = Object.keys(DECREES);
const ALL_ROLE_IDS = Object.keys(ROLES);

// Xuất các hằng số này ra để file khác có thể dùng
module.exports = {
    DECREES,
    ROLES,
    ALL_DECREE_IDS,
    ALL_ROLE_IDS,
    CHOICE_DURATION: 30,
    CHAOS_DURATION: 30,
    DECREE_REVEAL_DELAY: 5000,
};