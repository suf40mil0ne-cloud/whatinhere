const ADJECTIVES = [
  "졸린", "급한", "느긋한", "신나는", "배고픈",
  "꼼꼼한", "대담한", "소심한", "의심많은", "용감한",
  "당당한", "수줍은", "부지런한", "게으른", "억울한",
  "뿌듯한", "억척스런", "고집센", "눈치빠른", "철두철미한",
  "겁많은", "호기심많은", "까다로운", "느려터진", "번개같은",
];

const NOUNS = [
  "입주민",        // 기본
  "관리소장",
  "경비아저씨",
  "경비아줌마",
  "세입자",
  "집주인",
  "부동산중개사",
  "청약당첨자",
  "재건축파",
  "갭투자자",
  "실거주자",
  "분양권자",
  "동대표",
  "층간소음민원인",
  "이사짐센터",
  "아파트관리단",
  "베란다텃밭러",
  "주차자리지킴이",
  "엘리베이터기다리는사람",
  "택배함지킴이",
  "헬스장단골",
  "놀이터감시단",
  "옥상산책러",
  "재활용분리왕",
  "스티커폭탄받은차주",
];

/**
 * 세션/로컬스토리지에 저장된 익명 닉네임을 반환하거나 새로 생성합니다.
 */
export function getAnonNickname(): string {
  const STORAGE_KEY = "whatsinhere_anon_nick";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch { /* ignore */ }

  const nick = generateAnonNickname();
  try { localStorage.setItem(STORAGE_KEY, nick); } catch { /* ignore */ }
  return nick;
}

/**
 * 랜덤 익명 닉네임을 생성합니다. (예: "급한 동대표 #4829")
 */
export function generateAnonNickname(): string {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const dong = Math.floor(Math.random() * 199) + 101; // 101–299동
  return `${dong}동 ${adj} ${noun}`;
}
