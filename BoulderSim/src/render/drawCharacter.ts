// IK 姿态 11 段角色：扁平手绘 + 颗粒。
// Phase B：手指按抓法摆姿（开掌/半扣/全扣/捏），攀岩鞋按脚法区分（内侧踩/抹脚），
// 朝向随前臂/小腿。肢端保留彩色把手环（可拖、辨识左右手脚）。

import { Camera } from "./camera.ts";
import { Vec2 } from "../core/math/vec2.ts";
import { Pose, Limb } from "../core/model/skeleton.ts";
import { Game } from "../core/sim/gameState.ts";
import { GripMethod } from "../core/sim/grip.ts";

export const LIMB_COLOR: Record<Limb, string> = {
  LH: "#D7507E", // 左手 粉
  RH: "#6B4A8C", // 右手 紫
  LF: "#5F9A6A", // 左脚 绿
  RF: "#E5A636", // 右脚 橙
};
const SKIN = "#A07458";
const SKIN_DK = "#8A6049";
const SHIRT = "#D7507E";
const SHORTS = "#2B2B2B";
const SHOE = "#33373D";
const SHOE_HI = "#4B515A";

function limb(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * 画手指：局部坐标，+x = 手指伸向(前臂续向岩点)方向。按抓法摆姿。
 * open 平摊舒展 / half 半扣(指节弯) / full 全扣(强弯+拇指压) / pinch 拇指对四指。
 */
function drawFingers(ctx: CanvasRenderingContext2D, grip: GripMethod | null, sc: number) {
  ctx.strokeStyle = SKIN;
  ctx.fillStyle = SKIN;
  ctx.lineCap = "round";
  const fw = 3.4 * sc; // 手指粗
  // 手掌
  ctx.lineWidth = 1;
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, 0, 5.2 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SKIN;
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
    ctx.strokeStyle = SKIN_DK;
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
function drawShoe(ctx: CanvasRenderingContext2D, grip: GripMethod | null, sc: number) {
  ctx.fillStyle = SHOE;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  if (grip === "smear") {
    // 抹脚：平贴大底，较宽、底面与墙接触
    ctx.beginPath();
    ctx.ellipse(1 * sc, 1.5 * sc, 13 * sc, 6.5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = SHOE_HI;
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
    ctx.fillStyle = SHOE_HI; // 鞋面高光
    ctx.beginPath();
    ctx.ellipse(-1 * sc, -1.5 * sc, 5 * sc, 2 * sc, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCharacter(ctx: CanvasRenderingContext2D, cam: Camera, pose: Pose, game: Game) {
  const S = (p: Vec2) => cam.toScreen(p);
  const sc = cam.scale;
  const limbW = 13 * sc;
  const torsoW = 30 * sc;
  const P = {
    pelvis: S(pose.pelvis),
    shoulderC: S(pose.shoulderC),
    head: S(pose.head),
    neck: S(pose.neck),
  };

  // 腿（后层）
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    limb(ctx, S(k.root), S(k.ik.joint), limbW, SKIN);
    limb(ctx, S(k.ik.joint), S(k.ik.end), limbW, SKIN);
  }
  limb(ctx, S(pose.hipL), S(pose.hipR), torsoW * 0.9, SHORTS); // 短裤
  limb(ctx, P.pelvis, P.shoulderC, torsoW, SHIRT); // 躯干

  // 手臂（上臂袖色、前臂肤色）
  for (const l of ["LH", "RH"] as Limb[]) {
    const k = pose.limb[l];
    limb(ctx, S(k.root), S(k.ik.joint), limbW, SHIRT);
    limb(ctx, S(k.ik.joint), S(k.ik.end), limbW, SKIN);
  }

  // 颈 + 头
  limb(ctx, P.shoulderC, P.neck, limbW * 0.9, SKIN);
  ctx.beginPath();
  ctx.arc(P.head.x, P.head.y, 20 * sc, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();

  // 攀岩鞋（按脚法 + 朝向小腿续向）
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    const e = S(k.ik.end);
    const j = S(k.ik.joint);
    const ang = Math.atan2(e.y - j.y, e.x - j.x); // 小腿→脚尖
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    drawShoe(ctx, game.c.limbs[l].grip, sc);
    ctx.restore();
  }

  // 手指（按抓法 + 朝向前臂续向）
  for (const l of ["LH", "RH"] as Limb[]) {
    const k = pose.limb[l];
    const e = S(k.ik.end);
    const j = S(k.ik.joint);
    const ang = Math.atan2(e.y - j.y, e.x - j.x); // 前臂→手
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    drawFingers(ctx, game.c.limbs[l].grip, sc);
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
