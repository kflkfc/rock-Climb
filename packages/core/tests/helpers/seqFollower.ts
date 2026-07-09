// 参考序列跟随器：按 LEVEL_SEQS 的 [肢端→岩点] 序列驱动攀爬（全走事件流）。
// 用途：CI 证明关卡"可通关"（AI 试解器 P2 上线前的出厂检验雏形）。

import { GameRunner } from "../../src/replay/runner.ts";
import { Limb } from "../../src/model/skeleton.ts";
import { limbTarget } from "../../src/sim/physics.ts";

export function followSeq(runner: GameRunner, seq: [Limb, string][]): boolean {
  const step = (n: number) => {
    for (let i = 0; i < n; i++) runner.step();
  };
  step(40); // 定场
  for (const [limb, holdId] of seq) {
    const g = runner.game;
    if (g.status === "won") return true;
    if (g.status === "fallen") return false;
    const target = g.holds.find((h) => h.id === holdId);
    if (!target) return false;
    const cur = limbTarget(g.c, limb);
    runner.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
    step(2);
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
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
      runner.dispatch({ e: "grip", i: 0 }); // 最高匹配
      step(2);
    }
    step(25); // 抓取后稳定
  }
  step(60);
  return runner.game.status === "won";
}
