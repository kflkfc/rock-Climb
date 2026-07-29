// 黄金回放测试集（GDD 3.3 第 6 条）：每条官方关卡一份回放 + 期望终态哈希。
// 任何物理/数值改动若使重演结果漂移，此测试立即翻红 —— 防止手感被悄悄改坏。
//
// 重录（有意改物理后）：  GOLDEN_RECORD=1 npx vitest run golden
// 重录即宣告"物理行为变更"，必须升 CORE_VERSION 并在 commit 里说明。
//
// P0 阶段的 tape 由确定性机器人生成（不保证通关，保证充分折腾物理）；
// P2 起由 AI 试解器替换为真正的通关回放（同时验证关卡可解性）。

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVELS, OFFICIAL_LEVELS, LAB_LEVEL_IDS } from "../src/level/levels.ts";
import { GameRunner, replayRun } from "../src/replay/runner.ts";
import { Replay } from "../src/replay/format.ts";
import { CORE_VERSION } from "../src/version.ts";
import { botPlay } from "./helpers/bot.ts";

const GOLDEN_DIR = fileURLToPath(new URL("./golden", import.meta.url));
const RECORD = !!process.env.GOLDEN_RECORD;

interface GoldenFile {
  coreVersion: string;
  hash: string;
  replay: Replay;
}

describe(`黄金回放 · ${OFFICIAL_LEVELS.length} 关（core v${CORE_VERSION}）`, () => {
  LEVELS.forEach((level, i) => {
    // 实验室诊断线不入黄金（理由见 levels.ts 的 LAB_LEVEL_IDS）；索引 i 仍取自 LEVELS
    if (LAB_LEVEL_IDS.has(level.id)) return;
    it(`${level.id} (${level.name}) 重演哈希一致`, () => {
      const file = join(GOLDEN_DIR, `${level.id}.json`);

      if (RECORD) {
        const runner = new GameRunner(i);
        botPlay(runner, 4);
        const golden: GoldenFile = {
          coreVersion: CORE_VERSION,
          hash: runner.hash(),
          replay: runner.exportReplay(),
        };
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(golden));
        // 录制后立即自校验：重演必须复现刚录的哈希
        expect(replayRun(golden.replay).hash).toBe(golden.hash);
        return;
      }

      expect(
        existsSync(file),
        `缺少黄金回放 ${level.id}.json —— 运行 GOLDEN_RECORD=1 npx vitest run golden 生成`,
      ).toBe(true);
      const golden: GoldenFile = JSON.parse(readFileSync(file, "utf8"));
      expect(
        golden.coreVersion,
        "黄金回放的 core 版本与当前不符——若有意改动物理请重录并升版本",
      ).toBe(CORE_VERSION);
      const res = replayRun(golden.replay);
      expect(res.hash, "终态哈希漂移：物理/数值行为被改动了").toBe(golden.hash);
      expect(res.claimOk).toBe(true);
    });
  });
});
