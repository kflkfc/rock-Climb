// 排行榜：某关的双榜（抓取数/用时）。数据经 fetcher 回调注入——app 层零网络依赖。

import { Scene, PointerEvt, Rect, inRect, drawTopBar, roundRect, THEME } from "./scene.ts";

export interface BoardEntry {
  name: string;
  moves: number;
  timeMs: number;
}
export interface BoardData {
  byMoves: BoardEntry[];
  byTime: BoardEntry[];
}
export type BoardFetcher = (levelId: string) => Promise<BoardData>;

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class LeaderboardScene implements Scene {
  private back: Rect | null = null;
  private data: BoardData | null = null;
  private error = false;
  private tab: "byMoves" | "byTime" = "byMoves";
  private tabs: { r: Rect; key: "byMoves" | "byTime" }[] = [];

  constructor(
    levelId: string,
    private levelName: string,
    fetcher: BoardFetcher,
    private nav: { back: () => void },
  ) {
    fetcher(levelId)
      .then((d) => (this.data = d))
      .catch(() => (this.error = true));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, `🏅 ${this.levelName}`, true);

    // 双榜切换 tab
    const tw = 130;
    const ty = 76;
    this.tabs = [];
    (["byMoves", "byTime"] as const).forEach((key, i) => {
      const r: Rect = { x: w / 2 - tw - 8 + i * (tw + 16), y: ty, w: tw, h: 36 };
      ctx.fillStyle = this.tab === key ? THEME.dark : "rgba(79,63,48,0.15)";
      roundRect(ctx, r, 18);
      ctx.fill();
      ctx.fillStyle = this.tab === key ? THEME.light : THEME.text;
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(key === "byMoves" ? "✋ 步数榜" : "⏱ 用时榜", r.x + tw / 2, r.y + 18);
      this.tabs.push({ r, key });
    });

    ctx.textBaseline = "alphabetic";
    if (this.error) {
      ctx.fillStyle = THEME.accent;
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText("服务器暂不可用（离线也能玩，成绩本地保留）", w / 2, h / 2);
      return;
    }
    if (!this.data) {
      ctx.fillStyle = "rgba(79,63,48,0.6)";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText("加载中…", w / 2, h / 2);
      return;
    }
    const list = this.data[this.tab].slice(0, 20);
    if (list.length === 0) {
      ctx.fillStyle = "rgba(79,63,48,0.6)";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText("虚位以待——来当第一个登顶的人", w / 2, h / 2);
      return;
    }
    const rw = Math.min(410, w - 32);
    const x = w / 2 - rw / 2;
    list.forEach((e, i) => {
      const y = 136 + i * 32;
      if (y > h - 20) return;
      ctx.textAlign = "left";
      ctx.fillStyle = i < 3 ? THEME.gold : "rgba(79,63,48,0.7)";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText(`${i + 1}`, x, y);
      ctx.fillStyle = THEME.text;
      ctx.fillText(e.name, x + 34, y);
      ctx.textAlign = "right";
      ctx.fillStyle = THEME.dark;
      ctx.fillText(this.tab === "byMoves" ? `✋ ${e.moves}` : `⏱ ${fmt(e.timeMs)}`, x + rw, y);
    });
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.nav.back();
    for (const t of this.tabs) if (inRect(e, t.r)) this.tab = t.key;
  }
}
