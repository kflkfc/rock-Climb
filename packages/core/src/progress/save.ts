// 存档系统 schema 1 + 版本迁移框架（GDD 模块 03/13）。
// 纯逻辑：存储介质经 KVStore 接口注入（Web=localStorage / 微信=wx storage / 测试=内存 Map）。
// 前向约定：schema 只增不改；升 schema 必须在 MIGRATIONS 里补一个迁移函数，旧档永不丢。

export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

import { StarResult, noStars, mergeStars } from "./stars.ts";

export interface LevelProgress {
  /** 最佳抓取数（越少越好）；null = 未完攀过 */
  bestMoves: number | null;
  bestTimeMs: number | null;
  /** 三星分项历史并集（schema 2）：登顶/流畅/神速各自取历史最优 */
  stars: StarResult;
  wins: number;
  attempts: number;
}

export interface SaveV2 {
  schema: 2;
  createdAt: string; // ISO 时间，仅作展示；逻辑不读墙钟
  climberLevel: number; // 选手级别 1-10
  characterId: string; // 当前角色
  /** testMode：可选字段（老档缺省 false）。仅影响 UI 解锁门槛（全角色可选），
   *  不进物理/回放——角色一旦选定仍走正常 chara 事件、作为 tape 起始条件被诚实记录 */
  settings: { muted: boolean; testMode?: boolean };
  /** 按关卡 id 记录进度 */
  progress: Record<string, LevelProgress>;
  /** 抓法熟练度 0-100（使用即涨）。可选字段：老档缺省视为全 0。
   *  进物理（liveMatch 加成）——tape 起点冻结注入，run 内不变 */
  proficiency?: Record<string, number>;
  /** 已解锁成就 id 列表（可选字段：老档缺省为空） */
  achievements?: string[];
  /** 上榜昵称（首次提交时设置） */
  nickname?: string;
}

export type SaveData = SaveV2; // 最新版别名；升版时改指向

export const SAVE_KEY = "kkc.save";

export function defaultSave(now: string): SaveV2 {
  return {
    schema: 2,
    createdAt: now,
    climberLevel: 5,
    characterId: "climber",
    settings: { muted: false },
    progress: {},
  };
}

export function emptyLevelProgress(): LevelProgress {
  return { bestMoves: null, bestTimeMs: null, stars: noStars(), wins: 0, attempts: 0 };
}

// ---- 迁移框架 ----
// MIGRATIONS[n] 把 schema n 迁到 n+1。加载时从存档的 schema 一路迁到最新。

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2：简化星数(0-3) → 三星分项。保守迁移：只保留登顶（流畅/神速重新挣）。
  1: (raw) => {
    const oldProgress = (raw.progress ?? {}) as Record<string, Record<string, unknown>>;
    const progress: Record<string, unknown> = {};
    for (const [id, p] of Object.entries(oldProgress)) {
      progress[id] = {
        ...p,
        stars: { topped: ((p.stars as number) ?? 0) >= 1, flow: false, speed: false },
      };
    }
    return { ...raw, schema: 2, characterId: raw.characterId ?? "climber", progress };
  },
};

export const LATEST_SCHEMA = 2;

/** 解析 + 迁移 + 校验。任何解析失败/结构损坏 → 返回 null（调用方决定是否用默认档） */
export function parseSave(json: string | null): SaveData | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  let data = raw as Record<string, unknown>;
  let schema = typeof data.schema === "number" ? data.schema : NaN;
  if (!Number.isInteger(schema) || schema < 1 || schema > LATEST_SCHEMA) return null;
  while (schema < LATEST_SCHEMA) {
    const mig = MIGRATIONS[schema];
    if (!mig) return null;
    data = mig(data);
    schema = data.schema as number;
  }
  return validate(data) ? (data as unknown as SaveData) : null;
}

function validate(d: Record<string, unknown>): boolean {
  if (d.schema !== LATEST_SCHEMA) return false;
  if (typeof d.climberLevel !== "number") return false;
  if (typeof d.settings !== "object" || d.settings === null) return false;
  if (typeof d.progress !== "object" || d.progress === null) return false;
  return true;
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

// ---- 管理器：绑定 KVStore，提供游戏侧 API ----

export class SaveManager {
  data: SaveData;

  constructor(
    private store: KVStore,
    now: string = "",
  ) {
    this.data = parseSave(store.get(SAVE_KEY)) ?? defaultSave(now);
  }

  persist(): void {
    this.store.set(SAVE_KEY, serializeSave(this.data));
  }

  levelProgress(levelId: string): LevelProgress {
    return (this.data.progress[levelId] ??= emptyLevelProgress());
  }

  recordAttempt(levelId: string): void {
    this.levelProgress(levelId).attempts++;
    this.persist();
  }

  /** 完攀结算：滚动保留历史最佳（抓取数/用时各取最优，三星分项并集） */
  recordWin(levelId: string, moves: number, timeMs: number, stars: StarResult): void {
    const p = this.levelProgress(levelId);
    p.wins++;
    if (p.bestMoves === null || moves < p.bestMoves) p.bestMoves = moves;
    if (p.bestTimeMs === null || timeMs < p.bestTimeMs) p.bestTimeMs = timeMs;
    p.stars = mergeStars(p.stars, stars);
    this.persist();
  }

  setCharacter(id: string): void {
    this.data.characterId = id;
    this.persist();
  }

  /** 抓法熟练度 +amount（上限 100），使用即涨 */
  bumpProficiency(grip: string, amount = 1): void {
    const p = (this.data.proficiency ??= {});
    p[grip] = Math.min(100, (p[grip] ?? 0) + amount);
    this.persist();
  }

  proficiencyOf(grip: string): number {
    return this.data.proficiency?.[grip] ?? 0;
  }

  setNickname(n: string): void {
    this.data.nickname = n.trim().slice(0, 12);
    this.persist();
  }

  /** 记录新解锁的成就 id（幂等去重）并落盘 */
  unlockAchievements(ids: string[]): void {
    if (ids.length === 0) return;
    const owned = new Set(this.data.achievements ?? []);
    for (const id of ids) owned.add(id);
    this.data.achievements = [...owned];
    this.persist();
  }

  setClimberLevel(n: number): void {
    this.data.climberLevel = n;
    this.persist();
  }

  setMuted(m: boolean): void {
    this.data.settings.muted = m;
    this.persist();
  }

  /** 测试模式：仅解除 UI 解锁门槛（全角色可选）。不改物理/回放 */
  setTestMode(t: boolean): void {
    this.data.settings.testMode = t;
    this.persist();
  }

  /** 导出为 JSON 文本（备份/迁移设备） */
  export(): string {
    return serializeSave(this.data);
  }

  /** 导入 JSON 文本；非法输入不破坏现有档，返回是否成功 */
  import(json: string): boolean {
    const parsed = parseSave(json);
    if (!parsed) return false;
    this.data = parsed;
    this.persist();
    return true;
  }

  /** 清档（保留在案：设置页"重置进度"用） */
  wipe(now: string = ""): void {
    this.data = defaultSave(now);
    this.store.remove(SAVE_KEY);
  }
}
