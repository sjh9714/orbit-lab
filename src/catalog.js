import { createOrbit } from "./models/orbit.js";
import { createRover } from "./models/rover.js";
import { createDrone } from "./models/drone.js";
import { createLander } from "./models/lander.js";
import { createSatellite } from "./models/satellite.js";

export const modelDefinitions = [
  {
    id: "orbit",
    name: "ORBIT",
    number: "01",
    title: "행성 탐사 로봇",
    shortTitle: "탐사 로봇",
    filename: "orbit-01.glb",
    tagline: ["작은 몸체,", "커다란 호기심."],
    description:
      "처음 만나는 행성도 두렵지 않도록. 늘 한 걸음 곁에서 탐험하는 당신의 작은 탐사 동료입니다.",
    caption: "준비됐어. 함께 가자!",
    personality: "호기심 많음",
    specialty: "낯선 곳에서 친구 만들기",
    actionLabel: "손인사",
    photo: { focus: 'Head', direction: [1.5, .7, 8] },
    create: createOrbit,
    icon: '<rect x="12" y="9" width="24" height="18" rx="5"/><circle cx="19" cy="18" r="3"/><circle cx="29" cy="18" r="3"/><path d="M24 9V4m-8 24v10h16V28M16 38v5m16-5v5M12 31l-5 5m29-5 5-7"/>',
  },
  {
    id: "rover",
    name: "ROVER",
    number: "02",
    title: "지형 탐사 로버",
    shortTitle: "탐사 로버",
    filename: "rover-02.glb",
    tagline: ["길이 없어도,", "계속 앞으로."],
    description:
      "울퉁불퉁한 지형을 여섯 바퀴로 가볍게. 작은 발견 하나도 놓치지 않는 든든한 지상 탐험가입니다.",
    caption: "오늘은 어느 길로 가볼까?",
    personality: "묵묵하고 끈기 있음",
    specialty: "미지의 땅에 첫 바퀴 자국 남기기",
    actionLabel: "바퀴 구동",
    photo: { focus: 'Binocular-camera-head', direction: [2, 1, 8] },
    create: createRover,
    icon: '<path d="M10 24h28v10H10zm14 0V14m-6 0h13V7H18zM8 34h32"/><circle cx="11" cy="37" r="5"/><circle cx="24" cy="37" r="5"/><circle cx="37" cy="37" r="5"/>',
  },
  {
    id: "drone",
    name: "SCOUT",
    number: "03",
    title: "공중 정찰 드론",
    shortTitle: "정찰 드론",
    filename: "scout-03.glb",
    tagline: ["조금 더 높이,", "조금 더 멀리."],
    description:
      "네 개의 프로펠러로 새로운 시선을 찾아갑니다. 지상에서 보이지 않던 풍경을 전해주는 하늘의 눈입니다.",
    caption: "위에서 보면 다를 거야.",
    personality: "가볍고 자유로움",
    specialty: "탐사대 앞길을 먼저 살펴보기",
    actionLabel: "프로펠러",
    photo: { focus: 'Main-survey-lens', direction: [1.5, .7, 8] },
    create: createDrone,
    icon: '<rect x="16" y="18" width="16" height="13" rx="5"/><path d="m17 19-7-7m21 7 7-7M17 30l-7 7m21-7 7 7"/><ellipse cx="9" cy="10" rx="7" ry="3"/><ellipse cx="39" cy="10" rx="7" ry="3"/><ellipse cx="9" cy="38" rx="7" ry="3"/><ellipse cx="39" cy="38" rx="7" ry="3"/><circle cx="24" cy="25" r="3"/>',
  },
  {
    id: "lander",
    name: "LANDER",
    number: "04",
    title: "달 착륙 탐사선",
    shortTitle: "달 착륙선",
    filename: "lander-04.glb",
    tagline: ["낯선 별 위에,", "사뿐한 첫인사."],
    description:
      "단단한 착륙 다리와 작은 레이더를 갖췄습니다. 새로운 세계에 도착한 순간부터 주변을 조심스럽게 살펴봅니다.",
    caption: "이곳에 첫 발을 내디뎌.",
    personality: "신중하고 침착함",
    specialty: "안전한 착륙과 주변 지형 탐색",
    actionLabel: "레이더 탐색",
    photo: { focus: 'Lander.RadarSweep', direction: [4, 3, 8] },
    create: createLander,
    icon: '<path d="m14 16 5-7h10l5 7v15H14zM14 29 7 41m27-12 7 12M3 42h10m22 0h10M24 9V4"/><circle cx="24" cy="21" r="5"/><path d="m20 31-2 6h12l-2-6"/>',
  },
  {
    id: "satellite",
    name: "RELAY",
    number: "05",
    title: "궤도 통신 위성",
    shortTitle: "통신 위성",
    filename: "relay-05.glb",
    tagline: ["멀리 있어도,", "우리는 연결돼."],
    description:
      "푸른 태양광 패널을 펼치고 궤도를 따라갑니다. 먼 곳의 작은 신호까지 지구로 이어주는 조용한 메신저입니다.",
    caption: "너의 소식이 들려.",
    personality: "차분하고 다정함",
    specialty: "탐사대의 발견을 지구로 전하기",
    actionLabel: "패널 추적",
    photo: { focus: 'Satellite.HighGainDish', direction: [3, 4, 8] },
    create: createSatellite,
    icon: '<rect x="18" y="15" width="12" height="20" rx="3"/><path d="M18 21H3v11h15m12-11h15v11H30M8 21v11m5-11v11m22-11v11m5-11v11M3 26h15m12 0h15M24 15V8m-6-5a6 6 0 0 0 12 0M21 35l-2 6h10l-2-6"/>',
  },
];

export function createModel(id) {
  const definition = modelDefinitions.find((model) => model.id === id);
  if (!definition) throw new Error(`Unknown model: ${id}`);
  return definition.create();
}
