// 指针/触屏 → V4 交互事件。
// 确定性约束：不直接调 Game 交互方法，一律 runner.dispatch —— 事件在下个逻辑帧
// 生效并同时录入回放 tape（现场即回放）。这里只做屏幕坐标换算与 UI 命中测试。

import { Camera } from "@kkc/app/render/camera.ts";
import { GameRunner } from "@kkc/core/replay/runner.ts";
import { ringLayout } from "@kkc/app/render/drawGripRing.ts";
import { HudHit } from "@kkc/app/render/drawHUD.ts";
import { LEVELS } from "@kkc/core/level/levels.ts";

export function installPointer(
  canvas: HTMLCanvasElement,
  runner: GameRunner,
  cam: Camera,
  getHud: () => HudHit | null,
) {
  const game = runner.game;
  let pointerActive = false; // UI 侧拖拽状态（事件是权威，这只是本地手势追踪）

  const pt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * canvas.width;
    const sy = ((e.clientY - r.top) / r.height) * canvas.height;
    return { sx, sy };
  };
  const hitIcon = (sx: number, sy: number, ic?: { x: number; y: number; r: number }) =>
    !!ic && Math.hypot(sx - ic.x, sy - ic.y) <= ic.r + 6;

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const { sx, sy } = pt(e);
    const hud = getHud();

    // HUD 图标：↻ 重置当前线路；⤴ 切到下一条线路
    if (hud && hitIcon(sx, sy, hud.reset)) return runner.dispatch({ e: "reset" });
    if (hud && hitIcon(sx, sy, hud.exit))
      return runner.dispatch({ e: "level", i: (game.levelIndex + 1) % LEVELS.length });

    if (game.status === "won" || game.status === "fallen") return;

    if (game.status === "ring" && game.ring) {
      for (const slot of ringLayout(cam, game.ring)) {
        if (Math.hypot(sx - slot.c.x, sy - slot.c.y) <= slot.r) {
          runner.dispatch({ e: "grip", i: game.ring.options.indexOf(slot.opt) });
          return;
        }
      }
      runner.dispatch({ e: "cancelRing" });
      return;
    }

    if (game.status === "climbing") {
      const w = cam.toWorld(sx, sy);
      runner.dispatch({ e: "dragStart", x: w.x, y: w.y });
      pointerActive = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerActive) return;
    e.preventDefault();
    const { sx, sy } = pt(e);
    const w = cam.toWorld(sx, sy);
    runner.dispatch({ e: "dragMove", x: w.x, y: w.y });
  });

  const up = (e: PointerEvent) => {
    if (pointerActive) {
      e.preventDefault();
      pointerActive = false;
      runner.dispatch({ e: "dragEnd" });
    }
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
}
