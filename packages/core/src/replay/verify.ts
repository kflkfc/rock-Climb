// 提交校验（GDD 5.2 反作弊判据）：服务端与测试共享——"重演即校验"。
// 客户端提交 {claim + replay}，服务端用同版本 core 重演：
//   ①schema/版本可接受 ②重演达成完攀 ③claim 与重演一致 ④参数在合法域。
// 任何一条不过 → 拒绝入榜。纯函数：不读钟不读盘（服务器薄壳负责存储/限频）。

import { Replay } from "./format.ts";
import { replayRun } from "./runner.ts";
import { CORE_VERSION } from "../version.ts";
import { LEVELS } from "../level/levels.ts";

/** 服务端接受的 core 版本（滚动保留；旧版本回放用对应旧内核容器重演——部署层职责） */
export const ACCEPTED_CORE_VERSIONS = [CORE_VERSION];

export type RejectReason =
  | "schema"
  | "core_version"
  | "level_unknown"
  | "params_out_of_range"
  | "tape_too_long"
  | "not_won"
  | "claim_mismatch";

export interface VerifyResult {
  ok: boolean;
  reason?: RejectReason;
  /** 校验通过后的权威成绩（以重演为准，非 claim） */
  score?: { levelId: string; moves: number; timeMs: number };
}

const MAX_FRAMES = 60 * 60 * 30; // 30 分钟 tape 上限（防资源攻击）
const MAX_EVENTS = 30000;

export function verifySubmission(replay: Replay): VerifyResult {
  // ① 结构与版本
  if (replay.schema !== 1) return { ok: false, reason: "schema" };
  if (!ACCEPTED_CORE_VERSIONS.includes(replay.coreVersion))
    return { ok: false, reason: "core_version" };
  // ② 关卡与参数域
  const isDaily = !!replay.dailyDate || replay.events.some((e) => e.e === "daily");
  const known = LEVELS.some((l) => l.id === replay.levelId);
  if (!known && !isDaily) return { ok: false, reason: "level_unknown" };
  if (
    replay.climberLevel < 1 ||
    replay.climberLevel > 10 ||
    !Number.isInteger(replay.climberLevel)
  )
    return { ok: false, reason: "params_out_of_range" };
  for (const v of Object.values(replay.proficiency ?? {}))
    if (typeof v !== "number" || v < 0 || v > 100)
      return { ok: false, reason: "params_out_of_range" };
  // ③ 资源上限
  if (replay.frames > MAX_FRAMES || replay.events.length > MAX_EVENTS)
    return { ok: false, reason: "tape_too_long" };
  // ④ 重演（权威）
  const res = replayRun(replay);
  if (res.game.status !== "won") return { ok: false, reason: "not_won" };
  if (!res.claimOk) return { ok: false, reason: "claim_mismatch" };
  return {
    ok: true,
    score: {
      levelId: res.game.level.id, // 以重演终态的关卡为准（含 daily-*）
      moves: res.game.gripCount,
      timeMs: Math.round(res.game.runTime * 1000),
    },
  };
}
