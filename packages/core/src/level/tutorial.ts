// 教学馆 · 8 关（GDD P2：每关教 1 个概念）。
// 短线快节奏；Dyno 教学不在此（需 Lv5 解锁，由 v7 STÖKK 在升级时引导——P3 教学系统）。

import { LevelDef, HoldDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";

const W = 720;
const H = 1000;

/** 紧凑手工关构造：默认起始四点在底部标准站位 */
function tut(
  n: number,
  name: string,
  grade: string,
  wallAngleDeg: number,
  extraHolds: HoldDef[],
  opts: { starThreshold?: number; startY?: [number, number]; hint?: string } = {},
): LevelDef {
  const [footY, handY] = opts.startY ?? [860, 730];
  const starts: HoldDef[] = [
    { id: "s_lf", type: "jug", x: 330, y: footY, start: "LF" as Limb },
    { id: "s_rf", type: "jug", x: 390, y: footY, start: "RF" as Limb },
    { id: "s_lh", type: "jug", x: 330, y: handY, start: "LH" as Limb },
    { id: "s_rh", type: "jug", x: 390, y: handY, start: "RH" as Limb },
  ];
  return {
    id: `t${n}`,
    name,
    grade,
    wallAngleDeg,
    worldWidth: W,
    worldHeight: H,
    holds: [...starts, ...extraHolds],
    goalHoldId: "goal",
    starThreshold: opts.starThreshold ?? 6,
    hint: opts.hint,
  };
}

/** T1 起步：拖一只手到头顶的大水罐就赢——教"拖拽把手" */
const T1 = tut(1, "起步", "V0", 90, [
  { id: "goal", type: "jug", x: 360, y: 620, radius: 30, goal: true },
],
  { hint: "拖动角色身上的彩色把手（这是你的手脚）——把一只手拖到上方的大水罐，碰到就抓住！" });

/** T2 攀爬：jug 阶梯，交替上手、脚跟上——教"手先脚后的循环" */
const T2 = tut(2, "攀爬", "V0", 90, [
  { id: "a1", type: "jug", x: 320, y: 610 },
  { id: "a2", type: "jug", x: 400, y: 560 },
  { id: "b1", type: "jug", x: 330, y: 470 },
  { id: "b2", type: "jug", x: 395, y: 420 },
  { id: "goal", type: "jug", x: 360, y: 300, radius: 28, goal: true },
],
  { hint: "手先上、脚跟上：两手轮流往上抓，再把脚踩到手用过的点，循环向上。" });

/** T3 平衡：大之字——重心必须跟着支撑点走，教"失衡警告" */
const T3 = tut(3, "平衡", "V0", 90, [
  { id: "a1", type: "jug", x: 250, y: 620 },
  { id: "a2", type: "jug", x: 280, y: 545 },
  { id: "b1", type: "jug", x: 445, y: 480 },
  { id: "b2", type: "jug", x: 465, y: 400 },
  { id: "m1", type: "jug", x: 370, y: 360 }, // 回程中继（保证无甩跳可解）
  { id: "c1", type: "jug", x: 285, y: 325 },
  { id: "goal", type: "jug", x: 325, y: 230, radius: 28, goal: true },
],
  { hint: "重心要跟着支撑点走！身体偏出抓点范围会失衡（顶部红字警告），及时把手脚往那边挪。" });

/** T4 抓法：引入 crimp 弹抓法环——教"选抓法，匹配度%" */
const T4 = tut(4, "抓法", "V0", 90, [
  { id: "a1", type: "jug", x: 320, y: 615 },
  { id: "c1", type: "crimp", x: 400, y: 560, pullDirDeg: 90 },
  { id: "c2", type: "crimp", x: 330, y: 470, pullDirDeg: 90 },
  { id: "b1", type: "jug", x: 400, y: 410 },
  { id: "goal", type: "jug", x: 360, y: 300, radius: 28, goal: true },
],
  { hint: "玫红色小棱点松手后会弹出【抓法环】：每个抓法有匹配度%——选高的省力，选错耐力狂掉。" });

/** T5 耐力：sloper 段挂久必掉，中途有休息 jug——教"耐力环与节奏" */
const T5 = tut(5, "耐力", "V1", 90, [
  { id: "sl1", type: "sloper", x: 320, y: 610, radius: 26 },
  { id: "sl2", type: "sloper", x: 400, y: 550, radius: 26 },
  { id: "rest", type: "jug", x: 330, y: 460 }, // 休息点
  { id: "sl3", type: "sloper", x: 405, y: 400, radius: 26 },
  { id: "goal", type: "jug", x: 360, y: 290, radius: 28, goal: true },
],
  { hint: "橙黄滑面很耗耐力（看肢端的彩色耐力环）！别挂太久，中途的大水罐是休息点。" });

/** T6 朝向：侧拉 edge（受力锥箭头）——教"箭头方向=好受力方向" */
const T6 = tut(6, "朝向", "V1", 90, [
  { id: "a1", type: "jug", x: 320, y: 615 },
  { id: "e1", type: "edge", x: 430, y: 550, pullDirDeg: 0, pullTolDeg: 60 }, // 向右拉
  { id: "e2", type: "edge", x: 290, y: 460, pullDirDeg: 180, pullTolDeg: 60 }, // 向左拉
  { id: "b1", type: "jug", x: 380, y: 400 },
  { id: "goal", type: "jug", x: 350, y: 290, radius: 28, goal: true },
],
  { hint: "岩点的箭头=最佳受力方向。身体位置让受力顺着箭头，扇形变绿=稳；变红=快掉了。" });

/** T7 脚法：脚钉只有脚能踩——教"脚要主动找点" */
const T7 = tut(7, "脚法", "V1", 90, [
  { id: "f1", type: "footchip", x: 330, y: 640 },
  { id: "a1", type: "jug", x: 320, y: 560 },
  { id: "f2", type: "footchip", x: 400, y: 520 },
  { id: "a2", type: "jug", x: 405, y: 450 },
  { id: "f3", type: "footchip", x: 340, y: 400 },
  { id: "goal", type: "jug", x: 365, y: 310, radius: 28, goal: true },
],
  { hint: "橄榄色小脚钉只有脚能踩。脚要主动找点——脚站得高，手才够得远。" });

/** T8 小考：综合运用（crimp+sloper+侧向+脚钉），毕业上岩馆 */
const T8 = tut(8, "小考", "V1", 90, [
  { id: "a1", type: "jug", x: 310, y: 620 },
  { id: "c1", type: "crimp", x: 420, y: 570, pullDirDeg: 90 },
  { id: "f1", type: "footchip", x: 350, y: 530 },
  { id: "sl1", type: "sloper", x: 300, y: 460, radius: 26 },
  { id: "e1", type: "edge", x: 430, y: 410, pullDirDeg: 0, pullTolDeg: 60 },
  { id: "b1", type: "jug", x: 340, y: 340 },
  { id: "goal", type: "jug", x: 390, y: 240, radius: 28, goal: true },
], { hint: "毕业小考：综合运用抓法、耐力、朝向、脚法。完攀后正式进入岩馆！", starThreshold: 8 });

export const TUTORIAL_LEVELS: LevelDef[] = [T1, T2, T3, T4, T5, T6, T7, T8];
