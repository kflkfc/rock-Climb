// 实验室诊断线 · x2「BOGI」（冰岛语"弓/拱"）——拱形上下攀 + 五段变墙角 + 大步距。
//
// 与 x1 TILRAUN 的分工：x1 密集短步、逐项试遍抓法脚法；x2 走**极限**——
// 步距顶到引擎伸展上限、墙角一路变、还要下攀，专门压测姿态求解与够不够得到。
//
// 覆盖：
//   ① 全 10 种形状（jug/edge/crimp/pinch/pocket/pocket2/mono/sloper/volume/footchip）
//   ② 上行 → 顶部转折 → 下行：下攀时脚先降再降手，受伸展约束的是脚（髋在脚上方）
//   ③ 五段墙角 70° 板墙 → 92° 直壁 → 118° 仰角 → 100° 微仰 → 76° 顶部板墙，
//      上行与下行走同一批 y 区间，同一墙角要用两种身位各过一次
//   ④ 大步距：手每步 85~100（肩根约在上一档手点下方 25，实测极限约 103），
//      左右分档 130，视觉稀疏、身体必须真的挪过去
//   ⑤ 动作全谱：朝下/朝上/朝左/朝右的棱各就各位，上行时是侧拉的点，下行经过时
//      因身位改变会变成反肩——正好演示"动作不是岩点属性"
//
// 非正式内容：不进黄金回放、不进 AI 出厂检验（见 levels.ts 的 LAB_LEVEL_IDS）。

import { LevelDef, HoldDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";

const W = 720;
const H = 1000;

/**
 * 手脚两轨的纵向间距。取 150 而不是贴着躯干的 120 是为了**间距最大化**：
 * 两轨的最近纵向间隔 = min_k |GAP − k×步距|，在 GAP = 1.5×步距 时取到最大的
 * 步距/2 = 50。用 120 的话 |120−100| 只有 20，点看着挤成一堆，而步子并没变大。
 * 再叠上脚轨的横向错位 FOOT_DX，跨轨最近邻拉到 ~61。
 */
const GAP = 150;

/**
 * 上行段：脚轨 y（自下而上），手轨恒在其上方 GAP。
 * 步距 100 → 75 递减：肩根约在上一档手点下方 25，直壁上单步极限约 103；
 * 墙越仰身体外挂越多、肩根下沉越狠，实测 118° 段 90 就够不到了，故收到 80/75。
 */
const UF = [900, 800, 700, 615, 540, 475];
const UH = UF.map((y) => y - GAP); // 750 650 550 465 390 325
/**
 * 下行段：脚轨 y（自上而下），步距同样 100。
 * 下攀的伸展瓶颈是**脚**（髋在脚上方，往下伸 Δ 的实际距离约 Δ+20~30），
 * 实测 100 仍在 150 的腿展之内；转折后第一档脚只降到 410，才够得着。
 * 步距取 GAP/1.5 = 100 也是两轨交错的最优解，见 GAP 注释。
 */
const DF = [410, 510, 610, 710, 810];
const DH = DF.map((y) => y - GAP);

/** 上行在左侧，重心 x 随高度右移；下行在右侧 */
const UC = [220, 235, 252, 272, 296, 322]; // 上行各档中心 x
const DC = [488, 512, 530, 542, 550]; // 下行各档中心 x（首档避开拱顶那两颗）
const SPREAD = 65; // 左右分档半宽（左右点相距 130）
/** 脚轨相对手轨的横向错位：与 GAP−步距 的纵向错位一起，把两轨的最近邻拉开 */
const FOOT_DX = 35;

const L = (c: number) => Math.round(c - SPREAD);
const R = (c: number) => Math.round(c + SPREAD);
const FL = (c: number) => Math.round(c - SPREAD + FOOT_DX);
const FR = (c: number) => Math.round(c + SPREAD + FOOT_DX);

const HOLDS: HoldDef[] = [
  // ═══ 上行 · 第 0 档（70° 板墙起步）═══
  { id: "uf0l", type: "footchip", x: FL(UC[0]), y: UF[0], start: "LF" },
  { id: "uf0r", type: "edge", x: FR(UC[0]), y: UF[0], start: "RF" },
  { id: "uh0l", type: "jug", x: L(UC[0]), y: UH[0], start: "LH" },
  { id: "uh0r", type: "jug", x: R(UC[0]), y: UH[0], start: "RH" },

  // 第 1 档（板墙：脚法对照，内侧踩该占优）
  { id: "uf1l", type: "sloper", x: FL(UC[1]), y: UF[1], radius: 26 },
  { id: "uf1r", type: "footchip", x: FR(UC[1]), y: UF[1] },
  { id: "uh1l", type: "edge", x: L(UC[1]), y: UH[1] },
  { id: "uh1r", type: "pinch", x: R(UC[1]), y: UH[1] },

  // 第 2 档（进 92° 直壁：指洞三档登场）
  { id: "uf2l", type: "edge", x: FL(UC[2]), y: UF[2] },
  { id: "uf2r", type: "crimp", x: FR(UC[2]), y: UF[2] },
  { id: "uh2l", type: "pocket", x: L(UC[2]), y: UH[2] }, // 大指洞 3 指
  { id: "uh2r", type: "pocket2", x: R(UC[2]), y: UH[2] }, // 中指洞 2 指

  // 第 3 档（直壁 → 仰角过渡：侧拉对抗）
  { id: "uf3l", type: "volume", x: FL(UC[3]), y: UF[3], radius: 40 },
  { id: "uf3r", type: "edge", x: FR(UC[3]), y: UF[3] },
  { id: "uh3l", type: "edge", x: L(UC[3]), y: UH[3], pullDirDeg: 0 }, // 向右拉
  { id: "uh3r", type: "edge", x: R(UC[3]), y: UH[3], pullDirDeg: 180 }, // 向左拉（对抗）

  // 第 4 档（118° 仰角：单指洞 crux + 挂脚/勾脚战场）
  { id: "uf4l", type: "jug", x: FL(UC[4]), y: UF[4], radius: 22 }, // 近身：挂脚(膝深弯)
  { id: "uf4r", type: "jug", x: FR(UC[4]) + 40, y: UF[4], radius: 22 }, // 外偏：勾脚 / 外侧踩背步
  { id: "uh4l", type: "edge", x: L(UC[4]), y: UH[4] }, // 仰角大步这一档不放刁点
  { id: "uh4r", type: "edge", x: R(UC[4]), y: UH[4] },

  // 第 5 档（仰角出口）
  { id: "uf5l", type: "edge", x: FL(UC[5]), y: UF[5] },
  { id: "uf5r", type: "sloper", x: FR(UC[5]), y: UF[5], radius: 26 },
  { id: "uh5l", type: "edge", x: L(UC[5]), y: UH[5] }, // 仰角出口：单手要独扛全身，别放小棱
  { id: "uh5r", type: "jug", x: R(UC[5]), y: UH[5], radius: 22 },

  // ═══ 顶部转折（76° 板墙，拱顶）═══
  // 反提点：从下方够到时向上提，是全线唯一的"朝上"点
  { id: "topl", type: "edge", x: 392, y: 245, pullDirDeg: -90, pullTolDeg: 55 },
  { id: "topr", type: "jug", x: 470, y: 262, radius: 24 },
  // ★ 旁挂诊断点：拱顶站稳后伸手可及，脱手也不挡下攀。
  //   最小指洞放这儿而不是主线上——单指洞独扛全身会把通关门槛顶到 Lv8。
  { id: "m1", type: "mono", x: 330, y: 200 },

  // ═══ 下行（同一批 y 区间反向再走一遍）═══
  // 第 0 档
  { id: "dh0l", type: "edge", x: L(DC[0]), y: DH[0] },
  { id: "dh0r", type: "pinch", x: R(DC[0]), y: DH[0] },
  { id: "df0l", type: "jug", x: FL(DC[0]), y: DF[0], radius: 22 },
  { id: "df0r", type: "edge", x: FR(DC[0]), y: DF[0] },

  // 第 1 档（回到 118° 仰角，这次是下攀身位）
  { id: "dh1l", type: "edge", x: L(DC[1]), y: DH[1], pullDirDeg: 0 }, // 朝右：左手往身上拉 = 侧拉
  { id: "dh1r", type: "crimp", x: R(DC[1]), y: DH[1] },
  { id: "df1l", type: "sloper", x: FL(DC[1]), y: DF[1], radius: 26 },
  { id: "df1r", type: "footchip", x: FR(DC[1]), y: DF[1] },

  // 第 2 档
  { id: "dh2l", type: "edge", x: L(DC[2]), y: DH[2] },
  // 朝右的棱长在身体右侧 → 右手只能向外撑 = 反肩（同一朝向，换只手就是侧拉）
  { id: "dh2r", type: "edge", x: R(DC[2]), y: DH[2], pullDirDeg: 0 },
  { id: "df2l", type: "crimp", x: FL(DC[2]), y: DF[2] },
  { id: "df2r", type: "volume", x: FR(DC[2]), y: DF[2], radius: 40 },

  // 第 3 档（回到 92° 直壁）
  { id: "dh3l", type: "edge", x: L(DC[3]), y: DH[3] },
  { id: "dh3r", type: "pocket2", x: R(DC[3]), y: DH[3] },
  { id: "df3l", type: "edge", x: FL(DC[3]), y: DF[3] },
  { id: "df3r", type: "crimp", x: FR(DC[3]), y: DF[3] },

  // 第 4 档
  { id: "dh4l", type: "pocket", x: L(DC[4]), y: DH[4] },
  { id: "dh4r", type: "edge", x: R(DC[4]), y: DH[4] },
  { id: "df4l", type: "edge", x: FL(DC[4]), y: DF[4] },
  { id: "df4r", type: "sloper", x: FR(DC[4]), y: DF[4], radius: 26 },

  // 终点：下攀到底（不是"登顶"——摸到即完攀，位置由关卡说了算）
  { id: "goal", type: "jug", x: DC[4], y: 760, radius: 26, goal: true },
];

export const LAB_ARCH_LEVEL: LevelDef = {
  id: "x2",
  name: "BOGI",
  grade: "V?",
  wallAngleDeg: 70,
  wallSegments: [
    // 分界线尽量落在两档岩点之间的空当上——SEG_BLEND=50 的过渡带里墙角是混合值，
    // 关键点摆进去就测不准了。48 颗点铺满 700px，做不到全部避开，只能取最大间隙。
    { yTop: 855, yBottom: H, angleDeg: 70 }, // 板墙：起步
    { yTop: 675, yBottom: 855, angleDeg: 92 }, // 直壁：指洞区
    { yTop: 490, yBottom: 675, angleDeg: 118 }, // 仰角：crux + 挂脚勾脚
    { yTop: 293, yBottom: 490, angleDeg: 100 }, // 微仰
    { yTop: 0, yBottom: 293, angleDeg: 76 }, // 顶部板墙：拱顶转折
  ],
  worldWidth: W,
  worldHeight: H,
  holds: HOLDS,
  goalHoldId: "goal",
  starThreshold: 36,
  stars: { targetMoves: 44, targetTimeSec: 420 }, // 诊断线不定标，给宽松值免得干扰试玩
  hint: "拱形线：左侧上行 → 拱顶转折（含全线唯一反提点）→ 右侧下攀到终点。步距接近伸展极限，先挪身体再伸手。",
};

/**
 * 参考序列。上行 = 两手上一档 → 两脚上一档；
 * 下攀反过来：**先降脚再降手**（髋在脚上方，下攀时脚才是伸展瓶颈）。
 */
export const LAB_ARCH_SEQ: [Limb, string][] = (() => {
  const s: [Limb, string][] = [];
  for (let i = 1; i <= 5; i++) {
    s.push(["LH", `uh${i}l`], ["RH", `uh${i}r`]);
    s.push(["LF", `uf${i}l`], ["RF", `uf${i}r`]);
  }
  // 拱顶转折：双手上拱顶，脚跟到上行最高的手点
  s.push(["LH", "topl"], ["RH", "topr"]);
  s.push(["LF", "uh5l"], ["RF", "uh5r"]);
  // 下攀：脚先降，手再降
  for (let j = 0; j <= 4; j++) {
    s.push(["LF", `df${j}l`], ["RF", `df${j}r`]);
    s.push(["LH", `dh${j}l`], ["RH", `dh${j}r`]);
  }
  s.push(["RH", "goal"]);
  return s;
})();
