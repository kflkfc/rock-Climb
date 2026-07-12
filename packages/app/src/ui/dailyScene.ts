// 每日挑战：日期→种子→全端同关。星数不入星池，连击（streak）由完攀日期推导。

import { Scene, PointerEvt, Rect, inRect, drawButton, drawTopBar, drawWoodCard, drawStars, THEME } from "./scene.ts";
import { generateDaily, STYLE_LABEL } from "@kkc/core/level/generator.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class DailyScene implements Scene {
  private playBtn: Rect | null = null;
  private back: Rect | null = null;
  private today = dateStr(new Date());
  private gen = generateDaily(this.today);

  constructor(
    private save: SaveManager,
    private nav: { back: () => void; play: (date: string) => void },
  ) {}

  /** 连击：从今天（或昨天）起往回数连续完攀天数 */
  private streak(): number {
    let n = 0;
    const d = new Date();
    // 今天没打完从昨天数
    if (!this.save.data.progress[`daily-${dateStr(d)}`]?.stars.topped) d.setDate(d.getDate() - 1);
    while (this.save.data.progress[`daily-${dateStr(d)}`]?.stars.topped) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, "每日挑战", true);

    const cw = Math.min(400, w - 32);
    const r: Rect = { x: w / 2 - cw / 2, y: 100, w: cw, h: 200 };
    drawWoodCard(ctx, r);
    const lv = this.gen.level;
    const p = this.save.data.progress[lv.id];

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(79,63,48,0.75)";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(this.today, r.x + cw / 2, r.y + 34);
    ctx.fillStyle = THEME.text;
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText(`${STYLE_LABEL[this.gen.style]} · ${lv.grade}`, r.x + cw / 2, r.y + 74);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(79,63,48,0.85)";
    ctx.fillText(
      `${lv.holds.length} 个岩点 · 流畅≤${lv.stars?.targetMoves}步 · 神速≤${lv.stars?.targetTimeSec}s`,
      r.x + cw / 2,
      r.y + 104,
    );
    if (p) {
      drawStars(ctx, r.x + cw / 2 - 30, r.y + 132, p.stars, 19);
      ctx.fillStyle = "rgba(79,63,48,0.7)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`今日最佳 ✋${p.bestMoves ?? "-"}`, r.x + cw / 2, r.y + 162);
    } else {
      ctx.fillStyle = "rgba(79,63,48,0.55)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillText("今日未完攀", r.x + cw / 2, r.y + 140);
    }

    // 连击
    const st = this.streak();
    ctx.fillStyle = st > 0 ? THEME.accent : "rgba(79,63,48,0.5)";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText(st > 0 ? `🔥 连续 ${st} 天完攀` : "开始你的连击吧", w / 2, r.y + 244);

    this.playBtn = { x: w / 2 - 130, y: r.y + 280, w: 260, h: 56 };
    drawButton(ctx, this.playBtn, p?.stars.topped ? "▶ 再战今日（刷三星）" : "▶ 出发", { fontPx: 19 });

    ctx.fillStyle = "rgba(79,63,48,0.5)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("每日星数不计入星池 · 全球同一条线（P5 上线每日榜）", w / 2, h - 20);
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.nav.back();
    if (this.playBtn && inRect(e, this.playBtn)) return this.nav.play(this.today);
  }
}
