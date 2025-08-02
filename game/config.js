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
    'VONG_AM_KHUECH_DAI': { id: 'VONG_AM_KHUECH_DAI', name: "Vọng Âm Khuếch Đại", description: "Tất cả Tiến Độ nhận được hoặc mất đi trong đêm nay sẽ được nhân đôi!" },
    'DEM_TINH_LANG': { id: 'DEM_TINH_LANG', name: "Đêm Tĩnh Lặng", description: "Cấm mọi hành vi Vạch Trần và Phối Hợp.", isChaosDisabled: true },
    'BUA_LU_LAN': { id: 'BUA_LU_LAN', name: "Bùa Lú Lẫn", description: "Người có Tiến Độ thấp nhất có thể hoán đổi hành động của 2 người bất kỳ." },
    'AO_GIAC_DICH_CHUYEN': { id: 'AO_GIAC_DICH_CHUYEN', name: "Ảo Giác Dịch Chuyển", description: "Tất cả người chơi đổi hành động của mình cho người bên cạnh theo vòng tròn.", isChaosDisabled: true },
    'PHAN_XET_DAO_NGUOC': { id: 'PHAN_XET_DAO_NGUOC', name: "Phán Xét Đảo Ngược", description: "Phe thường thắng (ít phiếu) giờ sẽ thua, và ngược lại." },
    'GIAO_UOC_BAT_BUOC': { id: 'GIAO_UOC_BAT_BUOC', name: "Giao Ước Bắt Buộc", description: "Tất cả phải thực hiện Vạch Trần hoặc Phối Hợp." },
    'CONG_NAP': { id: 'CONG_NAP', name: "Cống Nạp", description: "Người có Tiến Độ cao nhất phải cống nạp 2 điểm cho người thấp nhất." },
    'LOI_NGUYEN_HI_HA': { id: 'LOI_NGUYEN_HI_HA', name: "Lời Nguyền Hỉ Hả", description: "Ai rơi xuống điểm âm sẽ về 0, nhưng những người khác bị -1 điểm." },
    'LUA_CHON_CUA_KE_YEU': { id: 'LUA_CHON_CUA_KE_YEU', name: "Lựa Chọn Của Kẻ Yếu", description: "Phiếu 'Quan Sát' sẽ cộng thêm 1 phiếu cho phe đang có số lượng ít hơn." },
    'GIA_CUA_SU_THO_O': { id: 'GIA_CUA_SU_THO_O', name: "Cái Giá Của Sự Thờ Ơ", description: "Người 'Quan Sát' sẽ bị trừ điểm bằng với số phiếu 'Phá Hoại'." },
    'VU_DIEU_HON_LOAN': { id: 'VU_DIEU_HON_LOAN', name: "Vũ Điệu Hỗn Loạn", description: "Hành động của mọi người bị xáo trộn và chia lại ngẫu nhiên." },
    'DEM_SUY_TAN': { id: 'DEM_SUY_TAN', name: "Đêm Suy Tàn", description: "Phe thua cuộc bị chia đôi Tiến Độ. Hòa thì tất cả bị chia đôi." },
    'VU_NO_HU_VO': { id: 'VU_NO_HU_VO', name: "Vụ Nổ Hư Vô", description: "Nếu kết quả là hòa, Tiến Độ của tất cả mọi người sẽ bị reset về 0." },
    'THACH_THUC_KE_DAN_DAU': { id: 'THACH_THUC_KE_DAN_DAU', name: "Thách Thức Kẻ Dẫn Đầu", description: "Vạch Trần đúng người cao điểm nhất, bạn sẽ tráo đổi toàn bộ Tiến Độ với họ." },
    'DI_SAN_KE_TIEN_PHONG': { id: 'DI_SAN_KE_TIEN_PHONG', name: "Di Sản Kẻ Tiên Phong", description: "Người chiến thắng đêm nay được chọn Tiếng Vọng cho đêm sau." },
    'DAU_TRUONG_SINH_TU': { id: 'DAU_TRUONG_SINH_TU', name: "Đấu Trường Sinh Tử", description: "Hai người thấp điểm nhất đấu tay đôi, những người khác đặt cược." },
    'DEM_SONG_TRUNG': { id: 'DEM_SONG_TRUNG', name: "Đêm Song Trùng", description: "Sẽ có hai Tiếng Vọng được áp dụng trong cùng một đêm." }
};
// --- III. DỮ LIỆU CÁC VAI TRÒ (ROLES) ---
const ROLES = {
    'PROPHET': {
        name: "Nhà Tiên Tri",
        description: "Thắng nếu Vạch Trần thành công 3 lần LIÊN TIẾP VÀ điểm >= 2/3 mốc thắng. Nội tại: Vạch Trần sai chỉ bị -1 điểm. Kĩ năng: Xem hành động của 1 người.",
        hasActiveSkill: true,
        skillName: "Thiên Lý Nhãn"
    },
    'PEACEMAKER': {
        name: "Người Gìn Giữ Hòa Bình",
        description: "Thắng nếu có 3 đêm HÒA liên tiếp. Nội tại: Nhận +1 điểm mỗi khi HÒA. Kĩ năng: Vô hiệu hóa phiếu của 1 người.",
        hasActiveSkill: true,
        skillName: "Hòa Giải"
    },
    'GAMBLER': {
        name: "Kẻ Đánh Cược",
        description: "Thắng nếu đã từng đạt chính xác +7 và -7 điểm. Nội tại: Mọi điểm bị mất có 50% bị chia đôi, 50% bị nhân đôi. Kĩ năng: Nếu phe bạn chọn thắng nhận +8 điểm, thua bị -4 điểm.",
        hasActiveSkill: true,
        skillName: "Tất Tay"
    },
    'INQUISITOR': {
        name: "Kẻ Phán Xử",
        description: "Thắng khi đạt 15 điểm. Nội tại: Vạch Trần thành công kẻ 'Phá Hoại', nhận thêm +1 điểm. Kĩ năng: Tất cả người chọn 'Phá Hoại' bị trừ điểm bằng số người đã Phá Hoại.",
        hasActiveSkill: true,
        skillName: "Phán Quyết"
    },
    'MAGNATE': {
        name: "Nhà Tài Phiệt",
        description: "Thắng khi đạt mốc điểm cao nhất (20, 25, hoặc 30). Nội tại: Cuối đêm, nếu điểm > 0 nhận +1, nếu điểm < 0 bị -1. Kĩ năng: Chọn 1 người, nếu phe họ thắng, cả hai cùng nhận thêm +2 điểm.",
        hasActiveSkill: true,
        skillName: "Đầu Tư"
    },
    'BALANCER': {
        name: "Người Cân Bằng",
        description: "Thắng nếu tổng điểm dương = giá trị đối của tổng điểm âm. Nội tại: Nhận +1 điểm nếu số người điểm dương = số người điểm âm. Kĩ năng: Điểm của người cao nhất và thấp nhất được tính trung bình cộng.",
        hasActiveSkill: true,
        skillName: "Tái Phân Bố"
    },
    'REBEL': {
        name: "Kẻ Nổi Loạn",
        description: "Thắng nếu bạn thắng 3 đêm là người duy nhất của phe thắng. Nội tại: Hành động của bạn không thể bị thay đổi. Kĩ năng: Tuyên bố 1 hành động, nếu là người duy nhất làm, chọn 1 người để trừ điểm bằng chi phí kỹ năng đã trả.",
        hasActiveSkill: true,
        skillName: "Khiêu Khích"
    },
    'PRIEST': {
        name: "Thầy Tế",
        description: "Thắng khi đạt điểm cơ bản. Nội tại: Ban phước đúng người bị mất điểm, bạn được +1 điểm. Kĩ năng: Chọn 1 người để họ không bị mất điểm trong đêm đó.",
        hasActiveSkill: true,
        skillName: "Thánh Nữ Ban Phước"
    },
    'THIEF': {
        name: "Kẻ Trộm",
        description: "Thắng khi đạt 15 điểm. Nội tại: Nếu >= 2 người mất điểm, bạn nhận thêm điểm. Kĩ năng: Chọn 1 người, nếu họ được cộng điểm, bạn cắp một nửa số điểm đó.",
        hasActiveSkill: true,
        skillName: "Móc Túi"
    },
    'MIND_BREAKER': {
        name: "Kẻ Tẩy Não",
        description: "Thắng nếu có 5 đêm Vạch Trần thất bại. Nội tại: Mỗi lần có Vạch Trần thất bại, bạn nhận +2 điểm. Kĩ năng: Chọn 1 người, hành động của họ trong đêm đó do BẠN quyết định.",
        hasActiveSkill: true,
        skillName: "Điều Khiển"
    },
    'CULTIST': {
        name: "Kẻ Hiến Tế",
        description: "Thắng nếu đạt -15 điểm. Nội tại: Mỗi khi mất điểm, được giảm 1 điểm mất mát. Kĩ năng: Tự mất 2 điểm để nhận 1 trong 3 hiệu ứng ngẫu nhiên.",
        hasActiveSkill: true,
        skillName: "Nghi Thức Hắc Ám"
    },
    'DOUBLE_AGENT': {
        name: "Kẻ Hai Mang",
        description: "Thắng khi đạt mốc điểm cao nhất (20, 25, hoặc 30). Nội tại: Nếu bạn không thuộc phe thắng, được +1 điểm. Kĩ năng: Tất cả phiếu 'Quan Sát' trở thành phiếu cho phe đối nghịch với hành động của bạn.",
        hasActiveSkill: true,
        skillName: "Xuyên Tạc"
    },
    'ASSASSIN': {
        name: "Sát Thủ",
        description: "Thắng khi đạt 15 điểm. Nội tại: Ai Vạch Trần/Phối Hợp với bạn, bạn biết hành động của họ đêm sau. Kĩ năng: Được giao 1 'Mục Tiêu', Vạch Trần đúng họ sẽ chia đôi điểm của họ.",
        hasActiveSkill: false, // Kỹ năng chính là bị động
        skillName: "Đánh Dấu"
    },
    'PHANTOM': {
        name: "Bóng Ma",
        description: "Thắng khi Ám Quẻ thành công 5 lần. Nội tại: Phiếu của bạn không được tính, thay vào đó bạn luôn nhận +1 điểm. Kĩ năng: Ám 1 người. Nếu họ được cộng điểm, bạn cắp 1 điểm và lần ám tiếp theo miễn phí.",
        hasActiveSkill: true,
        skillName: "Ám Quẻ"
    },
    'MIMIC': {
        name: "Kẻ Bắt Chước",
        description: "Thắng khi đạt điểm cơ bản. Nội tại: Tự động sao chép hành động của 1 người ngẫu nhiên. Kĩ năng: Trả 2 điểm để dùng ké kỹ năng của người bạn đang bắt chước.",
        hasActiveSkill: true,
        skillName: "Đánh Cắp Năng Lực"
    },
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