// 纯逻辑 · 6 条关卡（V1 直壁 / V2 横移 / V3 上下 / V4 特定动作 / V5 仰角+直壁 / V6 屋檐倒挂）。
// 用"轨道采样"生成器：手轨/脚轨沿折线按步长布点，相邻同肢移动在臂/腿可达内 → 保证可解。

import { LevelDef, HoldDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { HoldType } from "../sim/holds.ts";

const WORLD_W = 720;
const WORLD_H = 1000;

interface Pt {
  x: number;
  y: number;
}

/** 沿折线按弧长等分采样 n 个点。 */
function sampleRail(poly: Pt[], n: number): Pt[] {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    const l = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    segLen.push(l);
    total += l;
  }
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    let d = (total * k) / (n - 1);
    let i = 0;
    while (i < segLen.length && d > segLen[i]) {
      d -= segLen[i];
      i++;
    }
    if (i >= segLen.length) {
      out.push({ ...poly[poly.length - 1] });
    } else {
      const t = segLen[i] < 1e-6 ? 0 : d / segLen[i];
      out.push({
        x: poly[i].x + (poly[i + 1].x - poly[i].x) * t,
        y: poly[i].y + (poly[i + 1].y - poly[i].y) * t,
      });
    }
  }
  return out;
}

interface RouteCfg {
  id: string;
  name: string;
  grade: string;
  wallAngleDeg: number;
  wallAngleTop?: number;
  handRail: Pt[]; // 手轨折线
  footRail: Pt[]; // 脚轨折线
  nHand: number; // 手点数
  nFoot: number; // 脚点数
  zig?: number; // 左右交替偏移幅度
  handType?: (i: number, n: number) => Partial<HoldDef>; // 指定手点类型/朝向
  footType?: (i: number, n: number) => Partial<HoldDef>;
  starThreshold?: number;
}

/** 生成一条可攀线路 + 验证用攀爬序列。手点 h0..、脚点 f0..，起手用各前 2 点。 */
function buildRoute(cfg: RouteCfg): { level: LevelDef; seq: [Limb, string][] } {
  const zig = cfg.zig ?? 26;
  const hp = sampleRail(cfg.handRail, cfg.nHand);
  const fp = sampleRail(cfg.footRail, cfg.nFoot);
  const holds: HoldDef[] = [];

  for (let i = 0; i < hp.length; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const goal = i === hp.length - 1;
    const extra = cfg.handType ? cfg.handType(i, hp.length) : {};
    holds.push({
      id: goal ? "goal" : `h${i}`,
      type: (extra.type ?? "jug") as HoldType,
      x: Math.round(hp[i].x + side * zig),
      y: Math.round(hp[i].y),
      ...(goal ? { goal: true, radius: 24 } : {}),
      ...extra,
      ...(i === 0 ? { start: "LH" as Limb } : i === 1 ? { start: "RH" as Limb } : {}),
    });
  }
  for (let i = 0; i < fp.length; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const extra = cfg.footType ? cfg.footType(i, fp.length) : {};
    holds.push({
      id: `f${i}`,
      type: (extra.type ?? "jug") as HoldType,
      x: Math.round(fp[i].x + side * zig * 0.7),
      y: Math.round(fp[i].y),
      ...extra,
      ...(i === 0 ? { start: "LF" as Limb } : i === 1 ? { start: "RF" as Limb } : {}),
    });
  }

  // 攀爬序列：每轮先两手上、再两脚上（脚滞后手约一轮）→ 稳定，末手抓终点
  const seq: [Limb, string][] = [];
  const hid = (i: number) => (i === hp.length - 1 ? "goal" : `h${i}`);
  let hi = 2;
  let fi = 2;
  let guard = 0;
  while ((hi < hp.length || fi < fp.length) && guard++ < 60) {
    if (hi < hp.length) {
      seq.push([hi % 2 === 0 ? "LH" : "RH", hid(hi)]);
      if (hid(hi) === "goal") break;
      hi++;
      if (hi < hp.length) {
        seq.push([hi % 2 === 0 ? "LH" : "RH", hid(hi)]);
        if (hid(hi) === "goal") break;
        hi++;
      }
    }
    if (fi < fp.length) {
      seq.push([fi % 2 === 0 ? "LF" : "RF", `f${fi}`]);
      fi++;
      if (fi < fp.length) {
        seq.push([fi % 2 === 0 ? "LF" : "RF", `f${fi}`]);
        fi++;
      }
    }
  }

  const level: LevelDef = {
    id: cfg.id,
    name: cfg.name,
    grade: cfg.grade,
    wallAngleDeg: cfg.wallAngleDeg,
    ...(cfg.wallAngleTop != null ? { wallAngleTop: cfg.wallAngleTop } : {}),
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    holds,
    goalHoldId: "goal",
    starThreshold: cfg.starThreshold ?? Math.ceil(seq.length * 0.9),
  };
  return { level, seq };
}

// ---- V1 KLIFR：基本垂直，15 点 ----
const V1 = buildRoute({
  id: "v1",
  name: "KLIFR",
  grade: "V1",
  wallAngleDeg: 90,
  handRail: [{ x: 360, y: 560 }, { x: 360, y: 235 }],
  footRail: [{ x: 360, y: 770 }, { x: 360, y: 500 }],
  nHand: 9,
  nFoot: 6,
  zig: 32,
  handType: (i, n) => (i === 3 ? { type: "crimp", pullDirDeg: 90 } : i === n - 3 ? { type: "sloper", radius: 28 } : {}),
});

// ---- V2 SKÁ：45°+ 斜向横移，20 点 ----
const V2 = buildRoute({
  id: "v2",
  name: "SKÁ",
  grade: "V2",
  wallAngleDeg: 90,
  handRail: [{ x: 150, y: 540 }, { x: 560, y: 250 }],
  footRail: [{ x: 175, y: 730 }, { x: 560, y: 445 }],
  nHand: 11,
  nFoot: 9,
  zig: 16,
  handType: (i) => (i === 4 || i === 7 ? { type: "crimp", pullDirDeg: 180, pullTolDeg: 75 } : {}),
});

// ---- V3 HVELF：先上后下（拱形），30 点 ----
const V3 = buildRoute({
  id: "v3",
  name: "HVELF",
  grade: "V3",
  wallAngleDeg: 90,
  handRail: [{ x: 250, y: 520 }, { x: 265, y: 275 }, { x: 400, y: 225 }, { x: 535, y: 275 }, { x: 550, y: 500 }],
  footRail: [{ x: 250, y: 710 }, { x: 285, y: 455 }, { x: 400, y: 410 }, { x: 515, y: 455 }, { x: 550, y: 690 }],
  nHand: 16,
  nFoot: 14,
  zig: 16,
});

// ---- V4 GASTON：指定动作（侧拉/下扣 crux 才能过），20 点 ----
const V4 = buildRoute({
  id: "v4",
  name: "GASTON",
  grade: "V4",
  wallAngleDeg: 95,
  handRail: [{ x: 360, y: 560 }, { x: 360, y: 220 }],
  footRail: [{ x: 360, y: 745 }, { x: 360, y: 465 }],
  nHand: 11,
  nFoot: 9,
  zig: 30,
  // crux：中段三个方向点——右侧拉→下扣→左侧拉，逼迫偏身/张力才能吃住
  handType: (i) => {
    if (i === 4) return { type: "crimp", pullDirDeg: 180, pullTolDeg: 50 };
    if (i === 5) return { type: "crimp", pullDirDeg: -90, pullTolDeg: 50 };
    if (i === 6) return { type: "crimp", pullDirDeg: 0, pullTolDeg: 50 };
    return {};
  },
  starThreshold: 16,
});

// ---- V5 ÞAK：底部直壁 → 顶部大仰角（变墙角），24 点 ----
const V5 = buildRoute({
  id: "v5",
  name: "ÞAK",
  grade: "V5",
  wallAngleDeg: 90,
  wallAngleTop: 138,
  handRail: [{ x: 360, y: 600 }, { x: 360, y: 190 }],
  footRail: [{ x: 360, y: 790 }, { x: 360, y: 430 }],
  nHand: 13,
  nFoot: 11,
  zig: 30,
  handType: (i, n) => (i >= n - 5 ? { type: "jug", radius: 22 } : {}), // 顶部仰角段用大水罐好抓
});

// ---- V6 HVOLF：屋檐倒挂横移（脚在上排、手在下排，头下脚上），20 点 ----
const V6 = buildRoute({
  id: "v6",
  name: "HVOLF",
  grade: "V6",
  wallAngleDeg: 170,
  // 手轨在下(y大)、脚轨在上(y小) → 倒挂；横向从左到右
  handRail: [{ x: 210, y: 430 }, { x: 560, y: 430 }],
  footRail: [{ x: 210, y: 305 }, { x: 560, y: 305 }],
  nHand: 10,
  nFoot: 10,
  zig: 8,
  starThreshold: 14,
});

export const LEVEL_V1 = V1.level;
export const LEVEL_V2 = V2.level;
export const LEVEL_V3 = V3.level;
export const LEVEL_V4 = V4.level;
export const LEVEL_V5 = V5.level;
export const LEVEL_V6 = V6.level;

export const LEVELS: LevelDef[] = [
  LEVEL_V1,
  LEVEL_V2,
  LEVEL_V3,
  LEVEL_V4,
  LEVEL_V5,
  LEVEL_V6,
];

/** 开发/测试用：各关的一条参考攀爬序列。 */
export const LEVEL_SEQS: Record<string, [Limb, string][]> = {
  v1: V1.seq,
  v2: V2.seq,
  v3: V3.seq,
  v4: V4.seq,
  v5: V5.seq,
  v6: V6.seq,
};
