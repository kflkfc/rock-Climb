// 星级定标核对（手动跑：npx vitest run calibrate）。
// 不是回归断言，而是**报表**：把 AI 试解器现在给出的建议值与 levels.ts 里
// 写死的 CALIBRATED 并排打出来，物理改动后据此决定要不要改表。
// 只有"目标步数比最优解还少 → ★2 根本拿不到"才算硬错误，会让本测试失败。

import { describe, it, expect } from "vitest";
import { solveLevel } from "../src/solver/solver.ts";
import { OFFICIAL_LEVELS } from "../src/level/levels.ts";

describe("星级定标 · 与试解器建议值对照", () => {
  it("现行目标步数不得低于 AI 最优解（否则流畅星不可能拿到）", () => {
    const rows: string[] = [];
    const broken: string[] = [];
    for (const lv of OFFICIAL_LEVELS) {
      const r = solveLevel(lv, { climberLevel: 10 });
      const cur = lv.stars!;
      const suggest = r.targets;
      const flag = !r.solvable ? "不可解" : cur.targetMoves < r.minMoves ? "★2 拿不到" : "";
      rows.push(
        `${lv.id.padEnd(4)} 最优${String(r.minMoves).padStart(3)}  ` +
          `现行 ${String(cur.targetMoves).padStart(3)}步/${String(cur.targetTimeSec).padStart(4)}s  ` +
          `建议 ${String(suggest.targetMoves).padStart(3)}步/${String(suggest.targetTimeSec).padStart(4)}s  ${flag}`,
      );
      if (flag) broken.push(`${lv.id}: ${flag}（最优 ${r.minMoves} / 现行 ${cur.targetMoves}）`);
    }
    console.log("\n" + rows.join("\n") + "\n");
    expect(broken, broken.join("; ")).toEqual([]);
  });
});
