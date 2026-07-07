// 存档系统 schema 1 + 版本迁移框架（GDD 模块 03/13）。
// 纯逻辑：存储介质经 KVStore 接口注入（Web=localStorage / 微信=wx storage / 测试=内存 Map）。
// 前向约定：schema 只增不改；升 schema 必须在 MIGRATIONS 里补一个迁移函数，旧档永不丢。

export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface LevelProgress {
  /** 最佳抓取数（越少越好）；null = 未完攀过 */
  bestMoves: number | null;
  bestTimeMs: number | null;
  /** 当前简化星级的历史最高（P2 换三星分项后由迁移函数升级此字段） */
  stars: number;
  wins: number;
  attempts: number;
}

export interface SaveV1 {
  schema: 1;
  createdAt: string; // ISO 时间，仅作展示；逻辑不读墙钟
  climberLevel: number; // 选手级别 1-10
  settings: { muted: boolean };
  /** 按关卡 id 记录进度 */
  progress: Record<string, LevelProgress>;
}

export type SaveData = SaveV1; // 最新版别名；升版时改指向

export const SAVE_KEY = "kkc.save";

export function defaultSave(now: string): SaveV1 {
  return {
    schema: 1,
    createdAt: now,
    climberLevel: 5,
    settings: { muted: false },
    progress: {},
  };
}

export function emptyLevelProgress(): LevelProgress {
  return { bestMoves: null, bestTimeMs: null, stars: 0, wins: 0, attempts: 0 };
}

// ---- 迁移框架 ----
// MIGRATIONS[n] 把 schema n 迁到 n+1。加载时从存档的 schema 一路迁到最新。

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  // 示例（P2 上三星分项时）：
  // 1: (raw) => ({ ...raw, schema: 2, progress: convertStarsToTriple(raw.progress) }),
};

export const LATEST_SCHEMA = 1;

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

  /** 完攀结算：滚动保留历史最佳（抓取数/用时/星级各自取最优） */
  recordWin(levelId: string, moves: number, timeMs: number, stars: number): void {
    const p = this.levelProgress(levelId);
    p.wins++;
    if (p.bestMoves === null || moves < p.bestMoves) p.bestMoves = moves;
    if (p.bestTimeMs === null || timeMs < p.bestTimeMs) p.bestTimeMs = timeMs;
    if (stars > p.stars) p.stars = stars;
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
