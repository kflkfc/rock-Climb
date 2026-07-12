// 岩馆选择：四馆纵列木牌卡（名称/简介/登顶进度/星数）。

import { Scene, PointerEvt, Rect, inRect, drawWoodCard, drawTopBar, THEME } from "./scene.ts";
import { GYMS, GymDef } from "@kkc/core/level/gyms.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { starCount } from "@kkc/core/progress/stars.ts";

export class GymScene implements Scene {
  private cards: { r: Rect; gym: GymDef }[] = [];
  private back: Rect | null = null;

  constructor(
    private save: SaveManager,
    private nav: { back: () => void; levels: (gym: GymDef) => void },
  ) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, "选择岩馆", true);

    const cw = Math.min(420, w - 32);
    const ch = 120;
    const x = w / 2 - cw / 2;
    let y = 84;
    this.cards = [];
    for (const gym of GYMS) {
      const r = { x, y, w: cw, h: ch };
      drawWoodCard(ctx, r, gym.tint);
      // 进度统计
      let topped = 0;
      let stars = 0;
      for (const id of gym.levelIds) {
        const p = this.save.data.progress[id];
        if (p?.stars.topped) topped++;
        if (p) stars += starCount(p.stars);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = THEME.text;
      ctx.font = "800 24px system-ui, sans-serif";
      ctx.fillText(gym.name, r.x + 20, r.y + 40);
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(79,63,48,0.85)";
      ctx.fillText(gym.desc, r.x + 20, r.y + 66);
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillStyle = THEME.dark;
      ctx.fillText(`登顶 ${topped}/${gym.levelIds.length}`, r.x + 20, r.y + 96);
      ctx.fillStyle = THEME.gold;
      ctx.textAlign = "right";
      ctx.fillText(`⭐ ${stars}/${gym.levelIds.length * 3}`, r.x + cw - 20, r.y + 96);
      this.cards.push({ r, gym });
      y += ch + 16;
    }
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.nav.back();
    for (const c of this.cards) if (inRect(e, c.r)) return this.nav.levels(c.gym);
  }
}
