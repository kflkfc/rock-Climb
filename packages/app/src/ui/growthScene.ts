// 成长页：星池 + 等级进度 + 技术树（解锁档位 & 熟练度条）。
// 注：正式"星数驱动等级"在 P7 平衡校准后切换（需 Lv1 全教学馆可解性验证）；
// 本页展示推导等级，实际等级暂由存档/调参滑块控制。

import { Scene, PointerEvt, Rect, inRect, drawTopBar, roundRect, THEME } from "./scene.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import {
  totalStars,
  climberLevelForStars,
  starsToNextLevel,
  LEVEL_STAR_THRESHOLDS,
} from "@kkc/core/progress/growth.ts";
import { GRIP_UNLOCK_LEVEL } from "@kkc/core/progress/techTree.ts";
import { GRIP_LABEL, HAND_GRIPS, FOOT_GRIPS } from "@kkc/core/sim/grip.ts";
import { LEVEL_LABEL } from "@kkc/core/model/body.ts";

export class GrowthScene implements Scene {
  private back: Rect | null = null;

  constructor(private save: SaveManager, private nav: { back: () => void }) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, "成长", true);

    const stars = totalStars(this.save.data);
    const lv = climberLevelForStars(stars);
    const next = starsToNextLevel(stars);

    // 星池大字 + 等级
    ctx.textAlign = "center";
    ctx.fillStyle = THEME.gold;
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(`⭐ ${stars}`, w / 2, 128);
    ctx.fillStyle = THEME.text;
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText(`选手等级 Lv${lv} ${LEVEL_LABEL[lv] ?? ""}`, w / 2, 160);

    // 等级进度条
    const barW = Math.min(360, w - 60);
    const bx = w / 2 - barW / 2;
    const by = 180;
    const prevTh = LEVEL_STAR_THRESHOLDS[lv - 1] ?? 0;
    const nextTh = lv >= 10 ? stars : LEVEL_STAR_THRESHOLDS[lv];
    const frac = lv >= 10 ? 1 : Math.min(1, (stars - prevTh) / Math.max(1, nextTh - prevTh));
    ctx.fillStyle = "rgba(79,63,48,0.18)";
    roundRect(ctx, { x: bx, y: by, w: barW, h: 14 }, 7);
    ctx.fill();
    ctx.fillStyle = THEME.green;
    roundRect(ctx, { x: bx, y: by, w: Math.max(14, barW * frac), h: 14 }, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(79,63,48,0.7)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(next != null ? `距 Lv${lv + 1} 还差 ${next}⭐` : "已满级", w / 2, by + 34);

    // 技术树：两列（手/脚），解锁态 + 熟练度条
    const colW = Math.min(210, (w - 48) / 2);
    const startY = 254;
    const drawCol = (title: string, grips: readonly string[], x0: number) => {
      ctx.textAlign = "left";
      ctx.fillStyle = THEME.dark;
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.fillText(title, x0, startY);
      let y = startY + 26;
      for (const g of grips) {
        const need = GRIP_UNLOCK_LEVEL[g as keyof typeof GRIP_UNLOCK_LEVEL];
        const unlocked = lv >= need;
        const prof = this.save.proficiencyOf(g);
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.fillStyle = unlocked ? THEME.text : "rgba(79,63,48,0.4)";
        ctx.fillText(
          `${unlocked ? "✓" : "🔒"} ${GRIP_LABEL[g as keyof typeof GRIP_LABEL]}${unlocked ? "" : ` (Lv${need})`}`,
          x0,
          y,
        );
        if (unlocked) {
          // 熟练度条（60/90 档标记）
          const pw = colW - 8;
          ctx.fillStyle = "rgba(79,63,48,0.15)";
          roundRect(ctx, { x: x0, y: y + 6, w: pw, h: 7 }, 3);
          ctx.fill();
          ctx.fillStyle = prof >= 90 ? THEME.gold : prof >= 60 ? THEME.green : THEME.wood;
          if (prof > 0) {
            roundRect(ctx, { x: x0, y: y + 6, w: Math.max(4, (pw * prof) / 100), h: 7 }, 3);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(79,63,48,0.55)";
          ctx.font = "10px system-ui, sans-serif";
          ctx.fillText(`${prof}`, x0 + pw - 16, y + 1);
        }
        y += 42;
      }
    };
    const gx = w / 2 - colW - 12;
    drawCol("✋ 手部", HAND_GRIPS, gx);
    drawCol("👟 脚部", FOOT_GRIPS, w / 2 + 12);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(79,63,48,0.5)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("熟练度 使用即涨：≥60 匹配+5% · ≥90 +10%（下次进关生效）", w / 2, h - 20);
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.nav.back();
  }
}
