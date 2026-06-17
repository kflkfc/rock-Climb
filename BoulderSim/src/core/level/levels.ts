// 纯逻辑 · 切片关卡：1 面直壁(90°) + 1 条 V0 平衡路线。
// 名字沿用 Klifur 冰岛语风格：ÞREP（台阶）。起手 4 个大水罐，向上以 Jug 为主，
// 穿插 1 Crimp / 1 Pinch / 1 Sloper 让 4 种岩点都出现，顶部彩虹终点。

import { LevelDef } from "./levelSchema.ts";

const WORLD_W = 720; // 加宽攀岩墙（摄像机固定缩放 + 横向滚动）

const THREP_BASE: LevelDef = {
  id: "threp",
  name: "ÞREP",
  grade: "V0",
  wallAngleDeg: 90,
  worldWidth: WORLD_W,
  worldHeight: 1000,
  goalHoldId: "goal",
  starThreshold: 6,
  holds: [
    // 起始 4 点：手高于头(上举)、脚在下(站立)，让起手姿态自然舒展而非半蹲蛙形
    { id: "s_lh", type: "jug", x: 196, y: 574, start: "LH" },
    { id: "s_rh", type: "jug", x: 248, y: 560, start: "RH" },
    { id: "s_lf", type: "jug", x: 182, y: 846, start: "LF" },
    { id: "s_rf", type: "jug", x: 252, y: 852, start: "RF" },

    // 上行路线（左右交替，间距控制在臂/腿可达内）
    // h1 = 左侧"侧拉"：朝向向右(0°)，需把身体保持在它右侧、横向受力（非直挂下方）
    { id: "h1", type: "crimp", x: 150, y: 590, pullDirDeg: 0, pullTolDeg: 70 },
    { id: "h2", type: "pinch", x: 260, y: 560, pullDirDeg: 90 },
    { id: "f1", type: "jug", x: 175, y: 720 },
    { id: "f2", type: "crimp", x: 250, y: 700, pullDirDeg: 90 },

    { id: "h3", type: "jug", x: 200, y: 470 },
    { id: "h4", type: "sloper", x: 280, y: 440, radius: 28 },
    { id: "f3", type: "jug", x: 165, y: 600 },
    { id: "f4", type: "jug", x: 255, y: 580 },

    // h5 = "下扣"undercling：朝向向上(-90°)，需身体升到它上方、向上抠
    { id: "h5", type: "crimp", x: 175, y: 360, pullDirDeg: -90, pullTolDeg: 75 },
    // h6 = 右侧"侧拉"：朝向向左(180°)，身体保持在它左侧横向受力
    { id: "h6", type: "crimp", x: 270, y: 340, pullDirDeg: 180, pullTolDeg: 70 },
    { id: "f5", type: "jug", x: 190, y: 480 },
    { id: "f6", type: "jug", x: 270, y: 470 },

    { id: "h7", type: "jug", x: 210, y: 250 },
    { id: "f7", type: "jug", x: 185, y: 370 },
    { id: "f8", type: "jug", x: 265, y: 360 },

    // 顶部彩虹终点
    { id: "goal", type: "jug", x: 220, y: 150, radius: 24, goal: true },
  ],
};

/**
 * 把一条线路水平"剪切"成斜上线路：越往上(y 越小)整体越往一侧偏移。
 * 因为剪切保持了相邻岩点的纵向间距与相对几何，可解性与原竖线一致，
 * 只是身体需要一路斜向移动 + 偏身/配重/flag —— 正好检验这些系统。
 * k>0 → 斜向右上；k<0 → 斜向左上。
 */
/** 整体平移线路（用于把窄竖线居中到加宽的墙上）。 */
function translateRoute(base: LevelDef, dx: number): LevelDef {
  return { ...base, holds: base.holds.map((h) => ({ ...h, x: Math.round(h.x + dx) })) };
}

// ÞREP 原始 x≈150-280（中心~215），平移到加宽墙中心
export const LEVEL_THREP = translateRoute(THREP_BASE, WORLD_W / 2 - 215);

const SHEAR_REF = 850; // 参考底线 y（起手脚附近），此处偏移为 0
function shearRoute(
  base: LevelDef,
  opts: { id: string; name: string; grade?: string; k: number; wallAngleDeg?: number },
): LevelDef {
  return {
    ...base,
    id: opts.id,
    name: opts.name,
    grade: opts.grade ?? base.grade,
    wallAngleDeg: opts.wallAngleDeg ?? base.wallAngleDeg,
    holds: base.holds.map((h) => ({ ...h, x: Math.round(h.x + (SHEAR_REF - h.y) * opts.k) })),
  };
}

/** 斜向右上 */
export const LEVEL_SKA_R = shearRoute(LEVEL_THREP, { id: "ska_r", name: "SKÁ →", grade: "V1", k: 0.24 });
/** 斜向左上 */
export const LEVEL_SKA_L = shearRoute(LEVEL_THREP, { id: "ska_l", name: "SKÁ ←", grade: "V1", k: -0.24 });
/** 仰角斜线（135° 屋檐感）：更宽的斜向右上 + 手承重更多，身体大幅后仰 */
export const LEVEL_THAK = shearRoute(LEVEL_THREP, {
  id: "thak",
  name: "ÞAK ⤢",
  grade: "V3",
  k: 0.3,
  wallAngleDeg: 135,
});

export const LEVELS: LevelDef[] = [LEVEL_THREP, LEVEL_SKA_R, LEVEL_SKA_L, LEVEL_THAK];
