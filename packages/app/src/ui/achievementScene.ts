// 成就列表：31 项滚动列表，已解锁高亮 / 未解锁灰显。

import {
  Scene,
  PointerEvt,
  Rect,
  inRect,
  drawTopBar,
  roundRect,
  VScroll,
  THEME,
} from "./scene.ts";
import { ACHIEVEMENTS } from "@kkc/core/progress/achievements.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";

export class AchievementScene implements Scene {
  private back: Rect | null = null;
  private scroll = new VScroll();
  private moved = 0;

  constructor(private save: SaveManager, private nav: { back: () => void }) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    const owned = new Set(this.save.data.achievements ?? []);
    const cw = Math.min(420, w - 28);
    const ch = 58;
    const x = w / 2 - cw / 2;
    const top = 80;
    this.scroll.viewH = h - top;
    this.scroll.contentH = ACHIEVEMENTS.length * (ch + 10) + 20;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 6, w, h - top + 6);
    ctx.clip();
    ACHIEVEMENTS.forEach((a, i) => {
      const y = top + i * (ch + 10) + this.scroll.offset;
      if (y > h || y + ch < top - 20) return;
      const got = owned.has(a.id);
      ctx.fillStyle = got ? "rgba(95,154,106,0.22)" : "rgba(79,63,48,0.08)";
      roundRect(ctx, { x, y, w: cw, h: ch }, 10);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = "22px system-ui, sans-serif";
      ctx.fillText(got ? "🏆" : "🔒", x + 12, y + 38);
      ctx.fillStyle = got ? THEME.text : "rgba(79,63,48,0.5)";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText(a.name, x + 48, y + 25);
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = got ? "rgba(79,63,48,0.8)" : "rgba(79,63,48,0.4)";
      ctx.fillText(a.desc, x + 48, y + 45);
    });
    ctx.restore();

    this.back = drawTopBar(ctx, w, `成就 ${owned.size}/${ACHIEVEMENTS.length}`, true);
  }

  onDown(e: PointerEvt) {
    this.moved = 0;
    this.scroll.down(e.y);
  }
  onMove(e: PointerEvt) {
    this.moved += Math.abs(this.scroll.move(e.y));
  }
  onUp(e: PointerEvt) {
    this.scroll.up();
    if (this.moved > 10) return;
    if (this.back && inRect(e, this.back)) return this.nav.back();
  }
}
