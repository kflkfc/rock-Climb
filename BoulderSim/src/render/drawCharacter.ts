// IK 姿态 11 段角色：扁平手绘 + 颗粒，肢端彩色把手（粉=LH/紫=RH/绿=LF/橙=RF）。

import { Camera } from "./camera.ts";
import { Vec2 } from "../core/math/vec2.ts";
import { Pose, Limb } from "../core/model/skeleton.ts";

export const LIMB_COLOR: Record<Limb, string> = {
  LH: "#D7507E", // 左手 粉
  RH: "#6B4A8C", // 右手 紫
  LF: "#5F9A6A", // 左脚 绿
  RF: "#E5A636", // 右脚 橙
};
const SKIN = "#A07458";
const SHIRT = "#D7507E";
const SHORTS = "#2B2B2B";

function limb(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  w: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pose: Pose,
) {
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
  // 短裤
  limb(ctx, S(pose.hipL), S(pose.hipR), torsoW * 0.9, SHORTS);

  // 躯干 + 上衣
  limb(ctx, P.pelvis, P.shoulderC, torsoW, SHIRT);

  // 手臂（上臂带袖色，前臂肤色）
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

  // 脚掌：踝处沿小腿方向画一只朝前的脚（让"挂脚/踩点"读得出来）
  for (const l of ["LF", "RF"] as Limb[]) {
    const k = pose.limb[l];
    const e = S(k.ik.end);
    const j = S(k.ik.joint);
    const ang = Math.atan2(e.y - j.y, e.x - j.x); // 小腿朝向
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang + Math.PI / 2); // 脚掌≈垂直于小腿
    ctx.beginPath();
    ctx.ellipse(0, 2 * sc, 13 * sc, 7 * sc, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3A3A3A"; // 攀岩鞋
    ctx.fill();
    ctx.restore();
  }

  // 肢端彩色把手（可拖）：脚的把手略小，手的略大
  for (const l of ["LF", "RF", "LH", "RH"] as Limb[]) {
    const e = S(pose.limb[l].ik.end);
    const hr = (l === "LH" || l === "RH" ? 10 : 8) * sc;
    ctx.beginPath();
    ctx.arc(e.x, e.y, hr, 0, Math.PI * 2);
    ctx.fillStyle = LIMB_COLOR[l];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
  }
}
