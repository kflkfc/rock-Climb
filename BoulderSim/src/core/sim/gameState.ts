// 纯逻辑 · 游戏状态机 + V4 交互编排。
// 状态：climbing(攀爬中) / ring(抓法环弹出) / won(过关) / fallen(掉落复位中)
// 计步(✋ 抓取次数) / 计时(⏱) / 重置 / 3s 回放定格。

import {
  Vec2,
  v,
  add,
  sub,
  scale,
  norm,
  len,
  dist,
  clampLen,
} from "../math/vec2.ts";
import { ADULT } from "../model/body.ts";
import {
  Limb,
  LIMBS,
  isHand,
  resolvePose,
  maxReachOf,
  Pose,
} from "../model/skeleton.ts";
import { Hold, makeHold } from "./holds.ts";
import { GripOption, gripOptions, gripsFor } from "./grip.ts";
import {
  Climber,
  LimbState,
  stepClimber,
  limbTarget,
  attachedLimbs,
} from "./physics.ts";
import { LevelDef } from "../level/levelSchema.ts";
import { tuning } from "../../config/tuning.ts";

export type Status = "climbing" | "ring" | "won" | "fallen";

export interface RingState {
  limb: Limb;
  hold: Hold;
  contactDist: number;
  pullRad: number;
  options: GripOption[];
}

interface ReplayFrame {
  pose: Pose;
  attached: Record<Limb, boolean>;
}

const PICK_R = 30; // 把手拾取半径
const TOUCH_SLACK = 1.2; // 岩点接触判定放大 20%（设计：手指更粗）
const REPLAY_SECONDS = 3;
const REPLAY_HZ = 30;

export class Game {
  level!: LevelDef;
  holds: Hold[] = [];
  c!: Climber;
  status: Status = "climbing";
  gripCount = 0; // ✋ 抓取次数
  time = 0; // ⏱ 秒
  ring: RingState | null = null;
  dragging: Limb | null = null;
  dragPos: Vec2 = v();
  /** 拖拽中接触到的岩点（接触锁定预览） */
  hoverHold: Hold | null = null;
  rippleAt: Vec2 | null = null;
  rippleT = 0;
  private fallTimer = 0;
  dbg: { t: number; slipped: Limb[]; comInside: boolean; imbT: number }[] = [];
  private replay: ReplayFrame[] = [];
  private replayIdx = 0;
  private replayAccum = 0;
  private recAccum = 0;
  onWin?: () => void;
  onSlip?: () => void;
  onContact?: () => void;
  onGrab?: (match: number) => void;

  constructor(level: LevelDef) {
    this.load(level);
  }

  load(level: LevelDef) {
    this.level = level;
    this.holds = level.holds.map((h) =>
      makeHold(h.id, h.type, v(h.x, h.y), {
        radius: h.radius,
        pullDir: h.pullDirDeg != null ? (h.pullDirDeg * Math.PI) / 180 : undefined,
        pullTol: h.pullTolDeg != null ? (h.pullTolDeg * Math.PI) / 180 : undefined,
        isGoal: h.goal,
        startLimb: h.start,
      }),
    );
    this.reset();
  }

  resetEpoch = 0;

  reset() {
    this.resetEpoch++;
    const startOf = (l: Limb) => this.holds.find((h) => h.startLimb === l)!;
    const limbs = {} as Record<Limb, LimbState>;
    for (const l of LIMBS) {
      const h = startOf(l);
      limbs[l] = {
        attached: true,
        hold: h,
        grip: isHand(l) ? "open" : "inside",
        match: 0.9,
        contactDist: 2,
        stamina: 1,
        align: 1,
        freePos: { ...h.pos },
        slipping: false,
      };
    }
    const lean = ((this.level.wallAngleDeg - 90) * Math.PI) / 180;
    const pelvis = v(
      (limbs.LF.hold!.pos.x + limbs.RF.hold!.pos.x) / 2,
      (limbs.LH.hold!.pos.y + limbs.LF.hold!.pos.y) / 2,
    );
    const ori = { lean, shoulderTwist: 0, hipTwist: 0 };
    this.c = {
      body: { ...ADULT },
      pelvis,
      lean,
      shoulderTwist: 0,
      hipTwist: 0,
      limbs,
      pose: resolvePose({ ...ADULT }, pelvis, ori, {
        LH: limbs.LH.hold!.pos,
        RH: limbs.RH.hold!.pos,
        LF: limbs.LF.hold!.pos,
        RF: limbs.RF.hold!.pos,
      }),
      imbalanceT: 0,
      fallen: false,
    };
    this.status = "climbing";
    this.gripCount = 0;
    this.time = 0;
    this.ring = null;
    this.dragging = null;
    this.hoverHold = null;
    this.rippleAt = null;
    this.fallTimer = 0;
    this.replay = [];
    this.replayIdx = 0;
  }

  // ---- V4 交互 ----

  /** 在 worldPos 处尝试抓起一个自由肢端把手；返回是否抓到 */
  beginDrag(worldPos: Vec2): boolean {
    if (this.status !== "climbing") return false;
    let best: Limb | null = null;
    let bestD = PICK_R;
    for (const l of LIMBS) {
      const p = limbTarget(this.c, l);
      const d = dist(p, worldPos);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best) return false;
    // 抓住的肢端被拖动 = 先脱离当前岩点
    const st = this.c.limbs[best];
    st.attached = false;
    st.hold = null;
    st.grip = null;
    st.freePos = { ...worldPos };
    this.dragging = best;
    this.dragPos = { ...worldPos };
    return true;
  }

  /** 拖动中：把手跟随，受臂/腿伸展极限钳制；检测接触锁定预览 */
  moveDrag(worldPos: Vec2) {
    if (!this.dragging) return;
    const l = this.dragging;
    const root = this.c.pose.limb[l].root;
    const reach = maxReachOf(this.c.body, l) * tuning.reachSlack;
    const clamped = add(root, clampLen(sub(worldPos, root), reach));
    this.c.limbs[l].freePos = clamped;
    this.dragPos = clamped;
    // 接触锁定预览：是否压在某岩点的接触圈内
    this.hoverHold = this.holdAt(clamped, l);
  }

  /** 松手：在岩点上 → Jug 默认抓 / 其它弹抓法环；不在岩点 → 把手弹回 */
  endDrag() {
    if (!this.dragging) return;
    const l = this.dragging;
    const hold = this.hoverHold;
    this.dragging = null;
    this.hoverHold = null;
    if (!hold) {
      // 弹回根关节附近
      const root = this.c.pose.limb[l].root;
      this.c.limbs[l].freePos = add(root, v(0, isHand(l) ? -20 : 40));
      return;
    }
    const contact = clampLen(sub(this.dragPos, hold.pos), hold.radius);
    const contactDist = len(contact);
    const root = this.c.pose.limb[l].root;
    const pullRad = Math.atan2(root.y - hold.pos.y, root.x - hold.pos.x);
    // 接触波纹特效
    this.rippleAt = { ...hold.pos };
    this.rippleT = 0;
    this.onContact?.();

    if (hold.type === "jug") {
      // Jug：跳过抓法环，默认最优抓法直接抓住
      const best = gripOptions(l, hold, contactDist, pullRad)[0];
      this.commitGrip(l, hold, best, contactDist);
      return;
    }
    // 其它岩点：弹抓法环
    this.ring = {
      limb: l,
      hold,
      contactDist,
      pullRad,
      options: gripOptions(l, hold, contactDist, pullRad),
    };
    this.status = "ring";
  }

  /** 抓法环中选定某抓法 */
  chooseGrip(grip: GripOption) {
    if (!this.ring) return;
    const { limb, hold, contactDist } = this.ring;
    this.commitGrip(limb, hold, grip, contactDist);
    this.ring = null;
    this.status = "climbing";
  }

  cancelRing() {
    if (!this.ring) return;
    const l = this.ring.limb;
    const root = this.c.pose.limb[l].root;
    this.c.limbs[l].freePos = add(root, v(0, isHand(l) ? -20 : 40));
    this.ring = null;
    this.status = "climbing";
  }

  private commitGrip(l: Limb, hold: Hold, opt: GripOption, contactDist: number) {
    const st = this.c.limbs[l];
    st.attached = true;
    st.hold = hold;
    st.grip = opt.grip;
    st.match = opt.match;
    st.contactDist = contactDist;
    this.gripCount++;
    this.onGrab?.(opt.match);
    // 抓到终点岩点（且是手）→ 过关
    if (hold.isGoal && isHand(l)) this.triggerWin();
  }

  private holdAt(p: Vec2, _l: Limb): Hold | null {
    let best: Hold | null = null;
    let bestD = Infinity;
    for (const h of this.holds) {
      const d = dist(p, h.pos);
      if (d < h.radius * TOUCH_SLACK && d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  // ---- 帧推进 ----

  update(dt: number) {
    if (this.rippleAt) {
      this.rippleT += dt;
      if (this.rippleT > 0.6) this.rippleAt = null;
    }

    if (this.status === "won") {
      // 3s 回放，放完定格在最后一帧
      this.replayAccum += dt;
      const step = 1 / REPLAY_HZ;
      while (this.replayAccum >= step && this.replayIdx < this.replay.length - 1) {
        this.replayAccum -= step;
        this.replayIdx++;
      }
      return;
    }

    if (this.status === "fallen") {
      this.fallTimer += dt;
      if (this.fallTimer >= tuning.fallResetDelay) this.reset();
      return;
    }

    if (this.status === "climbing" || this.status === "ring") {
      this.time += dt;
      // 抓法环弹出时物理暂停（玩家思考），其余照常步进
      if (this.status === "climbing") {
        this.recordReplay(dt);
        const r = stepClimber(this.c, this.level.wallAngleDeg, dt, tuning);
        if (r.slipped.length > 0) {
          this.dbg.push({
            t: +this.time.toFixed(2),
            slipped: r.slipped.slice(),
            comInside: r.comInside,
            imbT: +this.c.imbalanceT.toFixed(2),
          });
          this.onSlip?.();
        }
        if (r.fell || this.c.fallen) {
          this.status = "fallen";
          this.fallTimer = 0;
        }
      }
    }
  }

  private recordReplay(dt: number) {
    this.recAccum += dt;
    if (this.recAccum < 1 / REPLAY_HZ) return;
    this.recAccum = 0;
    const attached = {} as Record<Limb, boolean>;
    for (const l of LIMBS) attached[l] = this.c.limbs[l].attached;
    this.replay.push({ pose: structuredPose(this.c.pose), attached });
    const maxFrames = REPLAY_SECONDS * REPLAY_HZ;
    if (this.replay.length > maxFrames) this.replay.shift();
  }

  private triggerWin() {
    this.status = "won";
    this.replayIdx = 0;
    this.replayAccum = 0;
    this.onWin?.();
  }

  get stars(): number {
    if (this.status !== "won") return 0;
    const t = this.level.starThreshold;
    if (this.gripCount <= t) return 3;
    if (this.gripCount <= t * 1.6) return 2;
    return 1;
  }

  /** 渲染用：won 时返回回放帧姿态，否则当前姿态 */
  renderPose(): { pose: Pose; attached: Record<Limb, boolean> } {
    if (this.status === "won" && this.replay.length > 0) {
      const f = this.replay[Math.min(this.replayIdx, this.replay.length - 1)];
      return { pose: f.pose, attached: f.attached };
    }
    const attached = {} as Record<Limb, boolean>;
    for (const l of LIMBS) attached[l] = this.c.limbs[l].attached;
    return { pose: this.c.pose, attached };
  }

  /** 拖拽中显示的伸展圈（root + maxReach） */
  reachCircle(): { center: Vec2; r: number } | null {
    if (!this.dragging) return null;
    const l = this.dragging;
    return {
      center: { ...this.c.pose.limb[l].root },
      r: maxReachOf(this.c.body, l) * tuning.reachSlack,
    };
  }
}

/** 深拷贝姿态用于回放（避免被后续帧覆盖） */
function structuredPose(p: Pose): Pose {
  const cp = (a: Vec2) => ({ x: a.x, y: a.y });
  const limb = {} as Pose["limb"];
  for (const l of LIMBS) {
    limb[l] = {
      root: cp(p.limb[l].root),
      ik: {
        joint: cp(p.limb[l].ik.joint),
        end: cp(p.limb[l].ik.end),
        reached: p.limb[l].ik.reached,
      },
    };
  }
  return {
    pelvis: cp(p.pelvis),
    hipL: cp(p.hipL),
    hipR: cp(p.hipR),
    shoulderC: cp(p.shoulderC),
    shoulderL: cp(p.shoulderL),
    shoulderR: cp(p.shoulderR),
    neck: cp(p.neck),
    head: cp(p.head),
    limb,
    com: cp(p.com),
  };
}

export { attachedLimbs, gripsFor, norm, scale };
