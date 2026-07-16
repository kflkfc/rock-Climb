// 参考序列跟随器：按 LEVEL_SEQS 的 [肢端→岩点] 序列驱动攀爬（全走事件流）。
// 用途：CI 证明关卡"可通关"（AI 试解器 P2 上线前的出厂检验雏形）。

import { GameRunner } from "../../src/replay/runner.ts";
import { Limb, LIMBS } from "../../src/model/skeleton.ts";
import { limbTarget, gripPos } from "../../src/sim/physics.ts";

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
    // 落点：默认岩点中心；若已有其它肢端占着该点（匹配手/脚跟手），
    // 朝占用者反方向错开到岩点半径 70% 处——满足 30% 重叠占位规则。
    let aim = { x: target.pos.x, y: target.pos.y };
    for (const m of LIMBS) {
      if (m === limb) continue;
      const ms = g.c.limbs[m];
      if (!ms.attached || ms.hold?.id !== holdId) continue;
      const gp = gripPos(ms);
      const dx = target.pos.x - gp.x;
      const dy = target.pos.y - gp.y;
      const dl = Math.hypot(dx, dy);
      const ux = dl > 1e-6 ? dx / dl : 1;
      const uy = dl > 1e-6 ? dy / dl : 0;
      // 错开距离：≥ 手手最坏所需 13（= 9+9 − 0.3×18），且不超出接触判定圈
      const offD = Math.min(target.radius * 1.1, Math.max(target.radius * 0.7, 13));
      aim = { x: target.pos.x + ux * offD, y: target.pos.y + uy * offD };
      break;
    }
    const cur = limbTarget(g.c, limb);
    runner.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
    step(2);
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      runner.dispatch({
        e: "dragMove",
        x: cur.x + (aim.x - cur.x) * t,
        y: cur.y + (aim.y - cur.y) * t,
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
