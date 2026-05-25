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
} from "../math/vec2.ts";
import { BodyParams } from "../model/body.ts";
import {
  Limb,
  LIMBS,
  isHand,
  resolvePose,
  maxReachOf,
  armReach,
  legReach,
  Pose,
} from "../model/skeleton.ts";
import { Hold } from "./holds.ts";
import { GripMethod, gripTypeScore } from "./grip.ts";
import { drain, recover } from "./stamina.ts";
import { Tuning } from "../../config/tuning.ts";

export interface LimbState {
  attached: boolean;
  hold: Hold | null;
  grip: GripMethod | null;
  match: number; // 锁定时算定的匹配度 0..1
  contactDist: number; // 接触点离岩点中心距离（接触面积用）
  stamina: number; // 0..1
  /** 当末端自由时，把手的当前世界位置（被拖动 / 弹回） */
  freePos: Vec2;
  slipping: boolean; // 本帧是否因过载/耗尽而脱手（供特效）
}

export interface Climber {
  body: BodyParams;
  pelvis: Vec2;
  lean: number; // 身体倾斜（跟随墙角）
  limbs: Record<Limb, LimbState>;
  pose: Pose;
  /** 失衡持续时间（秒），超阈值触发强制脱手 */
  imbalanceT: number;
  fallen: boolean;
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

  const att = attachedLimbs(c);
  if (att.length > 0) {
    let tgt = v(0, 0);
    for (const l of att) {
      const hold = c.limbs[l].hold!;
      if (isHand(l)) {
        // 肩悬于手下方 hangFrac×臂长 → 骨盆 = 肩目标 +(骨盆-肩)
        const shoulderTgt = add(hold.pos, scale(down, armReach(c.body) * t.hangFrac));
        tgt = add(tgt, add(shoulderTgt, torsoDown));
      } else {
        // 髋立于脚上方 standFrac×腿长（≈骨盆）
        tgt = add(tgt, add(hold.pos, scale(up, legReach(c.body) * t.standFrac)));
      }
    }
    const target = scale(tgt, 1 / att.length);
    // 帧率无关的平滑跟随：身体逐步追上肢端 → 攀爬有"发力上移"的手感
    const k = 1 - Math.pow(1 - t.pelvisFollow, dt * 60);
    c.pelvis = add(c.pelvis, scale(sub(target, c.pelvis), k));
  }

  // 硬钳制：任何抓住肢端都不得超过最大伸展（设计文档：手≤臂长 / 脚≤腿长）
  for (let kk = 0; kk < 4; kk++) {
    const pose = resolvePose(c.body, c.pelvis, c.lean, targetsOf(c));
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
    c.pose = resolvePose(c.body, c.pelvis, c.lean, targetsOf(c));
    return res;
  }

  const { para, perp } = gravityComponents(wallAngleDeg);
  // 负载与抓力上限统一用"体重单位"，避免量纲不一致导致开局即脱手
  const Fpara = c.body.weight * para; // 沿墙下滑总力
  const Fperp = c.body.weight * perp; // 垂墙（拉离/压入）总力

  // 1+ 骨盆跟随 & 姿态
  solvePelvis(c, dt, t);
  c.pose = resolvePose(c.body, c.pelvis, c.lean, targetsOf(c));

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

  for (const l of att) {
    const st = c.limbs[l];
    const hold = st.hold!;
    const w = isHand(l) ? wHand : wFoot;
    let load = totalLoad * w;
    // 失衡时该侧负载放大（核心越稳放大越小）
    if (!comInside) load *= 1 + t.imbalanceDrain * (1.2 - c.body.coreStability);

    const adapt = gripTypeScore(hold.type, st.grip!);
    // 抓力上限与负载同量纲（体重单位）。不乘疲劳——疲劳由耐力独立处理，
    // 仅当严重过载(>1.6×)才立即脱手；错误抓法主要表现为耐力急耗（教学性）。
    const maxForce =
      hold.friendliness *
      (0.5 + 0.5 * adapt) *
      c.body.fingerStrength *
      t.capacity *
      t.maxForceK;

    // 耐力消耗速度 = 负载 ÷ 匹配度 × (1/指力)（匹配度越低掉得越快）
    const drainRate =
      (load / Math.max(0.08, st.match)) *
      (1 / Math.max(0.2, c.body.fingerStrength)) *
      t.staminaDrain *
      0.0013;
    st.stamina = drain(st.stamina, drainRate, dt);

    const overloaded = load > maxForce * 1.6;
    if (overloaded || st.stamina <= 0) {
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.freePos = limbTargetFallback(c, l);
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
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.freePos = limbTargetFallback(c, weakest);
      res.slipped.push(weakest);
      c.imbalanceT = 0;
    }
  }

  // 恢复自由肢端耐力
  for (const l of LIMBS) {
    const st = c.limbs[l];
    if (!st.attached) st.stamina = recover(st.stamina, t.staminaRecover, dt);
  }

  // 再次掉落判定
  if (attachedLimbs(c).length < 2) {
    c.fallen = true;
    res.fell = true;
  }

  c.pose = resolvePose(c.body, c.pelvis, c.lean, targetsOf(c));
  return res;
}

/** 脱手后把手回弹到根关节附近一个可见位置 */
function limbTargetFallback(c: Climber, l: Limb): Vec2 {
  const pose = c.pose ?? resolvePose(c.body, c.pelvis, c.lean, targetsOf(c));
  const root = pose.limb[l].root;
  const reach = maxReachOf(c.body, l) * 0.55;
  return add(root, v(isHand(l) ? 0 : 0, isHand(l) ? -reach * 0.3 : reach * 0.6));
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
