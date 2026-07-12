// 榜单存储：JSON 文件（单机/云托管容器卷都能跑；量级=每关 top100，无需数据库）。
// 写入原子性：先写临时文件再 rename。

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

export interface Entry {
  name: string;
  moves: number;
  timeMs: number;
  at: string; // ISO 提交时间（展示用）
  replayId: string;
}

export interface Board {
  byMoves: Entry[]; // 抓取数榜（升序）
  byTime: Entry[]; // 用时榜（升序）
}

const TOP_N = 100;

export class Store {
  constructor(private dir: string) {
    mkdirSync(join(dir, "boards"), { recursive: true });
    mkdirSync(join(dir, "replays"), { recursive: true });
  }

  private boardPath(levelId: string) {
    // levelId 已由 verify 保证来自 LEVELS 或 daily-YYYY-MM-DD，仍做文件名消毒
    return join(this.dir, "boards", levelId.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
  }

  board(levelId: string): Board {
    const p = this.boardPath(levelId);
    if (!existsSync(p)) return { byMoves: [], byTime: [] };
    try {
      return JSON.parse(readFileSync(p, "utf8")) as Board;
    } catch {
      return { byMoves: [], byTime: [] };
    }
  }

  /** 插入成绩（同名保留更优），返回两榜名次（1-based；未进 topN 为 null） */
  submit(levelId: string, e: Entry): { moveRank: number | null; timeRank: number | null } {
    const b = this.board(levelId);
    const upsert = (list: Entry[], better: (a: Entry, b2: Entry) => boolean): Entry[] => {
      const rest = list.filter((x) => x.name !== e.name || better(e, x));
      if (rest.length !== list.length || !list.some((x) => x.name === e.name)) rest.push(e);
      return rest.sort((a, b2) => (better(a, b2) ? -1 : 1)).slice(0, TOP_N);
    };
    b.byMoves = upsert(b.byMoves, (a, b2) => a.moves < b2.moves || (a.moves === b2.moves && a.timeMs < b2.timeMs));
    b.byTime = upsert(b.byTime, (a, b2) => a.timeMs < b2.timeMs || (a.timeMs === b2.timeMs && a.moves < b2.moves));
    const p = this.boardPath(levelId);
    writeFileSync(p + ".tmp", JSON.stringify(b));
    renameSync(p + ".tmp", p);
    const moveRank = b.byMoves.findIndex((x) => x.replayId === e.replayId);
    const timeRank = b.byTime.findIndex((x) => x.replayId === e.replayId);
    return {
      moveRank: moveRank >= 0 ? moveRank + 1 : null,
      timeRank: timeRank >= 0 ? timeRank + 1 : null,
    };
  }

  saveReplay(id: string, json: string) {
    writeFileSync(join(this.dir, "replays", id + ".json"), json);
  }

  loadReplay(id: string): string | null {
    const p = join(this.dir, "replays", id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
}
