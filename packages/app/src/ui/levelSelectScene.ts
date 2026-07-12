// 关卡选择：木牌卡片双列网格 + 纵向滚动。卡片 = 关名/难度/三星分项/个人最佳。

import {
  Scene,
  PointerEvt,
  Rect,
  inRect,
  drawWoodCard,
  drawTopBar,
  drawStars,
  VScroll,
  THEME,
} from "./scene.ts";
import { GymDef } from "@kkc/core/level/gyms.ts";
import { LEVELS } from "@kkc/core/level/levels.ts";
import { LevelDef } from "@kkc/core/level/levelSchema.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class LevelSelectScene implements Scene {
  private cards: { r: Rect; level: LevelDef; index: number }[] = [];
  private back: Rect | null = null;
  private scroll = new VScroll();
  private downAt: PointerEvt | null = null;
  private moved = 0;

  constructor(
    private gym: GymDef,
    private save: SaveManager,
    private nav: { back: () => void; play: (levelIndex: number) => void },
  ) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    const cols = 2;
    const gap = 14;
    const cw = Math.min(210, (w - gap * 3) / cols);
    const ch = 128;
    const gridW = cw * cols + gap;
    const x0 = w / 2 - gridW / 2;
    const top = 84;
    this.scroll.viewH = h - top;

    this.cards = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 6, w, h - top + 6);
    ctx.clip();
    this.gym.levelIds.forEach((id, i) => {
      const index = LEVELS.findIndex((l) => l.id === id);
      if (index < 0) return;
      const level = LEVELS[index];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r: Rect = {
        x: x0 + col * (cw + gap),
        y: top + row * (ch + gap) + this.scroll.offset,
        w: cw,
        h: ch,
      };
      this.cards.push({ r, level, index });
      if (r.y > h || r.y + ch < top - 20) return; // 视口外不画
      drawWoodCard(ctx, r);
      const p = this.save.data.progress[level.id];
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = THEME.text;
      ctx.font = "800 19px system-ui, sans-serif";
      ctx.fillText(level.name, r.x + 14, r.y + 32);
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.fillStyle = THEME.accent;
      ctx.fillText(level.grade, r.x + 14, r.y + 52);
      drawStars(ctx, r.x + 14, r.y + 72, p?.stars, 17);
      ctx.fillStyle = "rgba(79,63,48,0.9)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`✋ ${p?.bestMoves ?? "-"}   ⏱ ${fmtMs(p?.bestTimeMs ?? null)}`, r.x + 14, r.y + 100);
      if (level.stars) {
        ctx.fillStyle = "rgba(79,63,48,0.55)";
        ctx.fillText(`目标 ≤${level.stars.targetMoves}步 ${level.stars.targetTimeSec}s`, r.x + 14, r.y + 116);
      }
    });
    ctx.restore();
    this.scroll.contentH = Math.ceil(this.gym.levelIds.length / cols) * (ch + gap) + 20;

    this.back = drawTopBar(ctx, w, this.gym.name, true);
  }

  onDown(e: PointerEvt) {
    this.downAt = e;
    this.moved = 0;
    this.scroll.down(e.y);
  }
  onMove(e: PointerEvt) {
    this.moved += Math.abs(this.scroll.move(e.y));
  }
  onUp(e: PointerEvt) {
    this.scroll.up();
    if (this.moved > 10 || !this.downAt) return; // 拖动滚动，不算点击
    if (this.back && inRect(e, this.back)) return this.nav.back();
    for (const c of this.cards) if (inRect(e, c.r)) return this.nav.play(c.index);
  }
}
