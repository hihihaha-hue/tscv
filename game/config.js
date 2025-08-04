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
const SKILL_COSTS = [0, 1, 2, 3, 5, 10];
// --- II. DỮ LIỆU CÁC TIẾNG VỌNG (DECREES) ---
// Key: ID duy nhất của Tiếng Vọng.
// Value: Object chứa các thuộc tính. Các hàm trong này là "logic hooks".
const DECREES = {
    'VONG_AM_KHUECH_DAI': { id: 'VONG_AM_KHUECH_DAI', name: "Vọng Âm Khuếch Đại", description: "Tất cả Tiến Độ nhận được hoặc mất đi trong đêm nay sẽ được nhân đôi!" },
    'DEM_TINH_LANG': { id: 'DEM_TINH_LANG', name: "Đêm Tĩnh Lặng", description: "Hôm nay, cấm mọi hành vi Vạch Trần.", isTwilightDisabled: true },
    'BUA_LU_LAN': { id: 'BUA_LU_LAN', name: "Bùa Lú Lẫn", description: "Người có Tiến Độ thấp nhất có thể hoán đổi hành động của 2 người bất kỳ. Hai người bị hoán đổi sẽ không thể Vạch Trần hay Phối Hợp với nhau trong đêm nay." },
    'AO_GIAC_DICH_CHUYEN': { id: 'AO_GIAC_DICH_CHUYEN', name: "Ảo Giác Dịch Chuyển", description: "Tất cả người chơi đổi hành động của mình cho người bên cạnh theo vòng tròn. Vạch Trần và Phối Hợp bị vô hiệu hóa.", isTwilightDisabled: true, isCoordinationDisabled: true },
    'PHAN_XET_DAO_NGUOC': { id: 'PHAN_XET_DAO_NGUOC', name: "Phán Xét Đảo Ngược", description: "Phe nào có nhiều phiếu hơn sẽ thắng." },
    'GIAO_UOC_BAT_BUOC': { id: 'GIAO_UOC_BAT_BUOC', name: "Giao Ước Bắt Buộc", description: "Tất cả phải thực hiện Phối Hợp hoặc Vạch trần." },
    'CONG_NAP': { id: 'CONG_NAP', name: "Cống Nạp", description: "Vào cuối đêm, người có Tiến Độ cao nhất phải cống nạp 2 điểm cho người thấp nhất." },
    'LOI_NGUYEN_HI_HA': { id: 'LOI_NGUYEN_HI_HA', name: "Lời Nguyền Hỉ Hả", description: "Nếu có người bị mất điểm và rơi xuống mức âm, điểm của tất cả người đang âm sẽ được hồi về 0. Tuy nhiên, tất cả những người chơi khác lớn hơn 0 sẽ bị -1 điểm." },
    'LUA_CHON_CUA_KE_YEU': { id: 'LUA_CHON_CUA_KE_YEU', name: "Lựa Chọn Của Kẻ Yếu", description: "Phiếu 'Quan Sát' sẽ cộng thêm 1 phiếu cho phe đang có số lượng ít hơn." },
    'GIA_CUA_SU_THO_O': { id: 'GIA_CUA_SU_THO_O', name: "Cái Giá Của Sự Thờ Ơ", description: "Người 'Quan Sát' sẽ bị trừ điểm bằng với số phiếu 'Phá Hoại'." },
    'VU_DIEU_HON_LOAN': { id: 'VU_DIEU_HON_LOAN', name: "Vũ Điệu Hỗn Loạn", description: "Hành động của mọi người bị xáo trộn và chia lại ngẫu nhiên." },
    'DEM_SUY_TAN': { id: 'DEM_SUY_TAN', name: "Đêm Suy Tàn", description: "Phe thua cuộc bị chia đôi Tiến Độ. Hòa thì tất cả bị chia đôi." },
    'VU_NO_HU_VO': { id: 'VU_NO_HU_VO', name: "Vụ Nổ Hư Vô", description: "Nếu kết quả là hòa, Tiến Độ của tất cả mọi người sẽ bị reset về 0." },
    'THACH_THUC_KE_DAN_DAU': { id: 'THACH_THUC_KE_DAN_DAU', name: "Thách Thức Kẻ Dẫn Đầu", description: "Nếu bạn 'Vạch Trần' đúng người chơi đang có điểm cao nhất, bạn sẽ tráo đổi toàn bộ Tiến Độ của mình với họ." },
    'DI_SAN_KE_TIEN_PHONG': { id: 'DI_SAN_KE_TIEN_PHONG', name: "Di Sản Kẻ Tiên Phong", description: "Người chiến thắng đêm nay được quyền chọn Tiếng Vọng cho đêm sau." },
    'DAU_TRUONG_SINH_TU': { id: 'DAU_TRUONG_SINH_TU', name: "Đấu Trường Sinh Tử", description: "Người thấp điểm nhất chọn ra hai 'Đấu Sĩ' buộc phải 'Vạch Trần' lẫn nhau. Khán Giả sẽ đặt cược tối đa 2 Tiến Độ vào Đấu Sĩ mà họ tin sẽ thắng. Cược đúng được nhân đôi số điểm đã cược." },
    'DEM_SONG_TRUNG': { id: 'DEM_SONG_TRUNG', name: "Đêm Song Trùng", description: "Sẽ có hai Tiếng Vọng được áp dụng trong cùng một đêm." }
};

// --- III. DỮ LIỆU CÁC VAI TRÒ (ROLES) 
const ROLES = {
    'PROPHET': {
        name: "Nhà Tiên Tri",
        description: {
            win: "Thắng nếu Vạch Trần thành công 3 lần LIÊN TIẾP và điểm >= 2/3 mốc thắng.",
            passive: "Vạch Trần sai chỉ bị -1 điểm.",
            skill: "Xem hành động của 1 người."
        }, hasActiveSkill: true, skillName: "Thiên Lý Nhãn"
    },
    'PEACEMAKER': {
        name: "Người Gìn Giữ Hòa Bình",
        description: {
            win: "Thắng nếu có 3 đêm HÒA liên tiếp.",
            passive: "Nhận +1 điểm mỗi khi HÒA.",
            skill: "Vô hiệu hóa phiếu của 1 người."
        }, hasActiveSkill: true, skillName: "Hòa Giải"
    },
    'GAMBLER': {
        name: "Kẻ Đánh Cược",
        description: {
            win: "Thắng nếu đã từng đạt chính xác +7 và -7 điểm.",
            passive: "Mọi điểm bị mất có 50% bị chia đôi, 50% bị nhân đôi.",
            skill: "Nếu phe bạn chọn thắng nhận +8 điểm, thua bị -4 điểm."
        }, hasActiveSkill: true, skillName: "Tất Tay"
    },
    'INQUISITOR': {
        name: "Kẻ Phán Xử",
        description: {
            win: "Thắng khi đạt điểm cơ bản (15, 20...).",
            passive: "Vạch Trần thành công kẻ 'Phá Hoại', nhận thêm +1 điểm.",
            skill: "Tất cả người chọn 'Phá Hoại' bị trừ điểm bằng số người đã Phá Hoại."
        }, hasActiveSkill: true, skillName: "Phán Quyết"
    },
    'MAGNATE': {
        name: "Nhà Tài Phiệt",
        description: {
            win: "Thắng khi đạt mốc điểm cao nhất (20, 25, hoặc 30).",
            passive: "Cuối đêm, nếu điểm > 0 nhận +1, nếu điểm < 0 bị -1.",
            skill: "Chọn 1 người, nếu phe họ thắng, cả hai cùng nhận thêm +2 điểm."
        }, hasActiveSkill: true, skillName: "Đầu Tư"
    },
    'BALANCER': {
        name: "Người Cân Bằng",
        description: {
            win: "Thắng nếu tổng điểm dương = giá trị đối của tổng điểm âm và đang có ít nhất 2/3 số điểm để thắng.",
            passive: "Nhận +1 điểm nếu số người điểm dương = số người điểm âm.",
            skill: "Điểm của người cao nhất và thấp nhất được tính trung bình cộng và chia cho cả 2."
        }, hasActiveSkill: true, skillName: "Tái Phân Bố"
    },
    'REBEL': {
        name: "Kẻ Nổi Loạn",
        description: {
            win: "Thắng nếu bạn thắng 3 đêm là người duy nhất của phe thắng.",
            passive: "Hành động của bạn không thể bị thay đổi.",
            skill: "Tuyên bố 1 hành động, nếu là người duy nhất làm, chọn 1 người để trừ điểm bằng chi phí kỹ năng đã trả (ít nhất 1)."
        }, hasActiveSkill: true, skillName: "Khiêu Khích"
    },
    'PRIEST': {
        name: "Thầy Tế",
        description: {
            win: "Thắng khi đạt điểm cơ bản (15, 20...).",
            passive: "Ban phước đúng người bị mất điểm, bạn được số điểm bằng số chi phí mất để dùng kĩ năng (tối thiểu là 1).",
            skill: "Chọn 1 người để họ không bị mất điểm trong đêm đó."
        }, hasActiveSkill: true, skillName: "Thánh Nữ Ban Phước"
    },
    'THIEF': {
        name: "Kẻ Trộm",
        description: {
            win: "Thắng khi đạt điểm cơ bản (15, 20...).",
            passive: "Nếu >= 2 người mất điểm, bạn nhận thêm điểm bằng (số người mất điểm / 2, làm tròn xuống).",
            skill: "Chọn 1 người, nếu họ được cộng điểm, bạn cắp một nửa số điểm đó."
        }, hasActiveSkill: true, skillName: "Móc Túi"
    },
    'MIND_BREAKER': {
        name: "Kẻ Tẩy Não",
        description: {
            win: "Thắng nếu có 5 đêm Vạch Trần thất bại nhưng không phải do chính bạn vạch trần.",
            passive: "Mỗi lần có Vạch Trần thất bại, bạn nhận +2 điểm.",
            skill: "Chọn 1 người, hành động của họ trong đêm đó do BẠN quyết định."
        }, hasActiveSkill: true, skillName: "Điều Khiển"
    },
    'CULTIST': {
        name: "Kẻ Hiến Tế",
        description: {
            win: "Thắng nếu đạt -15 điểm.",
            passive: "Mỗi khi mất điểm, được giảm 1 điểm mất mát.",
            skill: "Tự mất 2 điểm để nhận 1 trong 3 hiệu ứng ngẫu nhiên (thấy vai trò, vô hiệu hóa kỹ năng, phiếu x3)."
        }, hasActiveSkill: true, skillName: "Nghi Thức Hắc Ám"
    },
    'DOUBLE_AGENT': {
        name: "Kẻ Hai Mang",
        description: {
            win: "Thắng khi đạt mốc điểm cao nhất (20, 25, hoặc 30).",
            passive: "Nếu bạn không thuộc phe thắng, được +1 điểm.",
            skill: "Tất cả phiếu 'Quan Sát' trở thành phiếu cho phe đối nghịch với hành động của bạn."
        }, hasActiveSkill: true, skillName: "Xuyên Tạc"
    },
    'ASSASSIN': {
        name: "Sát Thủ",
        description: {
            win: "Thắng khi đạt điểm cơ bản (15, 20...).",
            passive: "Ai Vạch Trần/Phối Hợp với bạn, bạn biết hành động của họ đêm sau.",
            skill: "[Bị Động] Được giao 1 'Mục Tiêu'."
        }, hasActiveSkill: false, skillName: "Đánh Dấu"
    },
    'PHANTOM': {
        name: "Bóng Ma",
        description: {
            win: "Thắng khi Ám Quẻ thành công 5 lần.",
            passive: "Phiếu của bạn không được tính, thay vào đó bạn luôn nhận +1 điểm cuối đêm.",
            skill: "Ám 1 người. Nếu họ được cộng điểm, họ mất 1 điểm, bạn nhận 1 điểm, và lần ám tiếp theo của bạn miễn phí."
        }, hasActiveSkill: true, skillName: "Ám Quẻ"
    },
    'MIMIC': {
        name: "Kẻ Bắt Chước",
        description: {
            win: "Thắng khi đạt điểm cơ bản (15, 20...).",
            passive: "Không tự chọn hành động, mà tự động sao chép hành động của 1 người ngẫu nhiên (bạn biết đó là ai).",
            skill: "Nếu người bạn bắt chước có kỹ năng kích hoạt, bạn có thể trả 2 điểm để dùng ké kỹ năng của họ."
        }, hasActiveSkill: true, skillName: "Đánh Cắp Năng Lực"
    },
};
// --- IV. EXPORTS ---
const ALL_DECREE_IDS = Object.keys(DECREES);
const ALL_ROLE_IDS = Object.keys(ROLES);

module.exports = {
    ...GAME_CONSTANTS,
    DECREES,
    ROLES,
    ALL_DECREE_IDS,
    ALL_ROLE_IDS,
	   SKILL_COSTS, 
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