// AI 试解器（GDD 模块 24）：把攀爬抽象为图搜索。
//
// 状态 = 四肢的岩点分配；动作 = 移动一肢到新点（或甩跳）。
// 每个状态/转移用"静态可行性检查"评估——复刻 physics 的姿态估算、平衡、
// 抓力公式，但不做逐帧积分 → 比完整模拟快几个量级，可跑 BFS 全展开。
//
// 一器四用（GDD 4.4）：①生成器可解性验证 ②官方关卡出厂检验(CI)
// ③星级目标定标（targetMoves/targetTimeSec 建议值）④玩家提示（下一步建议）。
//
// 注意：静态检查是完整物理的"乐观近似"（不建模耐力衰减/动量），
// solvable=true ≈ 存在合理路径；最终以 seqFollower/真人试玩复核 crux 关卡。

import { LevelDef, wallAngleAtY } from "../level/levelSchema.ts";
import { Hold, makeHold, holdUsableBy } from "../sim/holds.ts";
import { gripOptions } from "../sim/grip.ts";
import { gravitySigned, reachSlackOf } from "../sim/physics.ts";
import { limbRadiusOf, discOverlapRatio } from "../sim/contact.ts";
import { Limb, LIMBS, isHand, resolvePose, desiredBend, maxReachOf } from "../model/skeleton.ts";
import { BodyParams, makeBody, abilitiesForLevel, armReach, legReach } from "../model/body.ts";
import { characterById, applyBias } from "../model/characters.ts";
import { Vec2, v, add, scale, dist, rotate } from "../math/vec2.ts";
import { datan2 } from "../math/dmath.ts";
import { tuning } from "../config/tuning.ts";

export interface SolveStep {
  limb: Limb;
  holdId: string;
  dyno: boolean;
  match: number; // 该点最优抓法匹配度（难度特征）
}

export interface SolveResult {
  solvable: boolean;
  /** 最少移动数（= 抓取次数下界） */
  minMoves: number;
  path: SolveStep[];
  features: {
    minMatch: number; // 全程最差的"最优抓法匹配度"——指力/技术需求
    dynoCount: number; // 必须的甩跳次数——动态需求
    maxWallAngle: number; // 途经最陡墙角——力量需求
    avgMatch: number;
  };
  /** 星级目标建议：targetMoves = 最优×1.2 向上取整；targetTimeSec = 估时×1.8 */
  targets: { targetMoves: number; targetTimeSec: number };
  nodesExpanded: number;
}

export interface SolveOptions {
  climberLevel?: number; // 默认 10（出厂检验用满级：验证"存在解"）
  characterId?: string;
  candPerLimb?: number; // 每肢候选点剪枝（按"朝终点推进"排序取前 K）
  maxNodes?: number;
  allowDyno?: boolean;
}

type Assign = Record<Limb, string>; // limb → holdId

const keyOf = (a: Assign) => `${a.LH}|${a.RH}|${a.LF}|${a.RF}`;

/** 静态姿态估算：复刻 solvePelvis 的目标公式（手下悬挂/脚上站立加权），不积分 */
function estimatePose(level: LevelDef, body: BodyParams, holdOf: Map<string, Hold>, a: Assign) {
  let cy = 0;
  for (const l of LIMBS) cy += holdOf.get(a[l])!.pos.y;
  const wall = wallAngleAtY(level, cy / 4);
  const lean = ((wall - 90) * Math.PI) / 180;
  const up = rotate({ x: 0, y: -1 }, lean);
  const down = scale(up, -1);
  const torsoDown = scale(up, -body.torsoLen);

  let tgt = v(0, 0);
  let wsum = 0;
  for (const l of LIMBS) {
    const pos = holdOf.get(a[l])!.pos;
    const w = isHand(l) ? 0.85 : 0.8;
    const contrib = isHand(l)
      ? add(add(pos, scale(down, armReach(body) * tuning.hangFrac)), torsoDown)
      : add(pos, scale(up, legReach(body) * tuning.standFrac));
    tgt = add(tgt, scale(contrib, w));
    wsum += w;
  }
  const pelvis = scale(tgt, 1 / wsum);
  const ori = { lean, shoulderTwist: 0, hipTwist: 0 };
  const targets = {
    LH: holdOf.get(a.LH)!.pos,
    RH: holdOf.get(a.RH)!.pos,
    LF: holdOf.get(a.LF)!.pos,
    RF: holdOf.get(a.RF)!.pos,
  };
  const bend = desiredBend(body, pelvis, ori, targets);
  return { pose: resolvePose(body, pelvis, ori, targets, bend), wall };
}

/** 状态可行：四肢可达 + 平衡 + 每肢静态抓得住 */
function feasible(
  level: LevelDef,
  body: BodyParams,
  holdOf: Map<string, Hold>,
  a: Assign,
): boolean {
  const { pose, wall } = estimatePose(level, body, holdOf, a);
  const slack = reachSlackOf(body, tuning);

  // 1 可达：root → 岩点 ≤ 伸展极限（抓点柔性允许小超伸）
  for (const l of LIMBS) {
    const d = dist(pose.limb[l].root, holdOf.get(a[l])!.pos);
    if (d > maxReachOf(body, l) * slack * 1.12) return false;
  }

  // 1.5 肢端占位（V1.1）：两肢即使各自在岩点内最优错开，重叠仍超上限 → 不可行。
  // 最大错开距离 = 岩点中心距 + 双方岩点半径（接触点可放到各自岩点边缘）。
  for (let i = 0; i < LIMBS.length; i++) {
    for (let j = i + 1; j < LIMBS.length; j++) {
      const ha = holdOf.get(a[LIMBS[i]])!;
      const hb = holdOf.get(a[LIMBS[j]])!;
      const maxSep = dist(ha.pos, hb.pos) + ha.radius + hb.radius;
      const ra = limbRadiusOf(LIMBS[i], tuning);
      const rb = limbRadiusOf(LIMBS[j], tuning);
      if (discOverlapRatio(maxSep, ra, rb) > tuning.overlapMax) return false;
    }
  }

  // 2 平衡：com.x 在支撑 x 跨度 ± 核心容差内（comBalanced 静态版）
  const margin = 12 + body.coreStability * 34;
  let min = Infinity;
  let max = -Infinity;
  for (const l of LIMBS) {
    const x = holdOf.get(a[l])!.pos.x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  if (pose.com.x < min - margin || pose.com.x > max + margin) return false;

  // 3 抓得住：静态负载 vs 抓力上限（stepClimber 公式静态化，省张力/失衡项）
  const { para, perpPull } = gravitySigned(wall);
  const totalLoad = body.weight * para + body.weight * perpPull * 0.6;
  const handCount = 2;
  const hFrac = Math.max(0.1, Math.min(0.95, 0.5 + 0.4 * perpPull));
  for (const l of LIMBS) {
    const hold = holdOf.get(a[l])!;
    const load = (totalLoad * (isHand(l) ? hFrac : 1 - hFrac)) / handCount;
    const best = gripOptions(l, hold, 2, staticLoadAngle(pose.com, hold.pos, isHand(l)))[0];
    if (!best || best.match <= 0.05) return false;
    const maxForce =
      hold.friendliness * (0.5 + 0.5 * best.match) * body.fingerStrength * tuning.capacity;
    if (load > maxForce * 1.6 * 1.15) return false; // 1.15 乐观余量（动作间可休息恢复）
  }
  return true;
}

function staticLoadAngle(com: Vec2, holdPos: Vec2, pulls: boolean): number {
  return pulls
    ? datan2(com.y - holdPos.y, com.x - holdPos.x)
    : datan2(holdPos.y - com.y, holdPos.x - com.x);
}

/** 某状态下肢端的最优抓法匹配度（难度特征采样） */
function bestMatch(holdOf: Map<string, Hold>, a: Assign, l: Limb, com: Vec2): number {
  const hold = holdOf.get(a[l])!;
  const opt = gripOptions(l, hold, 2, staticLoadAngle(com, hold.pos, isHand(l)))[0];
  return opt ? opt.match : 0;
}

export function solveLevel(level: LevelDef, opts: SolveOptions = {}): SolveResult {
  const climberLevel = opts.climberLevel ?? 10;
  const ch = characterById(opts.characterId ?? "climber");
  const body = makeBody(ch.physique, applyBias(abilitiesForLevel(climberLevel), ch.abilityBias));
  const candK = opts.candPerLimb ?? 8;
  const maxNodes = opts.maxNodes ?? 60000;
  const allowDyno = opts.allowDyno ?? true;
  const dynoRange = 360; // 甩跳可达（冲量上限的保守估计）

  const holds = level.holds.map((h) =>
    makeHold(h.id, h.type, v(h.x, h.y), {
      radius: h.radius,
      pullDir: h.pullDirDeg != null ? (h.pullDirDeg * Math.PI) / 180 : undefined,
      pullTol: h.pullTolDeg != null ? (h.pullTolDeg * Math.PI) / 180 : undefined,
      material: h.material,
      isGoal: h.goal,
      startLimb: h.start,
    }),
  );
  const holdOf = new Map(holds.map((h) => [h.id, h]));
  const goal = holds.find((h) => h.isGoal)!;

  const start = {} as Assign;
  for (const h of holds) if (h.startLimb) start[h.startLimb] = h.id;

  const empty: SolveResult = {
    solvable: false,
    minMoves: 0,
    path: [],
    features: { minMatch: 1, dynoCount: 0, maxWallAngle: level.wallAngleDeg, avgMatch: 1 },
    targets: { targetMoves: 0, targetTimeSec: 0 },
    nodesExpanded: 0,
  };
  if (LIMBS.some((l) => !start[l]) || !goal) return empty;

  // BFS（最少移动数）
  interface Node {
    a: Assign;
    moves: number;
    parent: Node | null;
    step: SolveStep | null;
  }
  const root: Node = { a: start, moves: 0, parent: null, step: null };
  const visited = new Set<string>([keyOf(start)]);
  let queue: Node[] = [root];
  let expanded = 0;
  let winner: Node | null = null;

  while (queue.length > 0 && expanded < maxNodes && !winner) {
    const next: Node[] = [];
    for (const node of queue) {
      if (winner) break;
      expanded++;
      const { pose } = estimatePose(level, body, holdOf, node.a);

      for (const l of LIMBS) {
        const rootPos = pose.limb[l].root;
        const reach = maxReachOf(body, l) * reachSlackOf(body, tuning) * 1.15; // 伸手联动宽容
        // 候选：可用、非本肢当前点、可达（或手可甩跳）；按"更接近终点"排序取前 K
        const cands = holds
          .filter((h) => {
            if (h.id === node.a[l] || !holdUsableBy(h, l)) return false;
            const d = dist(rootPos, h.pos);
            if (d <= reach) return true;
            return allowDyno && isHand(l) && d <= dynoRange; // 甩跳步
          })
          .sort((x, y) => dist(x.pos, goal.pos) - dist(y.pos, goal.pos))
          .slice(0, candK);

        for (const h of cands) {
          const isDyno = dist(rootPos, h.pos) > reach;
          // 甩跳可行性：明显向上（世界重力弹道）且墙不陡（陡仰/屋檐上甩跳必飞离墙）
          const wallHere = wallAngleAtY(level, rootPos.y);
          const dynoOk = isDyno ? h.pos.y < rootPos.y - 40 && wallHere <= 110 : true;
          if (!dynoOk) continue;
          // 摸到终点即赢（commitGrip 语义）：只需转移可达，不需终态稳定
          if (h.isGoal && isHand(l)) {
            const m = gripOptions(l, h, 2, Math.PI / 2)[0]?.match ?? 0.5;
            winner = {
              a: { ...node.a, [l]: h.id },
              moves: node.moves + 1,
              parent: node,
              step: { limb: l, holdId: h.id, dyno: isDyno, match: m },
            };
            break;
          }
          if (isDyno) continue; // 甩跳只用于终点冲刺（中途甩跳后姿态不可控，保守）
          const a2: Assign = { ...node.a, [l]: h.id };
          const k = keyOf(a2);
          if (visited.has(k)) continue;
          visited.add(k);
          if (!feasible(level, body, holdOf, a2)) continue;
          const { pose: p2 } = estimatePose(level, body, holdOf, a2);
          next.push({
            a: a2,
            moves: node.moves + 1,
            parent: node,
            step: { limb: l, holdId: h.id, dyno: false, match: bestMatch(holdOf, a2, l, p2.com) },
          });
        }
        if (winner) break;
      }
    }
    queue = next;
  }

  if (!winner) return { ...empty, nodesExpanded: expanded };

  // 回溯路径 + 难度特征
  const path: SolveStep[] = [];
  for (let n: Node | null = winner; n && n.step; n = n.parent) path.unshift(n.step);
  let minMatch = 1;
  let sum = 0;
  let dynoCount = 0;
  let maxWall = level.wallAngleDeg;
  for (const s of path) {
    minMatch = Math.min(minMatch, s.match);
    sum += s.match;
    if (s.dyno) dynoCount++;
    const hy = holdOf.get(s.holdId)!.pos.y;
    maxWall = Math.max(maxWall, wallAngleAtY(level, hy));
  }
  const minMoves = path.length;
  // 每步 ~4s（陡仰/屋檐 6s：倒挂动作慢）+ 甩跳酝酿 + 起步
  const stepSec = maxWall > 120 ? 6 : 4;
  const estSec = minMoves * stepSec + dynoCount * 3 + 8;
  return {
    solvable: true,
    minMoves,
    path,
    features: { minMatch, dynoCount, maxWallAngle: Math.round(maxWall), avgMatch: sum / minMoves },
    targets: {
      // ×1.2 + 最小缓冲 2 步：短线不至于苛刻到"必须走 AI 最优解"
      targetMoves: Math.max(Math.ceil(minMoves * 1.2), minMoves + 2),
      targetTimeSec: Math.ceil((estSec * 1.8) / 5) * 5, // 5s 取整
    },
    nodesExpanded: expanded,
  };
}
