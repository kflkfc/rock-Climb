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
import { makeBody, abilitiesForLevel, BodyParams } from "../model/body.ts";
import { characterById, applyBias, DEFAULT_CHARACTER_ID } from "../model/characters.ts";
import {
  Limb,
  LIMBS,
  isHand,
  resolvePose,
  desiredBend,
  maxReachOf,
  Pose,
} from "../model/skeleton.ts";
import { Hold, makeHold, holdUsableBy } from "./holds.ts";
import { GripOption, gripOptions, gripsFor, matchPercent } from "./grip.ts";
import {
  Climber,
  LimbState,
  stepClimber,
  limbTarget,
  attachedLimbs,
  reachSlackOf,
  SlipReason,
} from "./physics.ts";
import { LevelDef, wallAngleAtY } from "../level/levelSchema.ts";
import { LEVELS } from "../level/levels.ts";
import { StarResult, judgeStars, starCount } from "../progress/stars.ts";
import { tuning } from "../config/tuning.ts";
import { datan2 } from "../math/dmath.ts";

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
  /** 最近一次脱手归因（HUD 教学提示，2.2s 淡出） */
  lastSlip: { limb: Limb; reason: SlipReason; t: number } | null = null;
  // ---- run 统计（三星评定口径）：一次"尝试"= 手动重置/换关 → 完攀，跨自动坠落复位累计 ----
  /** run 计时（秒）：从本 run 首次有效输入起算，坠落复位不清零（防刷神速星） */
  runTime = 0;
  /** run 内是否发生过任何脱手/坠落（流畅星判据） */
  runSlipped = false;
  /** run 内是否用过 undo（P2-6 接入；预留判据） */
  runUndoUsed = false;
  private runStarted = false;
  /** 完攀时的三星评定结果（won 状态下有效） */
  lastStars: StarResult | null = null;
  /** 拖拽速度（世界单位/s，逻辑帧平滑）——甩出手势检测用 */
  private dragVel: Vec2 = v();
  private prevDragPos: Vec2 = v();
  dbg: { t: number; slipped: Limb[]; comInside: boolean; imbT: number }[] = [];
  private replay: ReplayFrame[] = [];
  private replayIdx = 0;
  private replayAccum = 0;
  private recAccum = 0;
  onWin?: () => void;
  onSlip?: () => void;
  onFall?: () => void; // 整体掉落（≠单肢滑脱）：音效/存档 attempts 计数用
  onContact?: () => void;
  onGrab?: (match: number) => void;
  onDyno?: () => void; // 甩跳起跳瞬间（音效/特效）

  levelIndex = 0;
  climberLevel = 5; // 选手级别 1-10（默认 5 老手；越高越强越不易掉）
  characterId = DEFAULT_CHARACTER_ID; // 角色阵容（体格预设 + 能力偏置）

  constructor(level: LevelDef) {
    this.levelIndex = Math.max(0, LEVELS.indexOf(level));
    this.load(level);
  }

  /** 角色体格 + 级别能力（经角色偏置）→ 最终人体参数 */
  private buildBody(): BodyParams {
    const ch = characterById(this.characterId);
    return makeBody(ch.physique, applyBias(abilitiesForLevel(this.climberLevel), ch.abilityBias));
  }

  /** 设置选手级别（即时生效，不打断当前攀爬）：缩放指力/核心等能力 */
  setClimberLevel(n: number) {
    this.climberLevel = Math.max(1, Math.min(10, Math.round(n)));
    if (this.c) this.c.body = this.buildBody();
  }

  /** 切换角色：骨长变化会瞬移姿态，因此重开本条线（回放事件 chara 同语义） */
  setCharacter(id: string) {
    const ch = characterById(id);
    if (ch.id === this.characterId) return;
    this.characterId = ch.id;
    this.reset();
  }

  /** 切到下一条线路（退出按钮 / 调试用） */
  cycleLevel() {
    this.levelIndex = (this.levelIndex + 1) % LEVELS.length;
    this.load(LEVELS[this.levelIndex]);
  }

  /** 加载指定序号线路（键盘 1-9） */
  loadIndex(i: number) {
    if (i < 0 || i >= LEVELS.length) return;
    this.levelIndex = i;
    this.load(LEVELS[i]);
  }

  load(level: LevelDef) {
    this.level = level;
    this.holds = level.holds.map((h) =>
      makeHold(h.id, h.type, v(h.x, h.y), {
        radius: h.radius,
        pullDir: h.pullDirDeg != null ? (h.pullDirDeg * Math.PI) / 180 : undefined,
        pullTol: h.pullTolDeg != null ? (h.pullTolDeg * Math.PI) / 180 : undefined,
        material: h.material,
        onVolume: h.onVolume,
        isGoal: h.goal,
        startLimb: h.start,
      }),
    );
    // 体积块置底渲染（其上的子点后画）；稳定排序保持同类原顺序
    this.holds.sort((a, b) => (a.type === "volume" ? -1 : 0) - (b.type === "volume" ? -1 : 0));
    this.reset();
  }

  resetEpoch = 0;

  /**
   * 复位到起始姿态。keepRun=true（坠落自动复位）保留 run 统计（计时/脱手记录延续）；
   * false（手动重置/换关/换角色）开启全新 run。
   */
  reset(keepRun = false) {
    this.resetEpoch++;
    if (!keepRun) {
      this.runTime = 0;
      this.runSlipped = false;
      this.runUndoUsed = false;
      this.runStarted = false;
      this.lastStars = null;
    }
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
    const startTargets = {
      LH: limbs.LH.hold!.pos,
      RH: limbs.RH.hold!.pos,
      LF: limbs.LF.hold!.pos,
      RF: limbs.RF.hold!.pos,
    };
    const body = this.buildBody();
    const bend = desiredBend(body, pelvis, ori, startTargets);
    this.c = {
      body,
      pelvis,
      lean,
      shoulderTwist: 0,
      hipTwist: 0,
      limbs,
      pose: resolvePose(body, pelvis, ori, startTargets, bend),
      imbalanceT: 0,
      fallen: false,
      draggingLimb: null,
      pullBlend: 0,
      bend,
      pelvisVel: v(0, 0),
      freePrev: {
        LH: { ...limbs.LH.freePos },
        RH: { ...limbs.RH.freePos },
        LF: { ...limbs.LF.freePos },
        RF: { ...limbs.RF.freePos },
      },
      dyno: null,
    };
    this.status = "climbing";
    this.gripCount = 0;
    this.time = 0;
    this.ring = null;
    this.dragging = null;
    this.hoverHold = null;
    this.rippleAt = null;
    this.fallTimer = 0;
    this.lastSlip = null;
    this.dragVel = v();
    this.prevDragPos = v();
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
    this.c.draggingLimb = best; // 物理不自动摆放此肢端（由拖动控制）
    this.dragPos = { ...worldPos };
    this.prevDragPos = { ...worldPos }; // 同步基准，防拖拽首帧产生假速度（甩跳误判）
    this.dragVel = v();
    this.runStarted = true; // 首次有效输入 → run 计时开始
    return true;
  }

  /** 拖动中：把手跟随，受臂/腿伸展极限钳制；检测接触锁定预览 */
  moveDrag(worldPos: Vec2) {
    if (!this.dragging) return;
    const l = this.dragging;
    const root = this.c.pose.limb[l].root;
    const reach = maxReachOf(this.c.body, l) * reachSlackOf(this.c.body, tuning);
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
    this.c.draggingLimb = null; // 交还物理：solveFreeLimbs 柔和摆放(flag/放松悬)，不突跳
    this.hoverHold = null;
    if (!hold) {
      // 甩出手势 → Dyno 起跳：手被快速甩向远处松开（没落在任何岩点上）
      // = 真实抱石"甩出去够"的动作语言；速度阈值防误触
      const speed = len(this.dragVel);
      if (
        isHand(l) &&
        !this.c.dyno &&
        speed >= tuning.dynoSpeedMin &&
        attachedLimbs(this.c).length >= 1
      ) {
        this.launchDyno(l, norm(this.dragVel), speed);
        return;
      }
      // 未落在岩点：保持当前位置，由 solveFreeLimbs 柔和过渡到自然姿态（不突然下垂）
      return;
    }
    const contact = clampLen(sub(this.dragPos, hold.pos), hold.radius);
    const contactDist = len(contact);
    const root = this.c.pose.limb[l].root;
    const pullRad = datan2(root.y - hold.pos.y, root.x - hold.pos.x);
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
    // 先退出环再 commit：commitGrip 抓到终点会置 won，不能被 climbing 覆盖
    // （曾有 bug：非 Jug 终点经抓法环完攀被吞——终点是 Jug 时走直抓路径掩盖了它）
    this.ring = null;
    this.status = "climbing";
    this.commitGrip(limb, hold, grip, contactDist);
  }

  /** 按抓法环选项序号选定（回放事件的稳定引用；options 顺序确定）。序号越界=取消 */
  chooseGripByIndex(i: number) {
    if (!this.ring) return;
    const opt = this.ring.options[i];
    if (opt) this.chooseGrip(opt);
    else this.cancelRing();
  }

  cancelRing() {
    if (!this.ring) return;
    // 保持当前位置，由 solveFreeLimbs 柔和过渡到自然姿态
    this.ring = null;
    this.status = "climbing";
  }

  /** Dyno 起跳：全肢脱点，骨盆获得沿甩动方向的冲量（爆发能力缩放），进入腾空 */
  private launchDyno(lead: Limb, dir: Vec2, speed: number) {
    // 跳离区 = 起跳瞬间双手可达的全部点（含刚释放的）——dyno 的意义是够"现在够不到的点"
    const excluded: string[] = [];
    for (const l of ["LH", "RH"] as Limb[]) {
      const root = this.c.pose.limb[l].root;
      const reach = maxReachOf(this.c.body, l) * reachSlackOf(this.c.body, tuning);
      for (const h of this.holds)
        if (!excluded.includes(h.id) && dist(root, h.pos) <= reach) excluded.push(h.id);
    }
    for (const m of LIMBS) {
      const st = this.c.limbs[m];
      if (st.attached && st.hold) {
        if (!excluded.includes(st.hold.id)) excluded.push(st.hold.id);
        st.freePos = { ...st.hold.pos };
        st.attached = false;
        st.hold = null;
        st.grip = null;
      }
    }
    const power = this.c.body.power;
    const impulse =
      tuning.dynoImpulse * (0.55 + 0.9 * power) * Math.min(1.6, speed / tuning.dynoSpeedMin);
    this.c.pelvisVel = add(this.c.pelvisVel, scale(dir, impulse));
    this.c.dyno = { t: 0, leadLimb: lead, excluded };
    this.onDyno?.();
  }

  /**
   * 腾空拍击抓取：任一手的肩根可达范围内出现可用岩点 → 自动伸手以"拍击"抓住
   * （免抓法环——半空中没时间选抓法，这正是 slap 匹配度低的代价）。
   * 判定用肩根可达而非手末端：腾空中手在摆动，玩家没有微操空间，窗口要宽容。
   */
  private tryDynoCatch() {
    if (!this.c.dyno) return;
    for (const l of ["LH", "RH"] as Limb[]) {
      const root = this.c.pose.limb[l].root;
      const reach = maxReachOf(this.c.body, l) * reachSlackOf(this.c.body, tuning);
      let best: Hold | null = null;
      let bestD = Infinity;
      for (const h of this.holds) {
        if (!holdUsableBy(h, l)) continue;
        if (this.c.dyno.excluded.includes(h.id)) continue; // 跳离的点不可重抓
        const d = dist(root, h.pos);
        if (d <= reach && d < bestD) {
          bestD = d;
          best = h;
        }
      }
      if (!best) continue;
      const hold = best;
      // 落手点：从岩点中心向手根方向偏移（拍在近侧边缘，contactDist 反映仓促）
      const contactDist = Math.min(hold.radius * 0.6, bestD * 0.1);
      this.c.limbs[l].freePos = { ...hold.pos };
      const pullRad = datan2(root.y - hold.pos.y, root.x - hold.pos.x);
      const match = matchPercent({ hold, grip: "slap", distToCenter: contactDist, pullRad });
      this.c.dyno = null;
      this.rippleAt = { ...hold.pos };
      this.rippleT = 0;
      this.onContact?.();
      this.commitGrip(l, hold, { grip: "slap", match, injury: false }, contactDist);
      return;
    }
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

  private holdAt(p: Vec2, l: Limb): Hold | null {
    let best: Hold | null = null;
    let bestD = Infinity;
    for (const h of this.holds) {
      if (!holdUsableBy(h, l)) continue; // 脚钉仅脚 / 指洞捏点等仅手
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
      if (this.runStarted) this.runTime += dt; // 坠落等待也计时（神速星防刷）
      if (this.fallTimer >= tuning.fallResetDelay) this.reset(true); // 保留 run 统计
      return;
    }

    if (this.status === "climbing" || this.status === "ring") {
      this.time += dt;
      if (this.runStarted) this.runTime += dt;
      // 抓法环弹出时物理暂停（玩家思考），其余照常步进
      if (this.status === "climbing") {
        this.recordReplay(dt);
        // 拖拽速度（甩出手势检测）：本逻辑帧位移 → 平滑
        if (this.dragging) {
          const inst = scale(sub(this.dragPos, this.prevDragPos), 1 / dt);
          this.dragVel = add(scale(this.dragVel, 0.65), scale(inst, 0.35));
        } else {
          this.dragVel = v();
        }
        this.prevDragPos = { ...this.dragPos };

        // 墙角按当前重心高度取（支持"底直壁→顶仰角"这类变墙角关卡）
        const wall = wallAngleAtY(this.level, this.c.pose.com.y);
        const r = stepClimber(this.c, wall, dt, tuning);
        if (this.c.dyno) this.tryDynoCatch(); // 腾空中检查拍击抓取
        if (r.slipped.length > 0) {
          this.dbg.push({
            t: +this.time.toFixed(2),
            slipped: r.slipped.slice(),
            comInside: r.comInside,
            imbT: +this.c.imbalanceT.toFixed(2),
          });
          const first = r.slipped[0];
          if (r.slipReasons[first])
            this.lastSlip = { limb: first, reason: r.slipReasons[first]!, t: this.time };
          this.onSlip?.();
        }
        if (r.slipped.length > 0) this.runSlipped = true; // 任何脱手 → 本 run 流畅星失效
        if (r.fell || this.c.fallen) {
          this.status = "fallen";
          this.fallTimer = 0;
          this.runSlipped = true;
          this.onFall?.();
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
    // 三星评定（GDD 4.3.1）：登顶/流畅/神速 分项判定
    this.lastStars = judgeStars(this.level, {
      won: true,
      moves: this.gripCount,
      timeMs: Math.round(this.runTime * 1000),
      slipped: this.runSlipped,
      undoUsed: this.runUndoUsed,
    });
    this.onWin?.();
  }

  /** 本次完攀星数 0-3（分项详情见 lastStars） */
  get stars(): number {
    return this.status === "won" && this.lastStars ? starCount(this.lastStars) : 0;
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
      r: maxReachOf(this.c.body, l) * reachSlackOf(this.c.body, tuning),
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
