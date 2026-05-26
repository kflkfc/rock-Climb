// 纯逻辑 · 切片关卡：1 面直壁(90°) + 1 条 V0 平衡路线。
// 名字沿用 Klifur 冰岛语风格：ÞREP（台阶）。起手 4 个大水罐，向上以 Jug 为主，
// 穿插 1 Crimp / 1 Pinch / 1 Sloper 让 4 种岩点都出现，顶部彩虹终点。

import { LevelDef } from "./levelSchema.ts";

export const LEVEL_THREP: LevelDef = {
  id: "threp",
  name: "ÞREP",
  grade: "V0",
  wallAngleDeg: 90,
  worldWidth: 420,
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

export const LEVELS: LevelDef[] = [LEVEL_THREP];
