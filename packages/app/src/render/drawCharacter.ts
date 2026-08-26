// IK 姿态 11 段角色：迪士尼式卡通渲染（V1.2 第二轮）。
// 形体：四肢用锥形软管（根粗梢细、关节圆滑），躯干是成形轮廓（圆肩/收腰/圆臀），
// 告别火柴杆。climber/kid/lady/suit = 人类换装；monkey/gorilla = 卡通动物。
// 装饰全部纯渲染（裙摆/尾巴/发型不进物理——GDD 4.2 守则，渲染层可用 Math/时间）。
// 登顶定格（game.wonFreeze）：0.7s 转头动画后回眸一笑，按皮肤配五官。
// 手指按抓法摆姿（开掌/半扣/全扣/捏），攀岩鞋按脚法区分（内侧踩/抹脚）。

import { Camera } from "./camera.ts";
import { Vec2 } from "@kkc/core/math/vec2.ts";
import { Pose, Limb } from "@kkc/core/model/skeleton.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { GripMethod } from "@kkc/core/sim/grip.ts";
import { HOLD_META } from "@kkc/core/sim/holds.ts";
import { characterById, CharacterDef } from "@kkc/core/model/characters.ts";

type Skin = CharacterDef["skin"];
type Pt = { x: number; y: number };

/** 皮肤配色 + 体型参数：top/bottom/legs/foreArm 允许是毛色（动物）或衣料（人类） */
interface Palette {
  skin: string; // 裸露皮肤（人脸/手掌）
  skinDk: string;
  top: string; // 躯干+上臂
  bottom: string; // 短裤/西裤/裙（动物=毛色）
  legs: string; // 大小腿
  foreArm: string; // 前臂
  hair: string; // 后脑勺/毛发
  shoe: string;
  shoeHi: string;
  furLight?: string; // 动物浅色（口鼻/耳内/掌/银背）
  widthK: number; // 基准粗细系数（躯干随此走）
  armK: number; // 手臂粗细（相对 widthK：美女细臂/金刚巨臂）
  legK: number; // 腿粗细（相对 widthK：西装暴徒细腿/小孩肉腿）
  shoulderK: number; // 肩宽系数（V 型胸）
  hipK: number; // 髋宽系数
  waistK: number; // 收腰系数（越小腰越细）
  headK: number; // 头围系数（卡通大头）
  /** 头形：rx/ry 椭圆比（1=正圆），chin 下巴收尖度 0~1（0=圆底） */
  head: { rx: number; ry: number; chin: number };
  sleeveless?: boolean; // 吊带装：上臂不画袖子（全肤色）
  skirt?: string; // 裙色（与上衣分离；lady 粉裙）
  sock?: string; // 袜色（脚踝一小截，kid 白袜）
  stripe?: string; // T 恤胸前条纹色（kid）
}

const PALETTES: Record<Skin, Palette> = {
  climber: {
    skin: "#A07458", skinDk: "#8A6049",
    top: "#D7507E", bottom: "#2B2B2B", legs: "#A07458", foreArm: "#A07458",
    hair: "#3A2E24", shoe: "#33373D", shoeHi: "#4B515A",
    widthK: 1, armK: 1.05, legK: 1.0, shoulderK: 1.0, hipK: 0.85, waistK: 0.8, headK: 1.08,
    head: { rx: 0.95, ry: 1.0, chin: 0.3 }, // 微椭圆 + 常规下巴
  },
  kid: {
    // 设计稿：白 T 蓝胸纹 + 蓝短裤白裤边 + 白袜灰运动鞋 + 深棕蓬发 + 白皙肤色
    skin: "#F2C9A4", skinDk: "#D9A87F",
    top: "#F7F4EC", bottom: "#3D6FD0", legs: "#F2C9A4", foreArm: "#F2C9A4",
    hair: "#5A3A24", shoe: "#8A8580", shoeHi: "#B5B0AA",
    stripe: "#3D7DD8", sock: "#FFFFFF",
    widthK: 0.85, armK: 1.18, legK: 1.22, shoulderK: 0.88, hipK: 0.95, waistK: 1.0, headK: 1.28,
    head: { rx: 1.06, ry: 0.96, chin: 0.12 }, // 圆嘟嘟宽脸、几乎没下巴
  },
  lady: {
    // 设计稿：黑色高马尾 + 白皙肤色；用户定制：浅蓝吊带（背部交叉细带）+ 粉色短裙
    skin: "#F0C8A8", skinDk: "#D2A382",
    top: "#A8CBE8", bottom: "#A8CBE8", legs: "#F0C8A8", foreArm: "#F0C8A8",
    hair: "#26221F", shoe: "#7A4A8C", shoeHi: "#9A6AAC",
    sleeveless: true, skirt: "#F09CB8",
    widthK: 0.85, armK: 0.68, legK: 0.85, shoulderK: 0.82, hipK: 0.95, waistK: 0.6, headK: 1.1,
    head: { rx: 0.87, ry: 1.03, chin: 0.6 }, // 窄鹅蛋脸 + 尖下巴
  },
  monkey: {
    skin: "#E8C79A", skinDk: "#C9A578",
    top: "#8B5A33", bottom: "#8B5A33", legs: "#8B5A33", foreArm: "#8B5A33",
    hair: "#8B5A33", shoe: "#8B5A33", shoeHi: "#E8C79A", furLight: "#E8C79A",
    widthK: 0.8, armK: 0.92, legK: 0.85, shoulderK: 0.8, hipK: 0.75, waistK: 0.8, headK: 1.15,
    head: { rx: 1.0, ry: 1.0, chin: 0 },
  },
  gorilla: {
    skin: "#9A9AA4", skinDk: "#7C7C86",
    top: "#3B3B44", bottom: "#3B3B44", legs: "#3B3B44", foreArm: "#3B3B44",
    hair: "#3B3B44", shoe: "#3B3B44", shoeHi: "#9A9AA4", furLight: "#9A9AA4",
    widthK: 1.55, armK: 1.25, legK: 0.85, shoulderK: 1.4, hipK: 0.95, waistK: 1.12, headK: 1.15,
    head: { rx: 1.03, ry: 0.97, chin: 0 }, // 巨臂细腿（大猩猩体态）
  },
  suit: {
    // 设计稿：深蓝灰西装 + 白衬衫 + 深蓝领带 + 圆框眼镜 + 清爽黑发
    skin: "#EAC3A0", skinDk: "#CBA07D",
    top: "#3A4050", bottom: "#3A4050", legs: "#3A4050", foreArm: "#3A4050",
    hair: "#1A1A1A", shoe: "#14151A", shoeHi: "#3A3D46",
    widthK: 1.05, armK: 1.18, legK: 0.88, shoulderK: 1.18, hipK: 0.82, waistK: 0.85, headK: 1.08,
    head: { rx: 0.9, ry: 1.07, chin: 0.42 }, // 长脸 + 方中带尖的下巴（粗臂细腿倒三角）
  },
};

const isAnimal = (s: Skin) => s === "monkey" || s === "gorilla";
const OUTLINE = "rgba(30,20,12,0.14)"; // 全身统一淡描边（软过渡）

const nrm = (x: number, y: number): Pt => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};
const dd = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
/** a→b 的单位左法线 */
const perpUnit = (a: Pt, b: Pt): Pt => nrm(-(b.y - a.y), b.x - a.x);

// ---- 回眸转头动画（模块级渲染状态：一次只有一个场景在画角色） ----
let faceAnim = 0;
let lastNow = -1;
// ---- 运动驱动的裙摆/马尾摆：骨盆横向速度低通（同屏只有一个 lady 在动，共享无碍） ----
let swaySmooth = 0;
let prevPelvis: Pt | null = null;

/**
 * 头形路径（局部坐标，原点=头心，-y=头顶）：上半椭圆弧 + 两侧贝塞尔收进下巴。
 * rx/ry 控制宽窄（1=正圆），chin 控制下巴收尖度（0=圆底，1=明显尖下巴）。
 */
function headPath(
  ctx: CanvasRenderingContext2D,
  R: number,
  sh: { rx: number; ry: number; chin: number },
) {
  const rx = R * sh.rx;
  const ry = R * sh.ry;
  const chinY = ry * (1 + sh.chin * 0.14); // 下巴略低于椭圆底
  const cheekX = rx * (0.62 - sh.chin * 0.2); // 下巴越尖、腮线越收
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2); // 上半（含左右端点）
  ctx.bezierCurveTo(rx, ry * 0.62, cheekX, chinY * 0.94, 0, chinY); // 右腮 → 下巴
  ctx.bezierCurveTo(-cheekX, chinY * 0.94, -rx, ry * 0.62, -rx, 0); // 下巴 → 左腮
  ctx.closePath();
}

/** 单段锥形胶囊：a(宽 wa) → b(宽 wb)，两端圆帽。直段贴合骨骼，不产生弧形漂移。 */
function taperSeg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, wa: number, wb: number) {
  const n = perpUnit(a, b);
  const angN = Math.atan2(n.y, n.x);
  ctx.beginPath();
  ctx.moveTo(a.x + (n.x * wa) / 2, a.y + (n.y * wa) / 2);
  ctx.lineTo(b.x + (n.x * wb) / 2, b.y + (n.y * wb) / 2);
  ctx.arc(b.x, b.y, wb / 2, angN, angN - Math.PI, true); // 末端圆帽
  ctx.lineTo(a.x - (n.x * wa) / 2, a.y - (n.y * wa) / 2);
  ctx.arc(a.x, a.y, wa / 2, angN - Math.PI, angN - Math.PI * 2, true); // 根端圆帽
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * 锥形肢体：根粗→关节→梢细。两段直的锥形胶囊 + 关节圆帽自然衔接——
 * 肘/膝清晰可见（此前用二次曲线整段弯过关节，弯腿会被拉成"香蕉弧"，已废弃）。
 */
function taperedLimb(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  j: Pt,
  e: Pt,
  wa: number,
  wj: number,
  we: number,
  color: string,
) {
  ctx.fillStyle = color;
  taperSeg(ctx, a, j, wa, wj);
  ctx.fillStyle = color;
  taperSeg(ctx, j, e, wj, we);
}

/** 成形躯干：圆肩盖 + 两侧收腰曲线 + 圆臀底，按皮肤出 V 型胸 / 沙漏腰 / 桶胸 */
function drawTorso(
  ctx: CanvasRenderingContext2D,
  shC: Pt,
  pel: Pt,
  down: Pt,
  right: Pt,
  torsoLen: number,
  torsoW: number,
  pal: Palette,
) {
  const up: Pt = { x: -down.x, y: -down.y };
  const shHalf = torsoW * 0.62 * pal.shoulderK;
  const hipHalf = torsoW * 0.58 * pal.hipK;
  const waistHalf = Math.min(shHalf, hipHalf) * pal.waistK;
  const wC = mix(shC, pel, 0.58); // 腰线位置
  const seat = 0.16 * torsoLen; // 臀部下坠量（盖住骨盆关节）
  const pt = (c: Pt, k: number): Pt => ({ x: c.x + right.x * k, y: c.y + right.y * k });
  const shL = pt(shC, -shHalf);
  const shR = pt(shC, shHalf);
  const wL = pt(wC, -waistHalf);
  const wR = pt(wC, waistHalf);
  const hipL: Pt = { x: pel.x - right.x * hipHalf + down.x * seat * 0.3, y: pel.y - right.y * hipHalf + down.y * seat * 0.3 };
  const hipR: Pt = { x: pel.x + right.x * hipHalf + down.x * seat * 0.3, y: pel.y + right.y * hipHalf + down.y * seat * 0.3 };
  const seatC: Pt = { x: pel.x + down.x * seat, y: pel.y + down.y * seat };
  const capC: Pt = { x: shC.x + up.x * shHalf * 0.55, y: shC.y + up.y * shHalf * 0.55 };
  ctx.fillStyle = pal.top;
  ctx.beginPath();
  ctx.moveTo(shL.x, shL.y);
  ctx.quadraticCurveTo(wL.x, wL.y, hipL.x, hipL.y); // 左侧腰线
  ctx.quadraticCurveTo(seatC.x, seatC.y, hipR.x, hipR.y); // 圆臀
  ctx.quadraticCurveTo(wR.x, wR.y, shR.x, shR.y); // 右侧腰线
  ctx.quadraticCurveTo(capC.x, capC.y, shL.x, shL.y); // 圆肩盖
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * 画手指：局部坐标，+x = 手指伸向(前臂续向岩点)方向。按抓法摆姿。
 * open 平摊舒展 / half 半扣(指节弯) / full 全扣(强弯+拇指压) / lock 扣指洞(按指数伸)
 * / pinch 拇指对四指。
 * @param fingers 指洞能塞几根手指（0=不是指洞）
 */
function drawFingers(
  ctx: CanvasRenderingContext2D,
  grip: GripMethod | null,
  sc: number,
  main: string,
  dark: string,
  fingers = 0,
) {
  ctx.strokeStyle = main;
  ctx.fillStyle = main;
  ctx.lineCap = "round";
  const fw = 3.4 * sc; // 手指粗
  // 手掌
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 5.2 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = fw;

  const drawFinger = (baseA: number, segs: { len: number; turn: number }[]) => {
    let x = Math.cos(baseA) * 4 * sc;
    let y = Math.sin(baseA) * 4 * sc;
    let a = baseA;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (const s of segs) {
      a += s.turn;
      x += Math.cos(a) * s.len * sc;
      y += Math.sin(a) * s.len * sc;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  if (grip === "open" || grip === null) {
    // 开掌/放松：四指扇形舒展、近乎伸直
    [-0.5, -0.17, 0.17, 0.5].forEach((a) => drawFinger(a, [{ len: 8, turn: 0 }, { len: 4, turn: a * 0.3 }]));
    drawFinger(1.4, [{ len: 6, turn: 0 }]); // 拇指偏侧
  } else if (grip === "half") {
    // 半扣：指根伸出后第一指节下弯约 80°，扣住棱
    [-0.32, -0.1, 0.12, 0.34].forEach((a) =>
      drawFinger(a, [{ len: 6, turn: 0 }, { len: 5, turn: 1.4 }]),
    );
    drawFinger(1.5, [{ len: 5, turn: 0 }, { len: 3, turn: -1.0 }]); // 拇指
  } else if (grip === "full") {
    // 全扣：强弯，可见指节短、拇指压指背
    [-0.3, -0.1, 0.12, 0.32].forEach((a) =>
      drawFinger(a, [{ len: 4.5, turn: 0 }, { len: 5, turn: 1.9 }]),
    );
    ctx.strokeStyle = dark;
    drawFinger(0.9, [{ len: 6, turn: 0 }, { len: 4, turn: -1.7 }]); // 拇指压
  } else if (grip === "lock") {
    // 扣指洞：**只有能塞进去的那几根手指**伸进洞里，其余蜷在洞外——
    // 大指洞 3 指 / 中指洞 2 指 / 最小指洞 1 指，一眼看出这是几指洞。
    const inCount = fingers > 0 ? fingers : 3;
    const spread = inCount === 1 ? [0] : inCount === 2 ? [-0.13, 0.13] : [-0.26, 0, 0.26];
    spread.forEach((a) => drawFinger(a, [{ len: 9, turn: 0 }, { len: 3, turn: 1.1 }]));
    // 塞不进去的手指蜷在洞外
    for (let k = inCount; k < 4; k++) {
      const a = 0.55 + (k - inCount) * 0.28;
      drawFinger(a, [{ len: 4, turn: 0 }, { len: 3.5, turn: 2.0 }]);
    }
    ctx.strokeStyle = dark;
    drawFinger(1.5, [{ len: 5, turn: 0 }, { len: 3, turn: -1.2 }]); // 拇指抵在洞缘
  } else {
    // pinch 捏：拇指在一侧、四指在另一侧，相向夹
    ctx.lineWidth = fw;
    [-0.12, 0.12].forEach((a) => drawFinger(a, [{ len: 9, turn: 0 }])); // 中间两指
    drawFinger(-0.9, [{ len: 8, turn: 0.5 }]); // 上侧指
    drawFinger(1.5, [{ len: 8, turn: -0.6 }]); // 拇指对侧夹
  }
}

/**
 * 攀岩鞋：局部坐标，+x = 脚尖(小腿续向)方向。
 * 内侧踩=大脚趾侧尖头点立 / 外侧踩=翻到小脚趾侧（背步的样子）/ 抹脚=平贴大底。
 */
function drawShoe(
  ctx: CanvasRenderingContext2D,
  grip: GripMethod | null,
  sc: number,
  color: string,
  hi: string,
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  if (grip === "smear") {
    // 抹脚：平贴大底，较宽、底面与墙接触
    ctx.beginPath();
    ctx.ellipse(1 * sc, 1.5 * sc, 13 * sc, 6.5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.ellipse(-2 * sc, -1 * sc, 6 * sc, 2.4 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 内侧踩(默认)：下翻尖头，脚尖点立、鞋身较窄
    // 外侧踩：整只鞋上下翻面（小脚趾侧着点）——背步/垂膝一眼可辨
    ctx.save();
    if (grip === "outside") ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(11 * sc, 1 * sc); // 尖头(接触点)
    ctx.quadraticCurveTo(6 * sc, -5 * sc, -6 * sc, -3.5 * sc); // 鞋背
    ctx.quadraticCurveTo(-11 * sc, -1 * sc, -8 * sc, 4 * sc); // 鞋跟
    ctx.quadraticCurveTo(2 * sc, 6 * sc, 11 * sc, 1 * sc); // 大底
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hi; // 鞋面高光
    ctx.beginPath();
    ctx.ellipse(-1 * sc, -1.5 * sc, 5 * sc, 2 * sc, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 动物爪掌（脚）：毛色掌 + 浅色脚趾（代替攀岩鞋）。局部坐标同 drawShoe。 */
function drawPaw(ctx: CanvasRenderingContext2D, sc: number, k: number, fur: string, light: string) {
  ctx.fillStyle = fur;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(2 * sc * k, 0, 11 * sc * k, 6.5 * sc * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = light;
  for (const oy of [-3.6, 0, 3.6]) {
    ctx.beginPath();
    ctx.arc(11 * sc * k, oy * sc * k, 2.2 * sc * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 回眸笑脸（重塑版）：局部坐标（已旋转到头部朝向 + 随转头动画平移，+y 向下巴）。
 * 迪士尼式：大眼白+虹膜+高光、细眉、小鼻、上扬开口笑、软腮红；按皮肤加特征。
 */
function drawWinFace(ctx: CanvasRenderingContext2D, R: number, skin: Skin, pal: Palette) {
  const dark = "#2B2318";
  const eyeY = -0.12 * R;
  const eyeDX = 0.3 * R;

  // ---- 皮肤特有面部底 ----
  if (skin === "monkey") {
    ctx.fillStyle = pal.furLight!;
    ctx.beginPath(); // 心形脸：双眼周浅斑 + 口鼻椭圆
    ctx.arc(-0.28 * R, -0.14 * R, 0.4 * R, 0, Math.PI * 2);
    ctx.arc(0.28 * R, -0.14 * R, 0.4 * R, 0, Math.PI * 2);
    ctx.ellipse(0, 0.34 * R, 0.5 * R, 0.42 * R, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === "gorilla") {
    ctx.fillStyle = pal.furLight!;
    ctx.beginPath();
    ctx.ellipse(0, 0.08 * R, 0.66 * R, 0.64 * R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2A2A32"; // 眉脊
    ctx.lineWidth = 0.15 * R;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-0.42 * R, -0.28 * R);
    ctx.quadraticCurveTo(0, -0.36 * R, 0.42 * R, -0.28 * R);
    ctx.stroke();
  }

  // ---- 眼睛（全皮肤通用大眼；suit 再叠圆框眼镜） ----
  {
    // 眼白 + 虹膜 + 高光（迪士尼大眼）
    const ew = skin === "kid" ? 0.19 * R : 0.16 * R;
    const eh = skin === "kid" ? 0.23 * R : 0.2 * R;
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = "#FFFDF6";
      ctx.beginPath();
      ctx.ellipse(sgn * eyeDX, eyeY, ew, eh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(43,35,24,0.35)";
      ctx.lineWidth = 0.025 * R;
      ctx.stroke();
      const ir = skin === "kid" ? 0.1 * R : 0.085 * R;
      ctx.fillStyle = isAnimal(skin) ? "#4A3320" : "#3A2C1E";
      ctx.beginPath();
      ctx.arc(sgn * eyeDX + 0.02 * R, eyeY + 0.03 * R, ir, 0, Math.PI * 2); // 虹膜微朝镜头
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(sgn * eyeDX + 0.055 * R, eyeY - 0.015 * R, ir * 0.36, 0, Math.PI * 2); // 高光
      ctx.fill();
    }
    // 眉毛（笑意上挑）
    ctx.strokeStyle = skin === "lady" ? "#4A2E1A" : dark;
    ctx.lineWidth = Math.max(1.2, 0.055 * R);
    ctx.lineCap = "round";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sgn * (eyeDX - 0.14 * R), eyeY - 0.26 * R);
      ctx.quadraticCurveTo(sgn * eyeDX, eyeY - 0.36 * R, sgn * (eyeDX + 0.15 * R), eyeY - 0.28 * R);
      ctx.stroke();
    }
    if (skin === "lady") {
      // 睫毛：外眼角三根
      ctx.lineWidth = Math.max(1, 0.045 * R);
      for (const sgn of [-1, 1]) {
        for (const [dx, dy] of [[0.14, -0.1], [0.17, -0.02], [0.16, 0.07]] as const) {
          ctx.beginPath();
          ctx.moveTo(sgn * (eyeDX + ew * 0.8), eyeY + dy * R * 0.6);
          ctx.lineTo(sgn * (eyeDX + ew * 0.8 + dx * R * 0.55), eyeY + dy * R);
          ctx.stroke();
        }
      }
    }
  }

  // suit：圆框细线眼镜（设计稿）——镜圈 + 鼻梁 + 短镜腿
  if (skin === "suit") {
    ctx.strokeStyle = "#2B2318";
    ctx.lineWidth = Math.max(1.2, 0.05 * R);
    ctx.lineCap = "round";
    const gr = 0.24 * R;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sgn * eyeDX, eyeY, gr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath(); // 鼻梁
    ctx.moveTo(-eyeDX + gr, eyeY - 0.04 * R);
    ctx.quadraticCurveTo(0, eyeY - 0.1 * R, eyeDX - gr, eyeY - 0.04 * R);
    ctx.stroke();
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); // 镜腿
      ctx.moveTo(sgn * (eyeDX + gr), eyeY);
      ctx.lineTo(sgn * 0.86 * R, eyeY - 0.08 * R);
      ctx.stroke();
    }
  }

  // lady：金色小耳环（耳位下缘）
  if (skin === "lady") {
    ctx.fillStyle = "#D9A93C";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sgn * 0.88 * R, 0.28 * R, 0.07 * R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 鼻 ----
  if (isAnimal(skin)) {
    ctx.fillStyle = skin === "gorilla" ? "#2A2A32" : "#5A3A22";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sgn * 0.1 * R, 0.16 * R, 0.05 * R, 0.07 * R, sgn * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = pal.skinDk;
    ctx.lineWidth = Math.max(1.2, 0.045 * R);
    ctx.lineCap = "round";
    ctx.beginPath(); // 小鼻侧影
    ctx.arc(0.02 * R, 0.1 * R, 0.07 * R, Math.PI * 0.2, Math.PI * 0.85);
    ctx.stroke();
  }

  // ---- 笑口：嘴角上扬的开口笑（贝塞尔嘴型，非几何半圆；suit 斯文小笑） ----
  const my = skin === "monkey" ? 0.44 * R : 0.34 * R;
  const mw = skin === "gorilla" ? 0.42 * R : skin === "suit" ? 0.24 * R : 0.3 * R;
  ctx.fillStyle = skin === "lady" ? "#8E2F3C" : "#5A2A20";
  ctx.beginPath();
  ctx.moveTo(-mw, my - 0.06 * R);
  ctx.quadraticCurveTo(0, my + 0.3 * R, mw, my - 0.06 * R); // 下唇弧
  ctx.quadraticCurveTo(0, my + 0.02 * R, -mw, my - 0.06 * R); // 上唇线（浅弯）
  ctx.closePath();
  ctx.fill();
  if (skin === "gorilla") {
    // 露齿
    ctx.fillStyle = "#F5EBD3";
    ctx.beginPath();
    ctx.moveTo(-mw * 0.8, my - 0.03 * R);
    ctx.quadraticCurveTo(0, my + 0.08 * R, mw * 0.8, my - 0.03 * R);
    ctx.quadraticCurveTo(0, my, -mw * 0.8, my - 0.03 * R);
    ctx.closePath();
    ctx.fill();
  } else {
    // 舌头一点（暖笑）
    ctx.fillStyle = "rgba(214,110,100,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, my + 0.12 * R, mw * 0.42, 0.07 * R, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 嘴角笑纹
  ctx.strokeStyle = skin === "lady" ? "#8E2F3C" : dark;
  ctx.lineWidth = Math.max(1.2, 0.045 * R);
  ctx.lineCap = "round";
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * mw, my - 0.06 * R);
    ctx.quadraticCurveTo(sgn * (mw + 0.09 * R), my - 0.1 * R, sgn * (mw + 0.1 * R), my - 0.18 * R);
    ctx.stroke();
  }

  // ---- 软腮红（硬汉/金刚免） ----
  if (skin !== "suit" && skin !== "gorilla") {
    ctx.fillStyle = "rgba(230,110,110,0.32)";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sgn * 0.55 * R, 0.16 * R, 0.14 * R, 0.1 * R, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawCharacter(ctx: CanvasRenderingContext2D, cam: Camera, pose: Pose, game: Game) {
  const skinId: Skin = characterById(game.characterId).skin;
  const pal = PALETTES[skinId];
  const S = (p: Vec2) => cam.toScreen(p);
  const sc = cam.scale;
  const now = performance.now() / 1000; // 纯渲染动效时钟（裙摆/尾巴/转头）
  const rdt = lastNow < 0 ? 0 : Math.min(0.1, now - lastNow);
  lastNow = now;
  const t = now;
  const limbW = 13 * sc * pal.widthK;
  const armW = limbW * pal.armK; // 手臂与腿分开粗细（体型差异化）
  const legW = limbW * pal.legK;
  const torsoW = 30 * sc * pal.widthK;
  const P = {
    pelvis: S(pose.pelvis),
    shoulderC: S(pose.shoulderC),
    head: S(pose.head),
    neck: S(pose.neck),
  };
  // 躯干朝向（屏幕空间）：down = 脊柱向下，right = 其垂线
  const down = nrm(P.pelvis.x - P.shoulderC.x, P.pelvis.y - P.shoulderC.y);
  const right: Pt = { x: -down.y, y: down.x };
  const torsoLen = dd(P.pelvis, P.shoulderC);

  // 回眸转头动画：定格后 0.7s 缓动转脸
  if (game.wonFreeze) faceAnim = Math.min(1, faceAnim + rdt / 0.7);
  else faceAnim = 0;
  const faceK = 1 - Math.pow(1 - faceAnim, 3); // ease-out

  // 运动摇摆：骨盆沿躯干 right 轴的速度 → 低通 → 裙摆/马尾滞后甩动（反向）
  if (prevPelvis && rdt > 0) {
    const latV =
      ((P.pelvis.x - prevPelvis.x) * right.x + (P.pelvis.y - prevPelvis.y) * right.y) / rdt;
    const target = Math.max(-0.35, Math.min(0.35, -latV * 0.0015));
    swaySmooth += (target - swaySmooth) * Math.min(1, rdt * 6);
  }
  prevPelvis = { x: P.pelvis.x, y: P.pelvis.y };

  // 猴子尾巴（最底层）：从骨盆甩出的 S 形曲线，随时间轻摆
  if (skinId === "monkey") {
    const wag = Math.sin(t * 2.1) * 0.25;
    const L = torsoLen * 0.95;
    ctx.strokeStyle = pal.top;
    ctx.lineWidth = limbW * 0.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(P.pelvis.x, P.pelvis.y);
    ctx.bezierCurveTo(
      P.pelvis.x + down.x * L * 0.6 - right.x * L * 0.5,
      P.pelvis.y + down.y * L * 0.6 - right.y * L * 0.5,
      P.pelvis.x + down.x * L * 0.2 - right.x * L * (1.0 + wag),
      P.pelvis.y + down.y * L * 0.2 - right.y * L * (1.0 + wag),
      P.pelvis.x - down.x * L * 0.35 - right.x * L * (0.85 + wag),
      P.pelvis.y - down.y * L * 0.35 - right.y * L * (0.85 + wag),
    );
    ctx.stroke();
  }

  // 腿（后层）：锥形软管（大腿粗 → 脚踝细）；配袜色则脚踝加一小截袜带
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    const j = S(k.ik.joint);
    const e = S(k.ik.end);
    taperedLimb(ctx, S(k.root), j, e, legW * 1.3, legW * 1.0, legW * 0.62, pal.legs);
    if (pal.sock) {
      ctx.strokeStyle = pal.sock;
      ctx.lineWidth = legW * 0.72;
      ctx.lineCap = "round";
      const c0 = mix(j, e, 0.78);
      const c1 = mix(j, e, 0.92);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.stroke();
    }
  }

  // 短裤/裤装（人类，lady 由裙盖）：臀座圆 + 两截裤管盖住髋关节与大腿根
  if (skinId === "climber" || skinId === "kid" || skinId === "suit") {
    const hipHalf = torsoW * 0.58 * pal.hipK;
    ctx.fillStyle = pal.bottom;
    ctx.beginPath();
    ctx.arc(P.pelvis.x + down.x * torsoLen * 0.06, P.pelvis.y + down.y * torsoLen * 0.06, hipHalf * 0.98, 0, Math.PI * 2);
    ctx.fill();
    for (const l of ["LF", "RF"] as Limb[]) {
      const k = pose.limb[l];
      const a = S(k.root);
      const kneeK = skinId === "suit" ? 1 : 0.42; // 西裤到膝下由 legs 色续；短裤只到大腿中
      const b = mix(a, S(k.ik.joint), kneeK);
      ctx.strokeStyle = pal.bottom;
      ctx.lineWidth = legW * 1.35;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // 躯干（成形轮廓：圆肩/收腰/圆臀）
  drawTorso(ctx, P.shoulderC, P.pelvis, down, right, torsoLen, torsoW, pal);

  // kid：T 恤胸前横条纹（设计稿蓝条纹）
  if (pal.stripe) {
    const c = mix(P.shoulderC, P.pelvis, 0.3);
    ctx.strokeStyle = pal.stripe;
    ctx.lineWidth = torsoLen * 0.14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.x - right.x * torsoW * 0.48, c.y - right.y * torsoW * 0.48);
    ctx.lineTo(c.x + right.x * torsoW * 0.48, c.y + right.y * torsoW * 0.48);
    ctx.stroke();
  }

  // lady：吊带装——裸肩背（肩部盖肤色带）+ 背部交叉细吊带
  if (skinId === "lady") {
    const shHalf = torsoW * 0.62 * pal.shoulderK;
    ctx.strokeStyle = pal.skin;
    ctx.lineWidth = torsoLen * 0.3; // 盖掉躯干上段的衣色 → 露背
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(P.shoulderC.x - right.x * shHalf * 0.62, P.shoulderC.y - right.y * shHalf * 0.62);
    ctx.lineTo(P.shoulderC.x + right.x * shHalf * 0.62, P.shoulderC.y + right.y * shHalf * 0.62);
    ctx.stroke();
    // 交叉细带：肩两侧 → 对侧腰线，背面成 X
    const wC = mix(P.shoulderC, P.pelvis, 0.55);
    const waistHalf = Math.min(shHalf, torsoW * 0.58 * pal.hipK) * pal.waistK;
    ctx.strokeStyle = pal.top;
    ctx.lineWidth = Math.max(2, torsoW * 0.09);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(
        P.shoulderC.x + sgn * right.x * shHalf * 0.55,
        P.shoulderC.y + sgn * right.y * shHalf * 0.55,
      );
      ctx.lineTo(wC.x - sgn * right.x * waistHalf * 0.7, wC.y - sgn * right.y * waistHalf * 0.7);
      ctx.stroke();
    }
  }

  // 金刚银背：背部浅灰斑
  if (skinId === "gorilla") {
    ctx.fillStyle = "rgba(154,154,164,0.85)";
    ctx.beginPath();
    ctx.ellipse(
      P.pelvis.x - down.x * torsoLen * 0.3,
      P.pelvis.y - down.y * torsoLen * 0.3,
      torsoW * 0.4,
      torsoLen * 0.34,
      Math.atan2(down.y, down.x) + Math.PI / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // 西装：后领白线
  if (skinId === "suit") {
    ctx.strokeStyle = "#F5EBD3";
    ctx.lineWidth = Math.max(2, torsoW * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(P.shoulderC.x - right.x * torsoW * 0.3, P.shoulderC.y - right.y * torsoW * 0.3);
    ctx.lineTo(P.shoulderC.x + right.x * torsoW * 0.3, P.shoulderC.y + right.y * torsoW * 0.3);
    ctx.stroke();
  }

  // 美女裙摆：高腰宽摆（盖住髋关节），三瓣波浪裙边；随运动甩动 + 时间微摆
  if (skinId === "lady") {
    const sway = Math.sin(t * 2.8) * 0.08 + swaySmooth;
    const hipHalf = torsoW * 0.58 * pal.hipK;
    const waistC: Pt = {
      x: P.pelvis.x - down.x * torsoLen * 0.14,
      y: P.pelvis.y - down.y * torsoLen * 0.14,
    }; // 高腰：起于骨盆上方
    const skirtL = torsoLen * 0.62;
    const waistHalf = hipHalf * 1.15;
    const hemHalf = hipHalf * 2.1; // 宽摆
    const hemC: Pt = {
      x: waistC.x + down.x * skirtL + right.x * sway * skirtL,
      y: waistC.y + down.y * skirtL + right.y * sway * skirtL,
    };
    const wl = { x: waistC.x - right.x * waistHalf, y: waistC.y - right.y * waistHalf };
    const wr = { x: waistC.x + right.x * waistHalf, y: waistC.y + right.y * waistHalf };
    ctx.fillStyle = pal.skirt ?? pal.top;
    ctx.beginPath();
    ctx.moveTo(wl.x, wl.y);
    // 左裙摆外扩弧
    ctx.quadraticCurveTo(
      wl.x + down.x * skirtL * 0.55 - right.x * hemHalf * 0.55,
      wl.y + down.y * skirtL * 0.55 - right.y * hemHalf * 0.55,
      hemC.x - right.x * hemHalf,
      hemC.y - right.y * hemHalf,
    );
    // 三瓣波浪裙边
    for (let i = 0; i < 3; i++) {
      const k0 = -1 + (i * 2) / 3;
      const k1 = -1 + ((i + 1) * 2) / 3;
      const p1: Pt = { x: hemC.x + right.x * hemHalf * k1, y: hemC.y + right.y * hemHalf * k1 };
      const cm: Pt = {
        x: hemC.x + right.x * hemHalf * ((k0 + k1) / 2) + down.x * skirtL * 0.18,
        y: hemC.y + right.y * hemHalf * ((k0 + k1) / 2) + down.y * skirtL * 0.18,
      };
      ctx.quadraticCurveTo(cm.x, cm.y, p1.x, p1.y);
    }
    // 右裙摆外扩弧收回腰线
    ctx.quadraticCurveTo(
      wr.x + down.x * skirtL * 0.55 + right.x * hemHalf * 0.55,
      wr.y + down.y * skirtL * 0.55 + right.y * hemHalf * 0.55,
      wr.x,
      wr.y,
    );
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 裙内褶线两道
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = Math.max(1, torsoW * 0.04);
    for (const k of [-0.33, 0.33]) {
      ctx.beginPath();
      ctx.moveTo(waistC.x + right.x * waistHalf * k, waistC.y + right.y * waistHalf * k);
      ctx.quadraticCurveTo(
        waistC.x + down.x * skirtL * 0.5 + right.x * hemHalf * k * 0.7,
        waistC.y + down.y * skirtL * 0.5 + right.y * hemHalf * k * 0.7,
        hemC.x + right.x * hemHalf * k * 0.9,
        hemC.y + right.y * hemHalf * k * 0.9,
      );
      ctx.stroke();
    }
  }

  // 手臂：锥形软管（肩粗 → 手腕细）；西装加白袖口
  for (const l of ["LH", "RH"] as Limb[]) {
    const k = pose.limb[l];
    const a = S(k.root);
    const j = S(k.ik.joint);
    const e = S(k.ik.end);
    // 上臂衣色到肘，前臂按皮肤 —— 用整段锥形一次画（颜色分段：先整条前臂色，再覆盖上臂段）
    // 吊带装（sleeveless）：不画袖子，整臂肤色
    taperedLimb(ctx, a, j, e, armW * 1.15, armW * 0.9, armW * 0.55, pal.foreArm);
    if (pal.top !== pal.foreArm && !pal.sleeveless) {
      // 短袖：肩→肘再多出一点点，盖出袖口
      taperedLimb(ctx, a, mix(a, j, 0.7), mix(a, j, 1.12), armW * 1.18, armW * 1.05, armW * 0.95, pal.top);
    }
    if (skinId === "suit") {
      // 白衬衫袖口：腕前一小截
      ctx.strokeStyle = "#F5EBD3";
      ctx.lineWidth = armW * 0.62;
      ctx.lineCap = "round";
      const c0 = mix(j, e, 0.78);
      const c1 = mix(j, e, 0.9);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.stroke();
    }
  }

  // 颈 + 头
  const headR =
    Math.max(dd(P.neck, P.head), 12 * sc) * pal.headK;
  const headUp = nrm(P.head.x - P.neck.x, P.head.y - P.neck.y);
  taperedLimb(
    ctx,
    P.shoulderC,
    mix(P.shoulderC, P.neck, 0.6),
    P.neck,
    limbW * 1.0,
    limbW * 0.8,
    limbW * 0.7,
    isAnimal(skinId) ? pal.top : pal.skin,
  );
  const headAng = Math.atan2(headUp.y, headUp.x) + Math.PI / 2; // 局部 -y = 头顶

  ctx.save();
  ctx.translate(P.head.x, P.head.y);
  ctx.rotate(headAng);

  // 耳朵（头后层）：动物大圆耳 / 人小耳
  if (skinId === "monkey") {
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.arc(sgn * headR * 0.95, 0, headR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.furLight!;
      ctx.beginPath();
      ctx.arc(sgn * headR * 0.95, 0, headR * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skinId === "gorilla") {
    ctx.fillStyle = pal.top;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sgn * headR * 0.92, 0.1 * headR, headR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = pal.skin;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sgn * headR * pal.head.rx * 0.94, 0.08 * headR, headR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 头底色：后脑勺（发/毛色）——按皮肤头形（椭圆比 + 下巴收尖）
  headPath(ctx, headR, pal.head);
  ctx.fillStyle = isAnimal(skinId) ? pal.top : pal.hair;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 金刚头冠脊
  if (skinId === "gorilla") {
    ctx.fillStyle = pal.top;
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.82, headR * 0.5, headR * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 回眸转脸：脸从侧面缓动转进来（裁剪在头形内 → 看起来像头在转）
  if (faceK > 0.01) {
    ctx.save();
    headPath(ctx, headR * 0.995, pal.head);
    ctx.clip();
    const fx = (1 - faceK) * headR * 1.35; // 从右侧转入
    ctx.translate(fx, 0);
    // 脸底
    ctx.fillStyle = isAnimal(skinId) ? pal.top : pal.skin;
    headPath(ctx, headR, pal.head);
    ctx.fill();
    // 人类发冠弧（随脸一起转入）
    if (!isAnimal(skinId)) {
      ctx.fillStyle = pal.hair;
      ctx.beginPath();
      ctx.arc(0, 0, headR, Math.PI * 1.1, Math.PI * 1.9);
      ctx.closePath();
      ctx.fill();
      if (skinId === "lady") {
        // 中分刘海两侧弧
        ctx.beginPath();
        ctx.moveTo(0, -headR * 0.95);
        ctx.quadraticCurveTo(-headR * 0.75, -headR * 0.55, -headR * 0.6, headR * 0.05);
        ctx.quadraticCurveTo(-headR * 0.5, -headR * 0.5, -headR * 0.05, -headR * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -headR * 0.95);
        ctx.quadraticCurveTo(headR * 0.75, -headR * 0.55, headR * 0.6, headR * 0.05);
        ctx.quadraticCurveTo(headR * 0.5, -headR * 0.5, headR * 0.05, -headR * 0.6);
        ctx.closePath();
        ctx.fill();
      } else if (skinId === "kid") {
        // 蓬松刘海：额前三团圆弧（设计稿乱蓬发）
        for (const [bx, by, br] of [
          [-0.48, -0.62, 0.3],
          [-0.02, -0.74, 0.34],
          [0.46, -0.6, 0.28],
        ] as const) {
          ctx.beginPath();
          ctx.arc(bx * headR, by * headR, br * headR, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (skinId === "suit") {
        // 整洁侧分：一条细分缝线
        ctx.strokeStyle = "rgba(245,235,211,0.35)";
        ctx.lineWidth = Math.max(1, headR * 0.04);
        ctx.beginPath();
        ctx.moveTo(-headR * 0.28, -headR * 0.95);
        ctx.quadraticCurveTo(-headR * 0.42, -headR * 0.75, -headR * 0.52, -headR * 0.55);
        ctx.stroke();
      }
    }
    drawWinFace(ctx, headR, skinId, pal);
    ctx.restore();
  }

  // 攀岩者头带（回眸后压在发际上）
  if (skinId === "climber") {
    ctx.strokeStyle = "#D64A47";
    ctx.lineWidth = headR * 0.22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, -headR * 0.38);
    ctx.lineTo(headR * 0.9, -headR * 0.38);
    ctx.stroke();
  }

  // 美女高马尾（设计稿）：发根在头顶偏后 + 黑发圈结 + 长尾束，随运动甩动
  if (skinId === "lady") {
    const ps = Math.sin(t * 2.6) * 0.12 + swaySmooth * 1.4;
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = headR * 0.38;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(headR * 0.05, -headR * 0.98); // 顶部发根
    ctx.quadraticCurveTo(
      headR * (0.85 + ps * 0.3),
      -headR * 0.55,
      headR * (0.72 + ps * 0.6),
      headR * 0.85,
    );
    ctx.quadraticCurveTo(
      headR * (0.6 + ps * 1.1),
      headR * 1.45,
      headR * (0.34 + ps * 1.3),
      headR * 1.75, // 尾束加长
    );
    ctx.stroke();
    // 发圈结
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(headR * 0.14, -headR * 0.92, headR * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // 西装：回眸定格时颈下露出深蓝领带（结 + 短带）
  if (skinId === "suit" && faceK > 0.5) {
    const nx = P.neck.x;
    const ny = P.neck.y;
    const pt = (rx: number, dy: number): Pt => ({
      x: nx + right.x * headR * rx + down.x * headR * dy,
      y: ny + right.y * headR * rx + down.y * headR * dy,
    });
    ctx.fillStyle = "#2A3A5E";
    ctx.globalAlpha = Math.min(1, (faceK - 0.5) * 4); // 随转头淡入
    // 结
    const k0 = pt(0, 0.08);
    const k1 = pt(0.17, 0.3);
    const k2 = pt(0, 0.52);
    const k3 = pt(-0.17, 0.3);
    ctx.beginPath();
    ctx.moveTo(k0.x, k0.y);
    ctx.lineTo(k1.x, k1.y);
    ctx.lineTo(k2.x, k2.y);
    ctx.lineTo(k3.x, k3.y);
    ctx.closePath();
    ctx.fill();
    // 短带
    const t0 = pt(0, 0.44);
    const t1 = pt(0.15, 1.1);
    const t2 = pt(0, 1.35);
    const t3 = pt(-0.15, 1.1);
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 脚：动物爪掌 / 人类攀岩鞋（西装暴徒 = 黑皮鞋同形）
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    const e = S(k.ik.end);
    const j = S(k.ik.joint);
    const ang = Math.atan2(e.y - j.y, e.x - j.x); // 小腿→脚尖
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    if (isAnimal(skinId)) drawPaw(ctx, sc, pal.widthK, pal.top, pal.furLight!);
    else drawShoe(ctx, game.c.limbs[l].grip, sc, pal.shoe, pal.shoeHi);
    ctx.restore();
  }

  // 手指（按抓法 + 朝向前臂续向）：动物用浅色掌
  for (const l of ["LH", "RH"] as Limb[]) {
    const k = pose.limb[l];
    const e = S(k.ik.end);
    const j = S(k.ik.joint);
    const ang = Math.atan2(e.y - j.y, e.x - j.x); // 前臂→手
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    const ht = game.c.limbs[l].hold?.type;
    drawFingers(
      ctx,
      game.c.limbs[l].grip,
      sc,
      isAnimal(skinId) ? pal.furLight! : pal.skin,
      pal.skinDk,
      ht ? (HOLD_META[ht].pocketFingers ?? 0) : 0,
    );
    ctx.restore();
  }
}
