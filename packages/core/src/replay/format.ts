// 回放格式 schema 1（GDD 5.1）。
// 回放 = 关卡引用 + 选手配置 + 调参快照 + 量化输入事件序列 + 总帧数 + 成绩声明。
// 重演同一份回放必须得到比特级相同终态（stateHash 相等）——排行榜反作弊的地基。

import { Tuning } from "../config/tuning.ts";
import { Status } from "../sim/gameState.ts";

/** 输入事件：f = 逻辑帧号（事件在该帧物理步进前生效） */
export type InputEvent =
  | { f: number; e: "dragStart"; x: number; y: number }
  | { f: number; e: "dragMove"; x: number; y: number }
  | { f: number; e: "dragEnd" }
  | { f: number; e: "grip"; i: number } // 抓法环第 i 个选项（options 顺序确定）
  | { f: number; e: "cancelRing" }
  | { f: number; e: "reset" }
  | { f: number; e: "level"; i: number } // 切换到关卡序号 i
  | { f: number; e: "climber"; n: number } // 选手级别 1-10
  | { f: number; e: "chara"; id: string } // 切换角色（体格预设变化 → 重开本线）
  | { f: number; e: "undo" } // 回退一步（罚流畅星）
  | { f: number; e: "daily"; date: string }; // 载入每日挑战（date→seed 确定性重生成）

export interface Replay {
  schema: 1;
  coreVersion: string;
  levelId: string;
  levelIndex: number;
  climberLevel: number;
  /** tape 起点角色（可选：缺省 = 默认攀岩者，兼容旧回放） */
  characterId?: string;
  /** tape 起点抓法熟练度快照（影响物理的初始条件；缺省 = 全 0） */
  proficiency?: Record<string, number>;
  /** tape 起点为每日挑战时的日期（重演时按日期重生成关卡） */
  dailyDate?: string;
  /** 录制时的物理调参快照（重演时临时生效，结束后还原） */
  tuning: Tuning;
  events: InputEvent[];
  /** 模拟总帧数（60Hz 逻辑帧）；重演步进到此为止 */
  frames: number;
  /** 客户端声明的成绩；服务器以重演结果为准 */
  claim: { status: Status; gripCount: number; timeMs: number };
}

/** 世界坐标量化到 0.01：现场输入与回放输入走同一精度，杜绝"live 比 replay 更精细" */
export const quantize = (v: number): number => Math.round(v * 100) / 100;
