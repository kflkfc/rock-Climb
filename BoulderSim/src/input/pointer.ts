// 指针/触屏 → V4 交互：选把手→拖→接触锁定→松手→抓法环→选抓法。
// 同时处理抓法环命中、HUD 重置/退出图标命中、过关/掉落后点击重置。

import { Camera } from "../render/camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { ringLayout } from "../render/drawGripRing.ts";
import { HudHit } from "../render/drawHUD.ts";

export function installPointer(
  canvas: HTMLCanvasElement,
  game: Game,
  cam: Camera,
  getHud: () => HudHit | null,
) {
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

    // HUD 图标（任何状态下重置可用）
    if (hud && hitIcon(sx, sy, hud.reset)) return game.reset();
    if (hud && hitIcon(sx, sy, hud.exit)) return game.reset();

    if (game.status === "won" || game.status === "fallen") return;

    if (game.status === "ring" && game.ring) {
      for (const slot of ringLayout(cam, game.ring)) {
        if (Math.hypot(sx - slot.c.x, sy - slot.c.y) <= slot.r) {
          game.chooseGrip(slot.opt);
          return;
        }
      }
      game.cancelRing();
      return;
    }

    if (game.status === "climbing") {
      const w = cam.toWorld(sx, sy);
      if (game.beginDrag(w)) canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!game.dragging) return;
    e.preventDefault();
    const { sx, sy } = pt(e);
    game.moveDrag(cam.toWorld(sx, sy));
  });

  const up = (e: PointerEvent) => {
    if (game.dragging) {
      e.preventDefault();
      game.endDrag();
    }
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
}
