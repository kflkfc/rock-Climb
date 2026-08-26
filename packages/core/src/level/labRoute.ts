// 实验室诊断线 · x1「TILRAUN」（冰岛语"实验"）——一条线覆盖全部 12 种岩点类型。
//
// 用途：人工试玩验证四个待修议题（不是正式内容，不参与星级定标/黄金回放/AI 出厂检验）：
//   ① 内侧踩 vs 外侧踩：Z1 板墙段（内侧该占优）对照 Z3 仰角段 f5r 外偏脚点（外侧/背步该占优）
//   ② 挂脚(脚跟·膝盖弯) / 勾脚(脚尖·腿直)：Z3 仰角段 f5l 近身、f5r 外偏两颗大水罐
//   ③ 方向/动作：主线 h3 侧拉对抗 + 旁挂 g1 反肩 / u1 反提。
//      这三者都是**动作**不是岩点类型——同为竖条 edge，靠 pullDirDeg 与身体位置区分。
//   ④ 指洞三档：h1l 大指洞(3 指) / h2r 中指洞(2 指) / h2l 最小指洞(1 指)
//
// 布局：手脚分轨——脚现在哪儿都能踩，但指洞/捏点踩起来很差且一次只容一只肢端，
// 单轨共用的 buildRoute 表达不了这种分工，故手工排点：手轨恒在同序脚轨上方 105~130。
// 每档左右各一点：L 点 x<360 给 LH/LF，R 点 x>360 给 RH/RF。
// 三颗"旁挂诊断点"(g1/u1/c1) 不在主线上：站稳后伸手即可试，脱手也不挡通关。
//
// 难度门槛：参考序列 Lv5 起可通关（Lv4 会卡在 mono 段——指力不足，符合预期）。

import { LevelDef, HoldDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { WORLD_W, WORLD_H } from "./builders.ts";

// 档距经实测标定：手的伸展受"肩根 ≈ 上一档手点下方 25"约束，
// 单步上移 85 已接近极限；仰角段身体外挂更多，步距再收到 75。
/** 脚轨 6 档 y（自下而上） */
const FY = [900, 815, 730, 645, 560, 475];
/** 手轨 6 档 y（自下而上），恒在同序脚档上方 105~130 */
const HY = [770, 685, 600, 520, 445, 370];

const HOLDS: HoldDef[] = [
  // ---- Z1 板墙 78°（脚法对照区：内侧踩应明显优于外侧踩）----
  { id: "f0l", type: "footchip", x: 300, y: FY[0], start: "LF" },
  { id: "f0r", type: "edge", x: 420, y: FY[0], start: "RF" },
  { id: "h0l", type: "jug", x: 312, y: HY[0], start: "LH" },
  { id: "h0r", type: "jug", x: 408, y: HY[0], start: "RH" },

  { id: "f1l", type: "crimp", x: 294, y: FY[1] },
  { id: "f1r", type: "footchip", x: 426, y: FY[1] },

  // ---- Z2 直壁 92°（指洞/指力区）----
  { id: "h1l", type: "pocket", x: 300, y: HY[1] }, // 大指洞（3 指）
  { id: "h1r", type: "pinch", x: 420, y: HY[1] },
  { id: "f2l", type: "edge", x: 302, y: FY[2] },
  { id: "f2r", type: "sloper", x: 428, y: FY[2], radius: 26 },

  // ★ 旁挂诊断点：直壁段站稳 h2/f2 后左手可及，专供安全试全扣/半扣/开掌
  { id: "c1", type: "crimp", x: 252, y: 615 },

  { id: "h2l", type: "mono", x: 306, y: HY[2] }, // 最小指洞（1 指）
  { id: "h2r", type: "pocket2", x: 424, y: HY[2] }, // 中指洞（2 指）
  { id: "f3l", type: "volume", x: 306, y: FY[3], radius: 40 },
  { id: "f3r", type: "edge", x: 424, y: FY[3] },

  // ---- Z3 仰角 108° 起（方向区：侧拉对抗 → 反肩 + 反提）----
  // 侧拉不是岩点类型而是动作：竖条(edge)转成横向受力，够到时自然判成侧拉
  { id: "h3l", type: "edge", x: 300, y: HY[3], pullDirDeg: 0 }, // 左点向右拉
  { id: "h3r", type: "edge", x: 420, y: HY[3], pullDirDeg: 180 }, // 右点向左拉（对抗）
  { id: "f4l", type: "edge", x: 298, y: FY[4] },
  { id: "f4r", type: "crimp", x: 430, y: FY[4] },

  // 主线一档（不带朝向：保证仰角段随时能通过，方向点做旁挂支线）
  { id: "h4l", type: "edge", x: 302, y: HY[4] },
  { id: "h4r", type: "jug", x: 418, y: HY[4], radius: 20 },
  // ★ 旁挂诊断点：站稳主线 h4/f4 后左右伸手即可够到，脱手也不影响继续上攀。
  //   现版本这两点几乎必脱（受力方向与身体位置矛盾），修好后应能稳定悬挂数秒。
  { id: "g1", type: "edge", x: 248, y: 430, pullDirDeg: 180 }, // 朝外：左手够到 → 判成反肩
  { id: "u1", type: "edge", x: 472, y: 480, pullDirDeg: -90 }, // 朝上：右手在肩下 → 判成反提

  // 脚点：左近身大水罐（挂脚/脚跟位）、右外偏大水罐（勾脚 + 外侧踩背步位）
  { id: "f5l", type: "jug", x: 302, y: FY[5], radius: 22 },
  { id: "f5r", type: "jug", x: 448, y: FY[5], radius: 22 },

  // ---- Z4 收顶 96° ----
  { id: "h5l", type: "edge", x: 304, y: HY[5] },
  { id: "h5r", type: "sloper", x: 420, y: HY[5], radius: 26 },
  { id: "goal", type: "jug", x: 360, y: 290, radius: 26, goal: true },
];

export const LAB_LEVEL: LevelDef = {
  id: "x1",
  name: "TILRAUN",
  grade: "V?",
  wallAngleDeg: 78,
  wallSegments: [
    { yTop: 700, yBottom: WORLD_H, angleDeg: 78 }, // 板墙：脚法对照
    { yTop: 540, yBottom: 700, angleDeg: 92 }, // 直壁：指洞区
    { yTop: 300, yBottom: 540, angleDeg: 108 }, // 仰角：方向 + 挂脚/勾脚
    { yTop: 0, yBottom: 300, angleDeg: 96 }, // 收顶
  ],
  worldWidth: WORLD_W,
  worldHeight: WORLD_H,
  holds: HOLDS,
  goalHoldId: "goal",
  starThreshold: 21,
  stars: { targetMoves: 25, targetTimeSec: 240 }, // 诊断线：不定标，给宽松值免得干扰试玩
  hint: "诊断线：12 种岩点全在。左右旁挂点可安全试反肩/反提/小棱；仰角段两颗大水罐试挂脚勾脚",
};

/** 参考序列：每轮 两手上一档 → 两脚上一档。 */
export const LAB_SEQ: [Limb, string][] = (() => {
  const seq: [Limb, string][] = [];
  for (let i = 1; i <= 5; i++) {
    seq.push(["LH", `h${i}l`], ["RH", `h${i}r`]);
    seq.push(["LF", `f${i}l`], ["RF", `f${i}r`]);
  }
  seq.push(["RH", "goal"]);
  return seq;
})();
