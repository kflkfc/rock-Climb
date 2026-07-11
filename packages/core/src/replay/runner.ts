// GameRunner：确定性游戏会话 = 固定步长驱动 + 输入帧队列 + 全程录制。
// UI 层（任何平台）不再直接调 Game 的交互方法，一律 dispatch 事件：
//   事件在"下一个逻辑帧的物理步进之前"生效并录入 tape —— 现场即回放。
// replayRun()：用同一 apply 路径重演 tape，产出终态哈希（黄金测试 / 反作弊共用）。

import { Game } from "../sim/gameState.ts";
import { LEVELS } from "../level/levels.ts";
import { v } from "../math/vec2.ts";
import { tuning, Tuning } from "../config/tuning.ts";
import { CORE_VERSION } from "../version.ts";
import { InputEvent, Replay, quantize } from "./format.ts";
import { stateHash } from "./hash.ts";

/** 逻辑步长唯一事实来源（60Hz）。渲染循环从这里取，禁止另定义 */
export const LOGIC_DT = 1 / 60;

/** 分配式 Omit：保住 InputEvent 的判别联合结构（普通 Omit 会压扁联合） */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type Pending = DistributiveOmit<InputEvent, "f">;

function applyEvent(game: Game, ev: Pending): void {
  switch (ev.e) {
    case "dragStart":
      game.beginDrag(v(ev.x, ev.y));
      break;
    case "dragMove":
      game.moveDrag(v(ev.x, ev.y));
      break;
    case "dragEnd":
      game.endDrag();
      break;
    case "grip":
      game.chooseGripByIndex(ev.i);
      break;
    case "cancelRing":
      game.cancelRing();
      break;
    case "reset":
      game.reset();
      break;
    case "level":
      game.loadIndex(ev.i);
      break;
    case "climber":
      game.setClimberLevel(ev.n);
      break;
    case "chara":
      game.setCharacter(ev.id);
      break;
    case "undo":
      game.undo();
      break;
  }
}

export class GameRunner {
  readonly game: Game;
  /** 当前逻辑帧号（= 已完成的 step 次数） */
  frame = 0;
  private pending: Pending[] = [];
  private tape: InputEvent[] = [];
  private tuningSnapshot: Tuning;
  /** tape 起点时的初始条件（中途变化走事件重演；导出时不得用"末态"覆盖） */
  private startClimberLevel: number;
  private startLevelIndex: number;
  private startCharacterId: string;
  private startProficiency: Record<string, number>;

  constructor(levelIndex = 0, climberLevel?: number) {
    this.game = new Game(LEVELS[levelIndex]);
    if (climberLevel != null) this.game.setClimberLevel(climberLevel);
    this.tuningSnapshot = { ...tuning };
    this.startClimberLevel = this.game.climberLevel;
    this.startLevelIndex = this.game.levelIndex;
    this.startCharacterId = this.game.characterId;
    this.startProficiency = { ...this.game.proficiency };
  }

  /** UI 任意时刻调用；坐标事件量化后入队，下个逻辑帧生效 */
  dispatch(ev: Pending): void {
    if (ev.e === "dragStart" || ev.e === "dragMove") {
      const q = { ...ev, x: quantize(ev.x), y: quantize(ev.y) };
      // 同帧内连续 dragMove 只保留最后一个（指针事件密度 > 帧率时的瘦身）
      const last = this.pending[this.pending.length - 1];
      if (q.e === "dragMove" && last?.e === "dragMove") {
        this.pending[this.pending.length - 1] = q;
        return;
      }
      this.pending.push(q);
      return;
    }
    this.pending.push(ev);
  }

  /** 推进一个逻辑帧：先生效并录制本帧事件，再走物理 */
  step(): void {
    for (const p of this.pending) {
      this.tape.push({ ...p, f: this.frame } as InputEvent);
      applyEvent(this.game, p);
    }
    this.pending = [];
    this.game.update(LOGIC_DT);
    this.frame++;
  }

  /** 重新开始录制（换关/正式开始尝试时调用）：清空 tape、帧号归零、快照起始条件 */
  restartTape(): void {
    this.tape = [];
    this.frame = 0;
    this.pending = [];
    this.tuningSnapshot = { ...tuning };
    this.startClimberLevel = this.game.climberLevel;
    this.startLevelIndex = this.game.levelIndex;
    this.startCharacterId = this.game.characterId;
    this.startProficiency = { ...this.game.proficiency };
  }

  /** 导出当前 tape 为回放文件（初始条件取 tape 起点快照，claim 取当前逻辑状态） */
  exportReplay(): Replay {
    return {
      schema: 1,
      coreVersion: CORE_VERSION,
      levelId: LEVELS[this.startLevelIndex].id,
      levelIndex: this.startLevelIndex,
      climberLevel: this.startClimberLevel,
      characterId: this.startCharacterId,
      proficiency: this.startProficiency,
      tuning: this.tuningSnapshot,
      events: this.tape.slice(),
      frames: this.frame,
      claim: {
        status: this.game.status,
        gripCount: this.game.gripCount,
        timeMs: Math.round(this.game.time * 1000),
      },
    };
  }

  hash(): string {
    return stateHash(this.game);
  }
}

export interface ReplayResult {
  hash: string;
  game: Game;
  /** 重演结果与 claim 是否一致（服务器反作弊判据之一） */
  claimOk: boolean;
}

/** 重演回放：临时套用其调参快照，逐帧生效事件并步进，返回终态哈希 */
export function replayRun(replay: Replay): ReplayResult {
  const saved = { ...tuning };
  Object.assign(tuning, replay.tuning);
  try {
    const game = new Game(LEVELS[replay.levelIndex]);
    game.setClimberLevel(replay.climberLevel);
    if (replay.characterId) game.setCharacter(replay.characterId); // 缺省=默认攀岩者（旧回放兼容）
    game.setProficiency(replay.proficiency ?? {}); // 影响物理的初始条件
    let ei = 0;
    for (let f = 0; f < replay.frames; f++) {
      while (ei < replay.events.length && replay.events[ei].f === f) {
        applyEvent(game, replay.events[ei]);
        ei++;
      }
      game.update(LOGIC_DT);
    }
    const claimOk =
      game.status === replay.claim.status &&
      game.gripCount === replay.claim.gripCount &&
      Math.round(game.time * 1000) === replay.claim.timeMs;
    return { hash: stateHash(game), game, claimOk };
  } finally {
    Object.assign(tuning, saved);
  }
}
