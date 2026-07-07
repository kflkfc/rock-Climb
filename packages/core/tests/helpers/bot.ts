// 确定性贪心爬墙机器人：目标不是通关，是"确定性地折腾物理"产出回放 tape。
// 决策只读游戏状态（状态由事件决定 → 决策确定）；回放只重演事件，不重跑机器人。
// P2 的 AI 试解器会取代它产出真正的通关回放；P0 阶段它负责黄金测试的输入源。

import { GameRunner } from "../../src/replay/runner.ts";
import { LIMBS } from "../../src/model/skeleton.ts";
import { limbTarget } from "../../src/sim/physics.ts";
import { dhypot } from "../../src/math/dmath.ts";

export function botPlay(runner: GameRunner, rounds: number): void {
  const step = (n: number) => {
    for (let i = 0; i < n; i++) runner.step();
  };
  step(30); // 开局定场

  for (let r = 0; r < rounds; r++) {
    for (const l of LIMBS) {
      const g = runner.game;
      if (g.status === "won") return;
      if (g.status === "fallen") {
        step(90); // 等自动复位
        continue;
      }
      const c = g.c;
      const cur = limbTarget(c, l);
      // 候选：比当前肢端更高（y 更小）且未被其他肢端占用的最近岩点
      const used = new Set(
        LIMBS.filter((x) => x !== l)
          .map((x) => c.limbs[x].hold?.id)
          .filter(Boolean),
      );
      const byDist = (arr: typeof g.holds) =>
        arr.sort(
          (a, b) =>
            dhypot(a.pos.x - cur.x, a.pos.y - cur.y) - dhypot(b.pos.x - cur.x, b.pos.y - cur.y),
        );
      // 优先"更高"的点（向上爬）；没有则取最近的未占用点（屋檐横移/倒挂线）
      let cands = byDist(g.holds.filter((h) => !used.has(h.id) && h.pos.y < cur.y - 4));
      if (cands.length === 0) {
        const own = c.limbs[l].hold?.id;
        cands = byDist(g.holds.filter((h) => !used.has(h.id) && h.id !== own));
      }
      const target = cands[0];
      if (!target) continue;

      // 拖拽手势：抓起把手 → 8 帧线性移向目标 → 松手 → 有抓法环则选首项
      runner.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
      step(2);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        runner.dispatch({
          e: "dragMove",
          x: cur.x + (target.pos.x - cur.x) * t,
          y: cur.y + (target.pos.y - cur.y) * t,
        });
        step(1);
      }
      runner.dispatch({ e: "dragEnd" });
      step(3);
      if (runner.game.status === "ring") {
        runner.dispatch({ e: "grip", i: 0 });
        step(2);
      }
      step(20); // 抓取后稳定
    }
  }
}
