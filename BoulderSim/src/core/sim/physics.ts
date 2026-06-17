// 纯逻辑 · 攀岩物理核心（每帧 60Hz，本项目最难、优先攻）。
//
// 每帧流程（对齐 PRD §三）：
//  1 力分解：F重力 按墙角 → F∥(沿墙下滑) + F⊥(垂墙)
//  2 抓力上限：每肢端 max = 友好度 × 抓法适配 × 指力 × (1-疲劳)
//  3 平衡：重心 COM 投影是否落在支撑多边形内（≥3 稳；2 进失稳）
//  4 耐力：抓住持续扣（速度=重力分量÷匹配度×1/指力）；松手缓恢复
//  5 脱手：受力>max → 该肢脱手；剩 <2 肢 → 整体掉落
//
// 切片简化：单一指力总池代替每指；摩擦仅用 hold.friction 标量。

import {
  Vec2,
  v,
  add,
  sub,
  scale,
  norm,
  dist,
  len,
  rotate,
  clamp,
} from "../math/vec2.ts";
import { BodyParams } from "../model/body.ts";
import {
  Limb,
  LIMBS,
  isHand,
  resolvePose,
  desiredBend,
  maxReachOf,
  armReach,
  legReach,
  Pose,
  Orientation,
} from "../model/skeleton.ts";
import { Hold } from "./holds.ts";
import { GripMethod, gripTypeScore, contactAreaScore, directionalFit } from "./grip.ts";
import { drain, recover } from "./stamina.ts";
import { Tuning } from "../../config/tuning.ts";

export interface LimbState {
  attached: boolean;
  hold: Hold | null;
  grip: GripMethod | null;
  match: number; // 锁定时算定的匹配度 0..1（抓法环 UI 用）
  contactDist: number; // 接触点离岩点中心距离（接触面积用）
  stamina: number; // 0..1
  align: number; // 每帧实时方向对齐度 0..1（受力方向落在岩点锥内程度）
  /** 当末端自由时，把手的当前世界位置（被拖动 / 弹回） */
  freePos: Vec2;
  slipping: boolean; // 本帧是否因过载/耗尽而脱手（供特效）
}

export interface Climber {
  body: BodyParams;
  pelvis: Vec2;
  lean: number; // 脊柱倾斜（偏身，动态）
  shoulderTwist: number; // 肩线扭转（面向双手）
  hipTwist: number; // 髋线扭转（偏身/熏膝）
  limbs: Record<Limb, LimbState>;
  pose: Pose;
  /** 失衡持续时间（秒），超阈值触发强制脱手 */
  imbalanceT: number;
  fallen: boolean;
  /** 当前被玩家拖动的肢端（其 freePos 由输入控制，物理不自动摆放） */
  draggingLimb: Limb | null;
  /** 发力/锁臂混合 0..1：0=休息直臂悬挂，1=移动中屈臂锁定上拉 */
  pullBlend: number;
  /** 各肢端连续弯曲量 ∈[-1,1]（逐帧缓动到目标符号 → 关节平滑换侧不突变） */
  bend: Record<Limb, number>;
}

/** 由 Climber 构造姿态解算所需的朝向对象 */
export function oriOf(c: Climber): Orientation {
  return { lean: c.lean, shoulderTwist: c.shoulderTwist, hipTwist: c.hipTwist };
}

export interface StepResult {
  slipped: Limb[];
  fell: boolean;
  balanced: boolean;
  comInside: boolean;
}

const IMBALANCE_LIMIT = 1.4; // 失衡持续多少秒后强制脱手

export function attachedLimbs(c: Climber): Limb[] {
  return LIMBS.filter((l) => c.limbs[l].attached && c.limbs[l].hold);
}

/** 某肢端末端的世界目标：抓住=岩点位置；自由=把手位置 */
export function limbTarget(c: Climber, l: Limb): Vec2 {
  const st = c.limbs[l];
  return st.attached && st.hold ? st.hold.pos : st.freePos;
}

/** 墙角 → 重力沿墙/垂墙分量系数。vertical(90°)=全沿墙。 */
export function gravityComponents(wallAngleDeg: number): { para: number; perp: number } {
  const r = (wallAngleDeg * Math.PI) / 180;
  return { para: Math.abs(Math.sin(r)), perp: Math.abs(Math.cos(r)) };
}

/**
 * 骨盆跟随求解（这是"能不能向上爬"的关键）：
 *  - 每个抓住的【手】把骨盆往"它下方约一臂长"拉（身体悬于手下）
 *  - 每个抓住的【脚】把骨盆往"它上方约一腿长"顶（身体立于脚上）
 *  - 取平均得自然攀爬站姿；平滑跟随 → 移动肢端到更高岩点并抓住后，
 *    骨盆随之上移，重心真正上升，可以一步步爬上去。
 *  - 最后硬钳制：任何抓住肢端不得超过伸展极限（必须先把低处肢端也挪上来）。
 */
function solvePelvis(c: Climber, dt: number, t: Tuning) {
  const up = rotate({ x: 0, y: -1 }, c.lean); // 攀爬向上
  const down = scale(up, -1); // 沿墙向下（重力）
  const torsoDown = scale(up, -c.body.torsoLen); // 肩→骨盆 偏移
  // 发力锁臂：移动中(pullBlend↑)肩更靠近手→支撑臂屈起锁定、骨盆被上拉(带动重心)
  const hangF = t.hangFrac + (t.pullHang - t.hangFrac) * c.pullBlend;

  // 全部肢端共同决定骨盆目标：抓住=权重1；自由(正在伸手)=权重 reachLead，
  // 让身体"跟着伸手一起动"（联动/重心跟随），而不是只有那条胳膊在伸。
  let tgt = v(0, 0);
  let wsum = 0;
  for (const l of LIMBS) {
    const st = c.limbs[l];
    const attached = st.attached && st.hold;
    const fullW = isHand(l) ? 0.85 : 0.8;
    // 权重：抓住=full；正在拖动的肢端也用 full（身体按"抓住后"的位置预先就位，
    // 松手抓住瞬间目标不变 → 没有突然调整姿态）；其它自由肢端用 reachLead。
    const w = attached || l === c.draggingLimb ? fullW : t.reachLead;
    if (w <= 0) continue;
    const pos = attached ? st.hold!.pos : st.freePos;
    let contrib: Vec2;
    if (isHand(l)) {
      const shoulderTgt = add(pos, scale(down, armReach(c.body) * hangF));
      contrib = add(shoulderTgt, torsoDown);
    } else {
      contrib = add(pos, scale(up, legReach(c.body) * t.standFrac));
    }
    tgt = add(tgt, scale(contrib, w));
    wsum += w;
  }
  if (wsum > 0) {
    const target = scale(tgt, 1 / wsum);
    // 帧率无关的平滑跟随：身体逐步追上肢端 → 攀爬有"发力上移"的手感
    const k = 1 - Math.pow(1 - t.pelvisFollow, dt * 60);
    c.pelvis = add(c.pelvis, scale(sub(target, c.pelvis), k));
  }

  // 两/三点平衡(counterbalance)：抬肢减少支撑时，重心(骨盆 X)主动移到剩余支撑点上方，
  // 读出"靠剩余两三点平衡、再发力移动"，而非四点死贴墙。抬得越多移得越果断。
  // 把"正在拖动"的肢端按其目标位也算作支撑点 → 抓住瞬间支撑集合不变、重心目标连续。
  const supX: number[] = [];
  for (const l of LIMBS) {
    if (c.limbs[l].attached && c.limbs[l].hold) supX.push(c.limbs[l].hold!.pos.x);
    else if (l === c.draggingLimb) supX.push(c.limbs[l].freePos.x);
  }
  if (supX.length >= 1 && supX.length < 4) {
    const cx = supX.reduce((a, b) => a + b, 0) / supX.length;
    const strength = Math.min(0.9, (4 - supX.length) * t.balanceShift);
    const kb = 1 - Math.pow(1 - strength, dt * 60);
    c.pelvis.x += (cx - c.pelvis.x) * kb;
  }

  // 硬钳制：任何抓住肢端都不得超过最大伸展（设计文档：手≤臂长 / 脚≤腿长）
  for (let kk = 0; kk < 4; kk++) {
    const pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    let corr = v(0, 0);
    let n = 0;
    for (const l of attachedLimbs(c)) {
      const root = pose.limb[l].root;
      const hold = c.limbs[l].hold!;
      const d = dist(root, hold.pos);
      const maxR = maxReachOf(c.body, l) * t.reachSlack;
      if (d > maxR) {
        corr = add(corr, scale(norm(sub(hold.pos, root)), d - maxR));
        n++;
      }
    }
    if (n === 0) break;
    c.pelvis = add(c.pelvis, scale(corr, 1 / n));
  }
}

/**
 * 求解身体朝向：肩线面向双手、髋线面向双脚、脊柱偏向双手（横移重心去对齐侧向点）。
 * 目标主要由几何决定 → 稳定不振荡；帧率无关缓动 + 限幅，让身体自然转动而非直上直下。
 */
function solveOrientation(c: Climber, dt: number, t: Tuning) {
  const tg = targetsOf(c);
  const lim = t.rotLimit;
  const shoulderTgt = clamp(Math.atan2(tg.RH.y - tg.LH.y, tg.RH.x - tg.LH.x), -lim, lim);
  const hipTgt = clamp(Math.atan2(tg.RF.y - tg.LF.y, tg.RF.x - tg.LF.x), -lim, lim);

  // 脊柱方向 = 支撑脚质心 → 支撑手质心（脚→头）。可大幅倾斜，乃至双脚在上的倒挂。
  const hands = LIMBS.filter((l) => isHand(l) && c.limbs[l].attached && c.limbs[l].hold);
  const feet = LIMBS.filter((l) => !isHand(l) && c.limbs[l].attached && c.limbs[l].hold);
  let leanTgt = c.lean;
  if (hands.length > 0 && feet.length > 0) {
    const cen = (ls: Limb[]) => {
      let x = 0;
      let y = 0;
      for (const l of ls) {
        x += c.limbs[l].hold!.pos.x;
        y += c.limbs[l].hold!.pos.y;
      }
      return { x: x / ls.length, y: y / ls.length };
    };
    const hc = cen(hands);
    const fc = cen(feet);
    const ux = hc.x - fc.x;
    const uy = hc.y - fc.y;
    if (Math.hypot(ux, uy) > 1e-3) leanTgt = Math.atan2(ux, -uy); // rotate(UP,leanTgt)≈脚→手方向
  }

  const k = 1 - Math.pow(1 - t.rotFollow, dt * 60);
  c.shoulderTwist += (shoulderTgt - c.shoulderTwist) * k;
  c.hipTwist += (hipTgt - c.hipTwist) * k;
  // lean 取最短角差缓动（允许大角度/倒置，过零不抖）
  let dl = leanTgt - c.lean;
  while (dl > Math.PI) dl -= Math.PI * 2;
  while (dl < -Math.PI) dl += Math.PI * 2;
  c.lean += dl * k;
}

/** 各肢端连续弯曲量缓动到几何期望符号 → 肘/膝换侧"经过伸直"平滑旋转，不突变。 */
function updateBend(c: Climber, dt: number) {
  const tgt = desiredBend(c.body, c.pelvis, oriOf(c), targetsOf(c));
  const k = 1 - Math.pow(1 - 0.14, dt * 60); // ~0.1s 旋转过渡
  for (const l of LIMBS) c.bend[l] += (tgt[l] - c.bend[l]) * k;
}

/** 发力/锁臂混合：有手离点(正在伸够移动)→趋向锁臂上拉；落定休息→趋向直臂悬挂。 */
function updatePullBlend(c: Climber, dt: number) {
  const moving = !c.limbs.LH.attached || !c.limbs.RH.attached;
  const target = moving ? 1 : 0;
  const k = 1 - Math.pow(1 - 0.1, dt * 60);
  c.pullBlend += (target - c.pullBlend) * k;
}

/**
 * 自由肢端（非玩家拖动者）柔和趋向自然姿态：
 *  - 脚：flag 摆腿——向一侧斜下甩出做配重，而非僵直下垂。
 *  - 手：放松微屈悬于身侧，柔和回位（够不到松手不会突然下垂、生硬）。
 * 帧率无关缓动(~0.25s) → 自然不突兀。注：自由肢端不计入支撑/重心，纯姿态。
 */
function solveFreeLimbs(c: Climber, dt: number) {
  const pose = c.pose;
  if (!pose) return;
  const up = rotate({ x: 0, y: -1 }, c.lean);
  const down = scale(up, -1);
  const right = { x: -up.y, y: up.x };
  const att = attachedLimbs(c);
  let supX = c.pelvis.x;
  if (att.length > 0) {
    supX = 0;
    for (const l of att) supX += c.limbs[l].hold!.pos.x;
    supX /= att.length;
  }
  const k = 1 - Math.pow(1 - 0.1, dt * 60);
  for (const l of LIMBS) {
    const st = c.limbs[l];
    if (st.attached || l === c.draggingLimb) continue;
    const root = pose.limb[l].root;
    let tgt: Vec2;
    if (isHand(l)) {
      // 放松微屈，悬于身侧、略收向身体中线
      tgt = add(
        root,
        add(scale(down, armReach(c.body) * 0.5), scale(right, (c.pelvis.x - root.x) * 0.15)),
      );
    } else {
      // flag 摆腿：向一侧斜下甩出（远离支撑质心的一侧，做出明显的配重摆腿）
      const d = root.x - supX;
      const side = Math.abs(d) < 6 ? (l === "LF" ? -1 : 1) : Math.sign(d);
      tgt = add(
        root,
        add(scale(down, legReach(c.body) * 0.66), scale(right, side * legReach(c.body) * 0.5)),
      );
    }
    st.freePos = add(st.freePos, scale(sub(tgt, st.freePos), k));
  }
}

/** 双手受力方向水平相反时的张力需求（夹在两个侧向点之间需主动对抗）。 */
function handTension(c: Climber, l: Limb, loadAngle: number): number {
  if (!isHand(l)) return 0;
  const other: Limb = l === "LH" ? "RH" : "LH";
  const os = c.limbs[other];
  if (!os.attached || !os.hold) return 0;
  const oa = Math.atan2(c.pose.com.y - os.hold.pos.y, c.pose.com.x - os.hold.pos.x);
  const hx1 = Math.cos(loadAngle);
  const hx2 = Math.cos(oa);
  return hx1 * hx2 < 0 ? Math.min(Math.abs(hx1), Math.abs(hx2)) * 30 : 0;
}

function targetsOf(c: Climber): Record<Limb, Vec2> {
  return {
    LH: limbTarget(c, "LH"),
    RH: limbTarget(c, "RH"),
    LF: limbTarget(c, "LF"),
    RF: limbTarget(c, "RF"),
  };
}

/**
 * 推进一帧物理。返回本帧事件。
 * @param wallAngleDeg 当前墙角（切片恒为 90）
 */
export function stepClimber(
  c: Climber,
  wallAngleDeg: number,
  dt: number,
  t: Tuning,
): StepResult {
  const res: StepResult = { slipped: [], fell: false, balanced: true, comInside: true };
  for (const l of LIMBS) c.limbs[l].slipping = false;
  if (c.fallen) {
    c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    return res;
  }

  const { para, perp } = gravityComponents(wallAngleDeg);
  // 负载与抓力上限统一用"体重单位"，避免量纲不一致导致开局即脱手
  const Fpara = c.body.weight * para; // 沿墙下滑总力
  const Fperp = c.body.weight * perp; // 垂墙（拉离/压入）总力

  // 1+ 发力混合 → 自由肢端摆放 → 骨盆跟随 → 身体朝向 → 关节弯曲 → 姿态
  updatePullBlend(c, dt);
  solveFreeLimbs(c, dt);
  solvePelvis(c, dt, t);
  solveOrientation(c, dt, t);
  updateBend(c, dt);
  c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);

  const att = attachedLimbs(c);

  // 整体掉落：抓点 < 2
  if (att.length < 2) {
    c.fallen = true;
    res.fell = true;
    res.balanced = false;
    res.comInside = false;
    return res;
  }

  // 3 平衡（2D 侧视）：重心 X 是否落在抓点 X 跨度内（设计文档明确：
  // "重心 X 坐标是否落在两个支撑点 X 范围内"）。核心越稳，容差越大。
  const comInside = comBalanced(c, att);
  res.comInside = comInside;
  if (!comInside) {
    c.imbalanceT += dt;
    res.balanced = false;
  } else {
    c.imbalanceT = Math.max(0, c.imbalanceT - dt * 1.5);
  }

  // 2 抓力上限 + 4 耐力 + 5 脱手
  // 负载分配：手/脚比例随墙角变（直壁≈50/50，越仰手承重越多 → 对齐设计文档表）
  const handFrac = 0.5 + 0.4 * perp; // 垂直 perp=0 →0.5；屋檐 perp≈1 →0.9
  const handCount = att.filter(isHand).length;
  const footCount = att.length - handCount;
  const wHand = handCount > 0 ? handFrac / handCount : 0;
  const wFoot = footCount > 0 ? (1 - handFrac) / footCount : 0;
  const totalLoad = Fpara + Fperp * 0.6;

  const com = c.pose.com;
  for (const l of att) {
    const st = c.limbs[l];
    const hold = st.hold!;
    const w = isHand(l) ? wHand : wFoot;
    let load = totalLoad * w;
    // 失衡时该侧负载放大（核心越稳放大越小）
    if (!comInside) load *= 1 + t.imbalanceDrain * (1.2 - c.body.coreStability);

    // 方向对齐（每帧实时）：手悬向重心 / 脚撑离重心 的受力轴 vs 岩点可用方向锥。
    // 身体（重心）位置/旋转改变受力轴 → 错向则 align 低 → 抓力骤降、耐力急耗。
    const loadAngle = isHand(l)
      ? Math.atan2(com.y - hold.pos.y, com.x - hold.pos.x)
      : Math.atan2(hold.pos.y - com.y, hold.pos.x - com.x);
    const align = directionalFit(loadAngle, hold.pullDir, hold.pullTol);
    st.align = align;
    const alignEff = Math.pow(align, t.dirPenalty);

    const adapt = gripTypeScore(hold.type, st.grip!);
    const baseMatch = adapt * contactAreaScore(st.contactDist, hold.radius);
    const liveMatch = Math.max(0.05, baseMatch * alignEff);

    // 抓力上限（体重单位），随对齐缩放：错向有效抓力骤降；不乘疲劳（耐力独立处理）。
    const maxForce =
      hold.friendliness *
      (0.5 + 0.5 * adapt) *
      c.body.fingerStrength *
      t.capacity *
      t.maxForceK;
    const effMax = maxForce * (0.3 + 0.7 * alignEff);

    // 张力对抗：夹在两个方向相反的点之间需主动发力维持，叠加耐力消耗
    const tension = handTension(c, l, loadAngle) * t.tensionCost * (1.2 - c.body.coreStability);

    // 耐力消耗 = 负载 ÷ 实时匹配度 × (1/指力) + 张力开销（匹配/对齐越低掉得越快）
    const drainRate =
      ((load / liveMatch) * (1 / Math.max(0.2, c.body.fingerStrength)) * t.staminaDrain +
        tension) *
      0.0013;
    st.stamina = drain(st.stamina, drainRate, dt);

    const overloaded = load > effMax * 1.6;
    if (overloaded || st.stamina <= 0) {
      st.freePos = { ...hold.pos }; // 从原位脱离，由 solveFreeLimbs 柔和摆出，不突跳
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.align = 1;
      res.slipped.push(l);
    }
  }

  // 失衡过久 → 最弱抓点强制脱手
  if (c.imbalanceT > IMBALANCE_LIMIT) {
    const stillAtt = attachedLimbs(c);
    if (stillAtt.length > 0) {
      const weakest = stillAtt.reduce((a, b) =>
        c.limbs[a].stamina <= c.limbs[b].stamina ? a : b,
      );
      const st = c.limbs[weakest];
      st.freePos = { ...st.hold!.pos };
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.align = 1;
      res.slipped.push(weakest);
      c.imbalanceT = 0;
    }
  }

  // 恢复自由肢端耐力
  for (const l of LIMBS) {
    const st = c.limbs[l];
    if (!st.attached) {
      st.stamina = recover(st.stamina, t.staminaRecover, dt);
      st.align = 1;
    }
  }

  // 再次掉落判定
  if (attachedLimbs(c).length < 2) {
    c.fallen = true;
    res.fell = true;
  }

  c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
  return res;
}

/**
 * 2D 侧视平衡判定：重心 X 落在抓点 X 跨度（±核心容差）内。
 * 单脚/单点不足以平衡；≥2 抓点才有支撑跨度。
 */
export function comBalanced(c: Climber, att = attachedLimbs(c)): boolean {
  if (att.length < 2) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const l of att) {
    const x = c.limbs[l].hold!.pos.x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const margin = 12 + c.body.coreStability * 34; // 核心越稳越不易失衡
  return c.pose.com.x >= min - margin && c.pose.com.x <= max + margin;
}

/** 当前是否平衡（供 UI 提示）。 */
export function isBalanced(c: Climber): boolean {
  return comBalanced(c);
}

export { len };
