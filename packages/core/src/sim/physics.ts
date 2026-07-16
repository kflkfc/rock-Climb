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
import { BodyParams, flexSlack } from "../model/body.ts";
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
import { Hold, effectiveFriction } from "./holds.ts";
import {
  GripMethod,
  gripTypeScore,
  contactAreaScore,
  directionalFit,
  isPullingFootGrip,
} from "./grip.ts";
import { GRIP_DRAIN_MUL } from "./gripTable.ts";
import { contactCoverage, limbRadiusOf } from "./contact.ts";
import { drain, recover } from "./stamina.ts";
import { Tuning } from "../config/tuning.ts";
import { dsin, dcos, datan2, dpow, dhypot } from "../math/dmath.ts";

export interface LimbState {
  attached: boolean;
  hold: Hold | null;
  grip: GripMethod | null;
  match: number; // 锁定时算定的匹配度 0..1（抓法环 UI 用）
  contactDist: number; // 接触点离岩点中心距离（接触面积用）
  /** 接触点相对岩点中心的偏移（松手不吸附：抓在哪就在哪）。gripPos = hold.pos + contactOff */
  contactOff: Vec2;
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
  /** 混合法①：骨盆速度（弹簧-阻尼积分 → 伸手有动量跟随/过冲，再阻尼稳定） */
  pelvisVel: Vec2;
  /** 混合法③：自由肢端 Verlet 上一帧位置（次级摆动：悬腿会荡、跟随身体） */
  freePrev: Record<Limb, Vec2>;
  /** Dyno 腾空状态（null=不在腾空）。t 累计秒；window 内需抓到点否则坠落；
   *  excluded = 起跳时释放的岩点 id（本次腾空不可重抓，否则永远飞不出去） */
  dyno: { t: number; leadLimb: Limb; excluded: string[] } | null;
  /** 抓法熟练度快照（tape 起点冻结——run 内不变，保回放确定性）。60/90 档匹配加成 */
  proficiency: Record<string, number>;
  /** 指伤剩余秒（>0 时有效指力 ×0.8）。低熟练全扣劳损累积触发（gameState） */
  injuryT: number;
}

/** 由 Climber 构造姿态解算所需的朝向对象 */
export function oriOf(c: Climber): Orientation {
  return { lean: c.lean, shoulderTwist: c.shoulderTwist, hipTwist: c.hipTwist };
}

/** 脱手归因（HUD 教学提示：把物理黑盒变成可学习的规则） */
export type SlipReason = "stamina" | "overload" | "direction" | "imbalance";

export const SLIP_REASON_LABEL: Record<SlipReason, string> = {
  stamina: "耐力耗尽",
  overload: "超出抓力上限",
  direction: "受力方向错误",
  imbalance: "失衡过久",
};

export interface StepResult {
  slipped: Limb[];
  slipReasons: Partial<Record<Limb, SlipReason>>;
  fell: boolean;
  balanced: boolean;
  comInside: boolean;
}

const IMBALANCE_LIMIT = 1.4; // 失衡持续多少秒后强制脱手

export function attachedLimbs(c: Climber): Limb[] {
  return LIMBS.filter((l) => c.limbs[l].attached && c.limbs[l].hold);
}

/** 个体化伸展宽容 = 全局调参 × 柔韧系数（柔韧 0.5 中位 = ×1.0） */
export function reachSlackOf(b: BodyParams, t: Tuning): number {
  return t.reachSlack * flexSlack(b);
}

/** 抓住状态下肢端的实际接触位置（岩点中心 + 接触偏移）；未抓时退回 freePos */
export function gripPos(st: LimbState): Vec2 {
  return st.hold ? add(st.hold.pos, st.contactOff) : st.freePos;
}

/** 某肢端末端的世界目标：抓住=实际接触位置（不吸附中心）；自由=把手位置 */
export function limbTarget(c: Climber, l: Limb): Vec2 {
  const st = c.limbs[l];
  return st.attached && st.hold ? gripPos(st) : st.freePos;
}

/** 墙角 → 重力沿墙/垂墙分量系数。vertical(90°)=全沿墙。 */
export function gravityComponents(wallAngleDeg: number): { para: number; perp: number } {
  const r = (wallAngleDeg * Math.PI) / 180;
  return { para: Math.abs(dsin(r)), perp: Math.abs(dcos(r)) };
}

/**
 * 带符号的垂墙分量（P1 板墙）：
 *  - perpPull：把身体拉离墙面（仰角/屋檐，>90°）——增加手负载
 *  - perpPress：把身体压进墙面（板墙，<90°）——脚摩擦主导、手几乎减负
 */
export function gravitySigned(wallAngleDeg: number): {
  para: number;
  perpPull: number;
  perpPress: number;
} {
  const r = (wallAngleDeg * Math.PI) / 180;
  const c = dcos(r);
  return { para: Math.abs(dsin(r)), perpPull: Math.max(0, -c), perpPress: Math.max(0, c) };
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
    const pos = attached ? gripPos(st) : st.freePos;
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
  let target = c.pelvis;
  if (wsum > 0) target = scale(tgt, 1 / wsum);

  // 两/三点平衡(counterbalance)：抬肢减少支撑时，把目标重心(X)移到剩余支撑点上方。
  const supX: number[] = [];
  for (const l of LIMBS) {
    if (c.limbs[l].attached && c.limbs[l].hold) supX.push(gripPos(c.limbs[l]).x);
    else if (l === c.draggingLimb) supX.push(c.limbs[l].freePos.x);
  }
  if (supX.length >= 1 && supX.length < 4) {
    const cx = supX.reduce((a, b) => a + b, 0) / supX.length;
    const strength = Math.min(0.9, (4 - supX.length) * t.balanceShift);
    target = { x: target.x + (cx - target.x) * strength, y: target.y };
  }

  // 混合法①：弹簧-阻尼积分骨盆 → 伸手/dyno 有动量跟随与轻微过冲，再阻尼稳定
  // （替代原来的临界阻尼平滑：现在身体是"落"到位而不是"滑"到位）。
  let accel = scale(sub(target, c.pelvis), t.pelvisStiff);

  // 混合法②：抓点柔性——支撑肢端超出伸展极限时用"刚性弹簧"回拉，允许轻微过伸/下沉，
  // 身体自然 settle 到抓点上，而非瞬间硬钉。（load 越大理论上下沉越多，这里用几何近似。）
  {
    const pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    for (const l of attachedLimbs(c)) {
      const root = pose.limb[l].root;
      const gp = gripPos(c.limbs[l]);
      const d = dist(root, gp);
      const maxR = maxReachOf(c.body, l) * reachSlackOf(c.body, t);
      if (d > maxR) accel = add(accel, scale(norm(sub(gp, root)), (d - maxR) * t.gripStiff));
    }
  }

  c.pelvisVel = add(c.pelvisVel, scale(accel, dt));
  c.pelvisVel = scale(c.pelvisVel, dpow(t.pelvisDamp, dt * 60)); // 阻尼
  c.pelvis = add(c.pelvis, scale(c.pelvisVel, dt));

  // 安全硬钳制（较松 1.18×，仅防跑飞）：触限时吸收沿约束方向的速度，避免抖
  for (let kk = 0; kk < 3; kk++) {
    const pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    let corr = v(0, 0);
    let n = 0;
    for (const l of attachedLimbs(c)) {
      const root = pose.limb[l].root;
      const gp = gripPos(c.limbs[l]);
      const d = dist(root, gp);
      const maxR = maxReachOf(c.body, l) * reachSlackOf(c.body, t) * 1.18;
      if (d > maxR) {
        corr = add(corr, scale(norm(sub(gp, root)), d - maxR));
        n++;
      }
    }
    if (n === 0) break;
    const push = scale(corr, 1 / n);
    c.pelvis = add(c.pelvis, push);
    const pl = len(push);
    if (pl > 1e-4) {
      const nrm = scale(push, 1 / pl);
      const vn = c.pelvisVel.x * nrm.x + c.pelvisVel.y * nrm.y;
      if (vn < 0) c.pelvisVel = sub(c.pelvisVel, scale(nrm, vn)); // 去掉撞向约束的速度
    }
  }
}

/**
 * 求解身体朝向：肩线面向双手、髋线面向双脚、脊柱偏向双手（横移重心去对齐侧向点）。
 * 目标主要由几何决定 → 稳定不振荡；帧率无关缓动 + 限幅，让身体自然转动而非直上直下。
 */
function solveOrientation(c: Climber, dt: number, t: Tuning) {
  const tg = targetsOf(c);
  const lim = t.rotLimit;
  const shoulderTgt = clamp(datan2(tg.RH.y - tg.LH.y, tg.RH.x - tg.LH.x), -lim, lim);
  const hipTgt = clamp(datan2(tg.RF.y - tg.LF.y, tg.RF.x - tg.LF.x), -lim, lim);

  // 脊柱方向（脚→头）由支撑几何决定，可大幅倾斜乃至倒挂：
  //  - 手脚都抓：脊柱 = 支撑脚质心 → 支撑手质心
  //  - 只用手(纯吊臂)：身体悬于手下方 → 脊柱朝上(lean→0)
  //  - 只用脚(屋檐蝙蝠挂)：身体悬于脚下方、头朝下 → 脊柱朝下(lean→π)
  const hands = LIMBS.filter((l) => isHand(l) && c.limbs[l].attached && c.limbs[l].hold);
  const feet = LIMBS.filter((l) => !isHand(l) && c.limbs[l].attached && c.limbs[l].hold);
  const cen = (ls: Limb[]) => {
    let x = 0;
    let y = 0;
    for (const l of ls) {
      const gp = gripPos(c.limbs[l]);
      x += gp.x;
      y += gp.y;
    }
    return { x: x / ls.length, y: y / ls.length };
  };
  let leanTgt = c.lean;
  if (hands.length > 0 && feet.length > 0) {
    const hc = cen(hands);
    const fc = cen(feet);
    const ux = hc.x - fc.x;
    const uy = hc.y - fc.y;
    if (dhypot(ux, uy) > 1e-3) leanTgt = datan2(ux, -uy); // rotate(UP,leanTgt)≈脚→手方向
  } else if (hands.length > 0) {
    leanTgt = 0; // 吊臂：直挂手下
  } else if (feet.length > 0) {
    leanTgt = Math.PI; // 蝙蝠挂：倒挂脚下（头朝下）
  }

  const k = 1 - dpow(1 - t.rotFollow, dt * 60);
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
  const k = 1 - dpow(1 - 0.14, dt * 60); // ~0.1s 旋转过渡
  for (const l of LIMBS) c.bend[l] += (tgt[l] - c.bend[l]) * k;
}

/** 发力/锁臂混合：有手离点(正在伸够移动)→趋向锁臂上拉；落定休息→趋向直臂悬挂。 */
function updatePullBlend(c: Climber, dt: number) {
  const moving = !c.limbs.LH.attached || !c.limbs.RH.attached;
  const target = moving ? 1 : 0;
  const k = 1 - dpow(1 - 0.1, dt * 60);
  c.pullBlend += (target - c.pullBlend) * k;
}

/**
 * 混合法③：自由肢端（非玩家拖动者）Verlet 次级运动。
 *  - 惯性(prev→cur) + 世界重力 + 朝"自然休息位(flag/放松悬)"的软弹簧。
 *  - 身体一动，悬着的腿/手会像钟摆一样甩、滞后，再自然 settle → 有生命感、不僵硬。
 *  - 末端约束在根关节可达范围内。注：自由肢端不计入支撑/重心，纯姿态。
 */
function solveFreeLimbs(c: Climber, dt: number, t: Tuning) {
  const pose = c.pose;
  if (!pose) return;
  const up = rotate({ x: 0, y: -1 }, c.lean);
  const down = scale(up, -1);
  const right = { x: -up.y, y: up.x };
  const gravity = { x: 0, y: t.limbGravity }; // 世界重力（屏幕 +y 向下），与身体朝向无关
  const att = attachedLimbs(c);
  let supX = c.pelvis.x;
  if (att.length > 0) {
    supX = 0;
    for (const l of att) supX += gripPos(c.limbs[l]).x;
    supX /= att.length;
  }
  for (const l of LIMBS) {
    const st = c.limbs[l];
    if (st.attached || l === c.draggingLimb) {
      c.freePrev[l] = { ...st.freePos }; // 保持同步，脱开/松手瞬间不产生假速度
      continue;
    }
    const root = pose.limb[l].root;
    // 自然休息位（flag / 放松悬）——弹簧目标
    let rest: Vec2;
    if (isHand(l)) {
      rest = add(
        root,
        add(scale(down, armReach(c.body) * 0.5), scale(right, (c.pelvis.x - root.x) * 0.15)),
      );
    } else {
      const d = root.x - supX;
      const side = Math.abs(d) < 6 ? (l === "LF" ? -1 : 1) : Math.sign(d);
      rest = add(
        root,
        add(scale(down, legReach(c.body) * 0.66), scale(right, side * legReach(c.body) * 0.5)),
      );
    }
    // Verlet：next = cur + 惯性 + (重力 + 回位弹簧)·dt²
    const cur = st.freePos;
    const vel = scale(sub(cur, c.freePrev[l]), t.limbSwingDamp);
    const acc = add(gravity, scale(sub(rest, cur), t.limbRestPull));
    let next = add(add(cur, vel), scale(acc, dt * dt));
    // 约束：末端不超出根关节可达范围
    const off = sub(next, root);
    const d2 = len(off);
    const maxR = maxReachOf(c.body, l) * reachSlackOf(c.body, t);
    if (d2 > maxR) next = add(root, scale(off, maxR / d2));
    c.freePrev[l] = { ...cur };
    st.freePos = next;
  }
}

/**
 * 全身张力对抗度 0..1（P1）：本肢与其它"拉"型肢端（手 / 勾脚 / 挂脚）受力方向
 * 水平相反的程度。夹在两个侧向点之间 / 屋檐手脚对拉都由此表达。
 * 两面性：① 消耗——对抗需持续发力（×tensionCost）；② 收益——陡仰上对拉产生
 * 法向压紧，提高有效抓力上限（×tensionBoost×perp×核心）。这正是屋檐挂脚的意义。
 */
export function oppositionOf(
  l: Limb,
  loadAngle: number,
  pullAngles: Partial<Record<Limb, number>>,
): number {
  if (!(l in pullAngles)) return 0; // 非拉型肢端（普通蹬脚）不参与对抗
  const hx1 = dcos(loadAngle);
  let best = 0;
  for (const m of Object.keys(pullAngles) as Limb[]) {
    if (m === l) continue;
    const hx2 = dcos(pullAngles[m]!);
    if (hx1 * hx2 < 0) best = Math.max(best, Math.min(Math.abs(hx1), Math.abs(hx2)));
  }
  return best;
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
  const res: StepResult = {
    slipped: [],
    slipReasons: {},
    fell: false,
    balanced: true,
    comInside: true,
  };
  for (const l of LIMBS) c.limbs[l].slipping = false;
  if (c.fallen) {
    c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    return res;
  }

  // ---- Dyno 腾空：纯弹道 + 肢端跟随摆动；平衡/耐力/脱手判定全部豁免 ----
  if (c.dyno) {
    c.dyno.t += dt;
    c.pelvisVel = add(c.pelvisVel, scale({ x: 0, y: 1 }, t.dynoGravity * dt));
    c.pelvis = add(c.pelvis, scale(c.pelvisVel, dt));
    solveFreeLimbs(c, dt, t);
    updateBend(c, dt);
    c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
    if (c.dyno.t > t.dynoWindow) {
      // 窗口内没抓到任何点 → 坠落
      c.dyno = null;
      c.fallen = true;
      res.fell = true;
    }
    return res;
  }

  const { para, perpPull, perpPress } = gravitySigned(wallAngleDeg);
  // 负载与抓力上限统一用"体重单位"，避免量纲不一致导致开局即脱手。
  // 板墙(perpPress>0)：压入分量不加负载——身体贴墙靠脚摩擦站住，这正是板墙"省手"的原因。
  const Fpara = c.body.weight * para; // 沿墙下滑总力
  const Fperp = c.body.weight * perpPull; // 垂墙拉离总力（仰角才有）

  // 指伤倒计时（有效指力在下方统一调制）
  if (c.injuryT > 0) c.injuryT = Math.max(0, c.injuryT - dt);

  // 1+ 发力混合 → 自由肢端摆放 → 骨盆跟随 → 身体朝向 → 关节弯曲 → 姿态
  updatePullBlend(c, dt);
  solveFreeLimbs(c, dt, t);
  solvePelvis(c, dt, t);
  solveOrientation(c, dt, t);
  updateBend(c, dt);
  c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);

  const att = attachedLimbs(c);

  // 整体掉落：抓点 = 0（放宽：单手悬挂/单手引体允许，由抓力上限与平衡决定能否撑住）
  if (att.length < 1) {
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
  // 负载分配：手/脚比例随墙角变（直壁≈50/50，越仰手承重越多 → 对齐设计文档表）。
  // 单类支撑（只手/只脚，如屋檐倒挂只用脚）时该类承担全部负载（归一化）。
  const handCount = att.filter(isHand).length;
  const footCount = att.length - handCount;
  // 垂直 0.5；屋檐 perpPull≈1 → 手 0.9；板墙 perpPress↑ → 脚主导（对齐 GDD 墙角承重表）
  let hFrac = 0.5 + 0.4 * perpPull - 0.28 * perpPress;
  let fFrac = 1 - hFrac;
  if (handCount === 0) fFrac = 1; // 只用脚（蝙蝠挂）→ 脚承全部
  if (footCount === 0) hFrac = 1; // 只用手（纯吊臂）→ 手承全部
  const wHand = handCount > 0 ? hFrac / handCount : 0;
  const wFoot = footCount > 0 ? fFrac / footCount : 0;
  const totalLoad = Fpara + Fperp * 0.6;

  const com = c.pose.com;

  // 第一遍：拉型肢端（手 / 勾脚 / 挂脚）的受力角——张力对抗判定用
  const pullAngles: Partial<Record<Limb, number>> = {};
  for (const l of att) {
    const st = c.limbs[l];
    if (isHand(l) || isPullingFootGrip(st.grip)) {
      const gp = gripPos(st);
      pullAngles[l] = datan2(com.y - gp.y, com.x - gp.x);
    }
  }

  for (const l of att) {
    const st = c.limbs[l];
    const hold = st.hold!;
    const w = isHand(l) ? wHand : wFoot;
    let load = totalLoad * w;
    // 失衡时该侧负载放大（核心越稳放大越小）
    if (!comInside) load *= 1 + t.imbalanceDrain * (1.2 - c.body.coreStability);

    // 方向对齐（每帧实时）：手悬向重心 / 脚撑离重心 的受力轴 vs 岩点可用方向锥。
    // 勾脚/挂脚是"拉"型脚法 → 按手的语义（把身体拉向岩点），仰角/屋檐的关键。
    // 身体（重心）位置/旋转改变受力轴 → 错向则 align 低 → 抓力骤降、耐力急耗。
    const gp = gripPos(st);
    const pulls = isHand(l) || isPullingFootGrip(st.grip);
    const loadAngle = pulls
      ? datan2(com.y - gp.y, com.x - gp.x)
      : datan2(gp.y - com.y, gp.x - com.x);
    const align = directionalFit(loadAngle, hold.pullDir, hold.pullTol);
    st.align = align;
    const alignEff = dpow(align, t.dirPenalty);

    // 接触覆盖率（松手不吸附的代价面）：抓在岩点边缘 → 覆盖率低 → 耐力急耗
    const coverage = contactCoverage(st.contactDist, hold.radius, limbRadiusOf(l, t));
    const shallow = 1 - coverage;
    const contactMul = 1 + t.contactDrainK * shallow * shallow;

    const adapt = gripTypeScore(hold.type, st.grip!);
    const baseMatch = adapt * contactAreaScore(st.contactDist, hold.radius);
    // 技术熟练（能力，0.5 中位=×1.0）× 抓法熟练度（60→+5%，90→+10%，越用越顺手）
    const prof = c.proficiency[st.grip!] ?? 0;
    const profMul = prof >= 90 ? 1.1 : prof >= 60 ? 1.05 : 1;
    const liveMatch = Math.max(
      0.05,
      baseMatch * alignEff * (0.9 + 0.2 * c.body.technique) * profMul,
    );

    // 抓力上限（体重单位），随对齐缩放：错向有效抓力骤降；不乘疲劳（耐力独立处理）。
    // 摩擦项（P1）：有效摩擦 = 类型摩擦 × 材质档位；光滑点抓力上限打折——Sloper 的命门。
    // 指伤 debuff：伤着时有效指力 ×0.8（全扣的代价，GDD 反向激励）。
    const effFinger = c.body.fingerStrength * (c.injuryT > 0 ? 0.8 : 1);
    const maxForce =
      hold.friendliness *
      (0.5 + 0.5 * adapt) *
      (0.55 + 0.45 * effectiveFriction(hold)) *
      effFinger *
      t.capacity *
      t.maxForceK;
    // 张力对抗（两面性）：对抗度 → 消耗；陡仰(perpPull↑)上对拉压紧 → 抓力增益（核心调制）
    const oppose = oppositionOf(l, loadAngle, pullAngles);
    const tensionRelief =
      1 + t.tensionBoost * oppose * perpPull * (0.5 + 0.5 * c.body.coreStability);
    // 板墙脚摩擦增益：压入分量 × 有效摩擦 → 脚下如有神（抹脚在板墙上的意义）
    const slabBoost = !isHand(l) ? 1 + perpPress * 0.8 * effectiveFriction(hold) : 1;
    const effMax = maxForce * (0.3 + 0.7 * alignEff) * tensionRelief * slabBoost;
    const tension = oppose * 30 * t.tensionCost * (1.2 - c.body.coreStability);

    // 耐力消耗 = 负载×指力需求 ÷ 实时匹配度 × (1/指力) + 张力开销，
    // 再乘岩点类型消耗系数（gaston 肩部对抗等）、抓法消耗系数（勾脚/挂脚主动发力）
    // 与抓握耐力（能力，0.5 中位 = ×1.0）。
    const demand = isHand(l) ? hold.fingerDemand : 1;
    const drainRate =
      (((load * demand) / liveMatch) * (1 / Math.max(0.2, effFinger)) *
        t.staminaDrain +
        tension) *
      hold.drainMul *
      GRIP_DRAIN_MUL[st.grip!] *
      contactMul *
      (1.25 - 0.5 * c.body.endurance) *
      0.0013;
    st.stamina = drain(st.stamina, drainRate, dt);

    const overloaded = load > effMax * 1.6;
    if (overloaded || st.stamina <= 0) {
      st.freePos = { ...gp }; // 从原位脱离，由 solveFreeLimbs 柔和摆出，不突跳
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.align = 1;
      res.slipped.push(l);
      // 归因：耐力耗尽 / 错向导致的过载 / 单纯超载
      res.slipReasons[l] =
        st.stamina <= 0 ? "stamina" : alignEff < 0.55 ? "direction" : "overload";
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
      st.freePos = { ...gripPos(st) };
      st.attached = false;
      st.hold = null;
      st.grip = null;
      st.slipping = true;
      st.align = 1;
      res.slipped.push(weakest);
      res.slipReasons[weakest] = "imbalance";
      c.imbalanceT = 0;
    }
  }

  // 恢复自由肢端耐力（恢复速度能力：0.5 中位 = ×1.0）
  for (const l of LIMBS) {
    const st = c.limbs[l];
    if (!st.attached) {
      st.stamina = recover(st.stamina, t.staminaRecover * (0.6 + 0.8 * c.body.recovery), dt);
      st.align = 1;
    }
  }

  // 再次掉落判定：抓点全部脱开才掉
  if (attachedLimbs(c).length < 1) {
    c.fallen = true;
    res.fell = true;
  }

  c.pose = resolvePose(c.body, c.pelvis, oriOf(c), targetsOf(c), c.bend);
  return res;
}

/**
 * 2D 侧视平衡判定：重心 X 落在抓点 X 跨度（±核心容差）内。
 *  - ≥2 抓点：重心 X 在跨度 ± 容差内。
 *  - 单手悬挂：重心摆到手正下方即稳（钟摆），允许强者单手吊/引体。
 *  - 单脚：无法平衡（会倾倒）。
 */
export function comBalanced(c: Climber, att = attachedLimbs(c)): boolean {
  if (att.length === 0) return false;
  const margin = 12 + c.body.coreStability * 34; // 核心越稳越不易失衡
  if (att.length === 1) {
    const l = att[0];
    if (!isHand(l)) return false; // 单脚站立不稳
    return Math.abs(c.pose.com.x - gripPos(c.limbs[l]).x) <= margin; // 单手悬挂：重心在手下方
  }
  let min = Infinity;
  let max = -Infinity;
  for (const l of att) {
    const x = gripPos(c.limbs[l]).x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return c.pose.com.x >= min - margin && c.pose.com.x <= max + margin;
}

/** 当前是否平衡（供 UI 提示）。 */
export function isBalanced(c: Climber): boolean {
  return comBalanced(c);
}

export { len };
