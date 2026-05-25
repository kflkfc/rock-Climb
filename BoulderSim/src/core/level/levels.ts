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
    // 起始 4 点（底部，预置四肢）
    { id: "s_lh", type: "jug", x: 175, y: 690, start: "LH" },
    { id: "s_rh", type: "jug", x: 255, y: 670, start: "RH" },
    { id: "s_lf", type: "jug", x: 180, y: 840, start: "LF" },
    { id: "s_rf", type: "jug", x: 255, y: 850, start: "RF" },

    // 上行路线（左右交替，间距控制在臂/腿可达内）
    { id: "h1", type: "jug", x: 150, y: 590 },
    { id: "h2", type: "pinch", x: 260, y: 560, pullDirDeg: 90 },
    { id: "f1", type: "jug", x: 175, y: 720 },
    { id: "f2", type: "crimp", x: 250, y: 700, pullDirDeg: 90 },

    { id: "h3", type: "jug", x: 200, y: 470 },
    { id: "h4", type: "sloper", x: 280, y: 440, radius: 28 },
    { id: "f3", type: "jug", x: 165, y: 600 },
    { id: "f4", type: "jug", x: 255, y: 580 },

    { id: "h5", type: "crimp", x: 175, y: 360, pullDirDeg: 90 },
    { id: "h6", type: "jug", x: 270, y: 340 },
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
