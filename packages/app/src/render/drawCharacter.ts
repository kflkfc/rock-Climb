// IK 姿态 11 段角色：按皮肤分化渲染（V1.2）。
// climber/kid/lady/suit = 人类换装；monkey/gorilla = 卡通动物（口鼻/耳朵/尾巴/爪掌）。
// 装饰全部纯渲染（裙摆/尾巴/发型不进物理——GDD 4.2 守则，渲染层可用 Math/时间）。
// 登顶定格（game.wonFreeze）：头部转向镜头回眸一笑，按皮肤配五官。
// 手指按抓法摆姿（开掌/半扣/全扣/捏），攀岩鞋按脚法区分（内侧踩/抹脚）。

import { Camera } from "./camera.ts";
import { Vec2 } from "@kkc/core/math/vec2.ts";
import { Pose, Limb } from "@kkc/core/model/skeleton.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { GripMethod } from "@kkc/core/sim/grip.ts";
import { characterById, CharacterDef } from "@kkc/core/model/characters.ts";

export const LIMB_COLOR: Record<Limb, string> = {
  LH: "#D7507E", // 左手 粉
  RH: "#6B4A8C", // 右手 紫
  LF: "#5F9A6A", // 左脚 绿
  RF: "#E5A636", // 右脚 橙
};

type Skin = CharacterDef["skin"];
type Pt = { x: number; y: number };

/** 皮肤配色：top/bottom/legs/foreArm 允许是毛色（动物）或衣料（人类） */
interface Palette {
  skin: string; // 裸露皮肤（人脸/手掌）
  skinDk: string;
  top: string; // 躯干+上臂
  bottom: string; // 髋部（短裤/裙腰/西裤/毛）
  legs: string; // 大小腿
  foreArm: string; // 前臂
  hair: string; // 后脑勺/毛发
  shoe: string;
  shoeHi: string;
  furLight?: string; // 动物浅色（口鼻/耳内/掌/银背）
  widthK: number; // 体宽系数（金刚壮、猴子/小孩细）
}

const PALETTES: Record<Skin, Palette> = {
  climber: {
    skin: "#A07458", skinDk: "#8A6049",
    top: "#D7507E", bottom: "#2B2B2B", legs: "#A07458", foreArm: "#A07458",
    hair: "#3A2E24", shoe: "#33373D", shoeHi: "#4B515A", widthK: 1,
  },
  kid: {
    skin: "#B98A6A", skinDk: "#9E7355",
    top: "#4A90D9", bottom: "#E5A636", legs: "#B98A6A", foreArm: "#B98A6A",
    hair: "#2B2B2B", shoe: "#D64A47", shoeHi: "#E98884", widthK: 0.8,
  },
  lady: {
    skin: "#C79B77", skinDk: "#A87F5E",
    top: "#C94F6D", bottom: "#C94F6D", legs: "#C79B77", foreArm: "#C79B77",
    hair: "#5A3A22", shoe: "#7A4A8C", shoeHi: "#9A6AAC", widthK: 0.9,
  },
  monkey: {
    skin: "#E8C79A", skinDk: "#C9A578",
    top: "#8B5A33", bottom: "#8B5A33", legs: "#8B5A33", foreArm: "#8B5A33",
    hair: "#8B5A33", shoe: "#8B5A33", shoeHi: "#E8C79A",
    furLight: "#E8C79A", widthK: 0.8,
  },
  gorilla: {
    skin: "#9A9AA4", skinDk: "#7C7C86",
    top: "#3B3B44", bottom: "#3B3B44", legs: "#3B3B44", foreArm: "#3B3B44",
    hair: "#3B3B44", shoe: "#3B3B44", shoeHi: "#9A9AA4",
    furLight: "#9A9AA4", widthK: 1.5,
  },
  suit: {
    skin: "#C79B77", skinDk: "#A87F5E",
    top: "#23262E", bottom: "#23262E", legs: "#23262E", foreArm: "#23262E",
    hair: "#1A1A1A", shoe: "#14151A", shoeHi: "#3A3D46", widthK: 1.05,
  },
};

const isAnimal = (s: Skin) => s === "monkey" || s === "gorilla";

function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

const nrm = (x: number, y: number): Pt => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};
const dd = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 画手指：局部坐标，+x = 手指伸向(前臂续向岩点)方向。按抓法摆姿。
 * open 平摊舒展 / half 半扣(指节弯) / full 全扣(强弯+拇指压) / pinch 拇指对四指。
 */
function drawFingers(
  ctx: CanvasRenderingContext2D,
  grip: GripMethod | null,
  sc: number,
  main: string,
  dark: string,
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
  } else {
    // pinch 捏：拇指在一侧、四指在另一侧，相向夹
    ctx.lineWidth = fw;
    [-0.12, 0.12].forEach((a) => drawFinger(a, [{ len: 9, turn: 0 }])); // 中间两指
    drawFinger(-0.9, [{ len: 8, turn: 0.5 }]); // 上侧指
    drawFinger(1.5, [{ len: 8, turn: -0.6 }]); // 拇指对侧夹
  }
}

/** 攀岩鞋：局部坐标，+x = 脚尖(小腿续向)方向。内侧踩=尖头点立 / 抹脚=平贴大底。 */
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

/** 回眸笑脸：局部坐标（已旋转到头部朝向，+y 向下巴）。五官整体右偏 = 扭头看镜头。 */
function drawWinFace(ctx: CanvasRenderingContext2D, R: number, skin: Skin, pal: Palette) {
  const ox = 0.13 * R; // 回眸偏移
  const dark = "#2B2318";

  // 动物：浅色面部底
  if (skin === "monkey") {
    ctx.fillStyle = pal.furLight!;
    ctx.beginPath(); // 心形脸底：两圆(眼周) + 口鼻椭圆
    ctx.arc(ox - 0.3 * R, -0.15 * R, 0.42 * R, 0, Math.PI * 2);
    ctx.arc(ox + 0.3 * R, -0.15 * R, 0.42 * R, 0, Math.PI * 2);
    ctx.ellipse(ox, 0.32 * R, 0.52 * R, 0.44 * R, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === "gorilla") {
    ctx.fillStyle = pal.furLight!;
    ctx.beginPath();
    ctx.ellipse(ox, 0.08 * R, 0.64 * R, 0.62 * R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2A2A32"; // 浓眉脊
    ctx.lineWidth = 0.14 * R;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ox - 0.42 * R, -0.3 * R);
    ctx.lineTo(ox + 0.42 * R, -0.3 * R);
    ctx.stroke();
  }

  // 眼睛
  if (skin === "suit") {
    // 墨镜：两片圆角镜 + 鼻梁
    ctx.fillStyle = "#101014";
    const gw = 0.42 * R;
    const gh = 0.3 * R;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(ox + sgn * 0.36 * R - gw / 2, -0.26 * R, gw, gh, 0.1 * R);
      ctx.fill();
    }
    ctx.strokeStyle = "#101014";
    ctx.lineWidth = 0.06 * R;
    ctx.beginPath();
    ctx.moveTo(ox - 0.16 * R, -0.12 * R);
    ctx.lineTo(ox + 0.16 * R, -0.12 * R);
    ctx.stroke();
  } else if (skin === "kid") {
    // 大圆眼 + 高光
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(ox + sgn * 0.32 * R, -0.12 * R, 0.15 * R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(ox + sgn * 0.32 * R + 0.05 * R, -0.17 * R, 0.05 * R, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 眯眯笑眼 ∩∩（猴/猩猩/攀岩者/美女通用）
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1.5, 0.09 * R);
    ctx.lineCap = "round";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ox + sgn * 0.32 * R, -0.08 * R, 0.16 * R, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    if (skin === "lady") {
      // 睫毛
      ctx.lineWidth = Math.max(1, 0.06 * R);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ox + sgn * 0.47 * R, -0.16 * R);
        ctx.lineTo(ox + sgn * 0.56 * R, -0.24 * R);
        ctx.stroke();
      }
    }
  }

  // 鼻（动物鼻孔 / 人小点）
  ctx.fillStyle = skin === "gorilla" ? "#2A2A32" : dark;
  if (isAnimal(skin)) {
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(ox + sgn * 0.1 * R, 0.14 * R, 0.05 * R, 0.07 * R, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 笑口：开口笑（弦向上的半月）
  const my = skin === "monkey" ? 0.42 * R : 0.3 * R;
  const mw = skin === "gorilla" ? 0.4 * R : 0.32 * R;
  ctx.fillStyle = skin === "lady" ? "#B03040" : "#5A2A20";
  ctx.beginPath();
  ctx.arc(ox, my, mw, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.closePath();
  ctx.fill();
  if (skin === "gorilla" || skin === "suit") {
    // 露齿
    ctx.fillStyle = "#F5EBD3";
    ctx.beginPath();
    ctx.arc(ox, my + 0.02 * R, mw * 0.82, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.closePath();
    ctx.fill();
  }

  // 腮红（硬汉和猩猩免了）
  if (skin !== "suit" && skin !== "gorilla") {
    ctx.fillStyle = "rgba(230,110,110,0.4)";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ox + sgn * 0.58 * R, 0.14 * R, 0.13 * R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawCharacter(ctx: CanvasRenderingContext2D, cam: Camera, pose: Pose, game: Game) {
  const skinId: Skin = characterById(game.characterId).skin;
  const pal = PALETTES[skinId];
  const S = (p: Vec2) => cam.toScreen(p);
  const sc = cam.scale;
  const t = performance.now() / 1000; // 纯渲染动效时钟（裙摆/尾巴）
  const limbW = 13 * sc * pal.widthK;
  const torsoW = 30 * sc * pal.widthK;
  const P = {
    pelvis: S(pose.pelvis),
    shoulderC: S(pose.shoulderC),
    head: S(pose.head),
    neck: S(pose.neck),
    hipL: S(pose.hipL),
    hipR: S(pose.hipR),
  };
  // 躯干朝向（屏幕空间）：down = 脊柱向下，right = 其垂线
  const down = nrm(P.pelvis.x - P.shoulderC.x, P.pelvis.y - P.shoulderC.y);
  const right: Pt = { x: -down.y, y: down.x };
  const torsoLen = dd(P.pelvis, P.shoulderC);
  const winFace = game.wonFreeze; // 登顶定格：回眸一笑

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

  // 腿（后层）
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    limb(ctx, S(k.root), S(k.ik.joint), limbW, pal.legs);
    limb(ctx, S(k.ik.joint), S(k.ik.end), limbW, pal.legs);
  }
  limb(ctx, P.hipL, P.hipR, torsoW * 0.9, pal.bottom); // 髋（短裤/裙腰/毛）
  limb(ctx, P.pelvis, P.shoulderC, torsoW, pal.top); // 躯干

  // 金刚银背：背部浅灰斑
  if (skinId === "gorilla") {
    ctx.fillStyle = "rgba(154,154,164,0.85)";
    ctx.beginPath();
    ctx.ellipse(
      P.pelvis.x - down.x * torsoLen * 0.3,
      P.pelvis.y - down.y * torsoLen * 0.3,
      torsoW * 0.34,
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

  // 美女裙摆：腰际挂下的摇摆裙（纯渲染，随时间左右摆）
  if (skinId === "lady") {
    const sway = Math.sin(t * 2.8) * 0.2;
    const skirtL = torsoLen * 0.52;
    const waistHalf = torsoW * 0.52;
    const hemHalf = torsoW * 0.95;
    const hemC: Pt = {
      x: P.pelvis.x + down.x * skirtL + right.x * sway * skirtL,
      y: P.pelvis.y + down.y * skirtL + right.y * sway * skirtL,
    };
    const wl: Pt = { x: P.pelvis.x - right.x * waistHalf, y: P.pelvis.y - right.y * waistHalf };
    const wr: Pt = { x: P.pelvis.x + right.x * waistHalf, y: P.pelvis.y + right.y * waistHalf };
    const hl: Pt = { x: hemC.x - right.x * hemHalf, y: hemC.y - right.y * hemHalf };
    const hr: Pt = { x: hemC.x + right.x * hemHalf, y: hemC.y + right.y * hemHalf };
    ctx.fillStyle = pal.top;
    ctx.beginPath();
    ctx.moveTo(wl.x, wl.y);
    ctx.lineTo(hl.x, hl.y);
    // 波浪裙边：两段二次曲线经过更垂的中点
    const mid: Pt = { x: hemC.x + down.x * skirtL * 0.18, y: hemC.y + down.y * skirtL * 0.18 };
    ctx.quadraticCurveTo(
      (hl.x + mid.x) / 2 + down.x * skirtL * 0.12,
      (hl.y + mid.y) / 2 + down.y * skirtL * 0.12,
      mid.x,
      mid.y,
    );
    ctx.quadraticCurveTo(
      (hr.x + mid.x) / 2 + down.x * skirtL * 0.12,
      (hr.y + mid.y) / 2 + down.y * skirtL * 0.12,
      hr.x,
      hr.y,
    );
    ctx.lineTo(wr.x, wr.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 手臂（上臂衣/毛色、前臂按皮肤）
  for (const l of ["LH", "RH"] as Limb[]) {
    const k = pose.limb[l];
    const j = S(k.ik.joint);
    const e = S(k.ik.end);
    limb(ctx, S(k.root), j, limbW, pal.top);
    limb(ctx, j, e, limbW, pal.foreArm);
    if (skinId === "suit") {
      // 白衬衫袖口：腕前一小截
      const cx = j.x + (e.x - j.x) * 0.8;
      const cy = j.y + (e.y - j.y) * 0.8;
      limb(ctx, { x: cx, y: cy } as Pt, { x: j.x + (e.x - j.x) * 0.92, y: j.y + (e.y - j.y) * 0.92 } as Pt, limbW, "#F5EBD3");
    }
  }

  // 颈 + 头
  const headR = Math.max(dd(P.neck, P.head), 12 * sc) * (skinId === "kid" || skinId === "gorilla" ? 1.12 : 1);
  const headUp = nrm(P.head.x - P.neck.x, P.head.y - P.neck.y);
  limb(ctx, P.shoulderC, P.neck, limbW * 0.9, skinId === "suit" ? pal.top : pal.legs === pal.top ? pal.top : pal.skin);
  const headAng = Math.atan2(headUp.y, headUp.x) + Math.PI / 2; // 局部 -y = 头顶

  ctx.save();
  ctx.translate(P.head.x, P.head.y);
  ctx.rotate(headAng);

  // 耳朵（头后层）：动物大圆耳 / 人小耳点
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
  }

  // 头底色：定格回眸 = 脸（肤色）；平时 = 后脑勺（发/毛色）
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fillStyle = winFace && !isAnimal(skinId) ? pal.skin : isAnimal(skinId) ? pal.top : pal.hair;
  ctx.fill();

  // 金刚头冠脊
  if (skinId === "gorilla") {
    ctx.fillStyle = pal.top;
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.82, headR * 0.5, headR * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 人类发际：回眸时头顶留发冠弧
  if (winFace && !isAnimal(skinId)) {
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    ctx.arc(0, 0, headR, Math.PI * 1.12, Math.PI * 1.88);
    ctx.closePath();
    ctx.fill();
  }

  // 攀岩者头带（前后视角都在额头高度）
  if (skinId === "climber") {
    ctx.strokeStyle = "#D64A47";
    ctx.lineWidth = headR * 0.24;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.92, -headR * 0.32);
    ctx.lineTo(headR * 0.92, -headR * 0.32);
    ctx.stroke();
  }

  // 美女马尾：脑后甩出、随时间摆
  if (skinId === "lady") {
    const ps = Math.sin(t * 2.6) * 0.3;
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = headR * 0.34;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(headR * 0.2, -headR * 0.85);
    ctx.quadraticCurveTo(headR * 1.15, -headR * 0.25, headR * (0.9 + ps * 0.4), headR * 1.0);
    ctx.stroke();
  }

  // 回眸一笑（登顶定格）
  if (winFace) drawWinFace(ctx, headR, skinId, pal);

  ctx.restore();

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
    drawFingers(ctx, game.c.limbs[l].grip, sc, isAnimal(skinId) ? pal.furLight! : pal.skin, pal.skinDk);
    ctx.restore();
  }

  // 肢端彩色把手环（可拖、辨识左右手脚）：细环不挡住手指/鞋细节
  for (const l of ["LF", "RF", "LH", "RH"] as Limb[]) {
    const e = S(pose.limb[l].ik.end);
    ctx.beginPath();
    ctx.arc(e.x, e.y, 8 * sc, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = LIMB_COLOR[l];
    ctx.stroke();
  }
}
