// 主菜单：Logo + 星池状态 + 主导航（Klifur 米黄 + 深绿 + 红按钮气质）。

import { Scene, PointerEvt, Rect, inRect, drawButton, THEME } from "./scene.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { totalStars, climberLevelForStars, starsToNextLevel } from "@kkc/core/progress/growth.ts";
import { LEVEL_LABEL } from "@kkc/core/model/body.ts";

export class MenuScene implements Scene {
  private buttons: { r: Rect; label: string; go?: () => void }[] = [];
  private t = 0;

  constructor(
    private save: SaveManager,
    private nav: { gyms: () => void; character?: () => void; achievements?: () => void; settings?: () => void },
  ) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.t += dt;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    // Logo：标题 + 轻微呼吸浮动
    const bob = Math.sin(this.t * 1.6) * 4;
    ctx.textAlign = "center";
    ctx.fillStyle = THEME.dark;
    ctx.font = `800 ${Math.min(52, w * 0.11)}px system-ui, sans-serif`;
    ctx.fillText("KingKong", w / 2, h * 0.16 + bob);
    ctx.fillText("Climbing", w / 2, h * 0.16 + bob + Math.min(56, w * 0.12));
    ctx.fillStyle = THEME.accent;
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText("金 刚 攀 岩", w / 2, h * 0.16 + bob + Math.min(56, w * 0.12) + 34);

    // 星池 / 等级
    const stars = totalStars(this.save.data);
    const lv = climberLevelForStars(stars);
    const nextNeed = starsToNextLevel(stars);
    ctx.fillStyle = THEME.text;
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(
      `⭐ ${stars} / 98   ·   Lv${lv} ${LEVEL_LABEL[lv] ?? ""}${nextNeed != null ? `（升级还差 ${nextNeed}⭐）` : ""}`,
      w / 2,
      h * 0.42,
    );

    // 导航按钮
    const bw = Math.min(300, w * 0.7);
    const bh = 54;
    const x = w / 2 - bw / 2;
    let y = h * 0.48;
    this.buttons = [];
    const add = (label: string, go?: () => void, color?: string) => {
      const r = { x, y, w: bw, h: bh };
      drawButton(ctx, r, label, { color, disabled: !go });
      this.buttons.push({ r, label, go });
      y += bh + 16;
    };
    add("▶  开始攀爬", this.nav.gyms);
    add("🧍  角色", this.nav.character, THEME.green);
    add("🏆  成就", this.nav.achievements, THEME.wood);
    add("⚙  设置", this.nav.settings, THEME.dark);

    ctx.fillStyle = "rgba(79,63,48,0.45)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("V1.0 开发中 · core 0.5.0", w / 2, h - 18);
  }

  onDown(e: PointerEvt) {
    for (const b of this.buttons) if (b.go && inRect(e, b.r)) return b.go();
  }
}
