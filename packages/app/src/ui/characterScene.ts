// 角色选择（V1.2 三轮改版）：顶部大预览动图（当前点选角色的待机小人 + 使用按钮）
// + 下方可滚动阵容卡列表（点卡片 = 切换预览，未解锁也可先看）。

import {
  Scene,
  PointerEvt,
  Rect,
  inRect,
  drawWoodCard,
  drawTopBar,
  drawButton,
  THEME,
  VScroll,
} from "./scene.ts";
import { CHARACTERS, CharacterDef, characterById } from "@kkc/core/model/characters.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { totalStars, characterUnlocked } from "@kkc/core/progress/growth.ts";
import { GameRunner } from "@kkc/core/replay/runner.ts";
import { drawPreviewFigure } from "../render/previewFigure.ts";

export class CharacterScene implements Scene {
  private cards: { r: Rect; ch: CharacterDef; unlocked: boolean }[] = [];
  private back: Rect | null = null;
  private applyBtn: Rect | null = null;
  private applyEnabled = false;
  private selectedId: string;
  private t = 0; // 待机动画钟
  private scroll = new VScroll();
  private listTop = 0;
  private moved = 0; // 本次按下累计滚动量（>10 不算点击）

  constructor(
    private save: SaveManager,
    private runner: GameRunner,
    private nav: { back: () => void },
  ) {
    this.selectedId = runner.game.characterId;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.t += dt;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    const stars = totalStars(this.save.data);
    const testMode = !!this.save.data.settings.testMode;
    const current = this.runner.game.characterId;
    const sel = characterById(this.selectedId);
    const selUnlocked = characterUnlocked(sel, stars) || testMode;

    // ---- 顶部大预览面板：动图小人 + 使用按钮 ----
    const pw = Math.min(420, w - 32);
    const px = w / 2 - pw / 2;
    const panel: Rect = { x: px, y: 72, w: pw, h: 268 };
    drawWoodCard(ctx, panel);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = THEME.light;
    ctx.font = "800 20px system-ui, sans-serif";
    ctx.fillText(sel.name, panel.x + 18, panel.y + 34);
    drawPreviewFigure(ctx, panel.x + pw / 2, panel.y + 198, 154, sel.id, this.t);
    this.applyBtn = { x: panel.x + pw / 2 - 110, y: panel.y + panel.h - 52, w: 220, h: 40 };
    if (sel.id === current) {
      this.applyEnabled = false;
      drawButton(ctx, this.applyBtn, "✔ 当前使用中", { color: THEME.green, fontPx: 15, disabled: true });
    } else if (!selUnlocked) {
      this.applyEnabled = false;
      drawButton(ctx, this.applyBtn, `🔒 需 ${sel.unlock!.stars}⭐（当前 ${stars}⭐）`, {
        color: THEME.accent,
        fontPx: 14,
        disabled: true,
      });
    } else {
      this.applyEnabled = true;
      drawButton(ctx, this.applyBtn, "✔ 使用该角色", { color: THEME.green, fontPx: 15 });
    }
    ctx.fillStyle = "rgba(79,63,48,0.5)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("切换角色会重开当前线路（体格不同，解法不同）", w / 2, panel.y + panel.h + 18);

    // ---- 阵容卡列表（可滚动） ----
    this.listTop = panel.y + panel.h + 30;
    this.scroll.viewH = h - this.listTop;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.listTop, w, h - this.listTop);
    ctx.clip();
    const cw = pw;
    const chh = 136;
    let y = this.listTop + 4 + this.scroll.offset;
    this.cards = [];
    for (const c of CHARACTERS) {
      const starUnlocked = characterUnlocked(c, stars);
      const unlocked = starUnlocked || testMode; // 测试模式：全角色可用
      const r = { x: px, y, w: cw, h: chh };
      this.cards.push({ r, ch: c, unlocked });
      y += chh + 14;
      if (r.y + chh < this.listTop || r.y > h) continue; // 视口外跳过绘制
      drawWoodCard(ctx, r, c.id === this.selectedId ? "#B8965F" : undefined);
      ctx.textAlign = "left";
      ctx.globalAlpha = unlocked ? 1 : 0.55;
      ctx.fillStyle = THEME.text;
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText(c.name + (current === c.id ? "（当前）" : ""), r.x + 20, r.y + 34);
      ctx.font = "15px system-ui, sans-serif";
      ctx.fillStyle = "rgba(79,63,48,0.9)";
      ctx.fillText(c.tagline, r.x + 20, r.y + 61);
      const p = c.physique;
      ctx.fillText(
        `身高×${p.height}  臂展×${p.apeIndex}  体重${p.weight}  柔韧${Math.round(p.flexibility * 100)}%`,
        r.x + 20,
        r.y + 86,
      );
      ctx.globalAlpha = 1;
      ctx.font = "700 16px system-ui, sans-serif";
      if (!unlocked) {
        ctx.fillStyle = THEME.accent;
        ctx.fillText(`🔒 需 ${c.unlock!.stars}⭐（当前 ${stars}⭐）`, r.x + 20, r.y + 116);
      } else if (!starUnlocked) {
        // 测试模式解锁：提示这是本该锁着的角色
        ctx.fillStyle = THEME.green;
        ctx.fillText(`🧪 测试模式解锁（正式需 ${c.unlock!.stars}⭐）`, r.x + 20, r.y + 116);
      } else if (c.abilityBias) {
        ctx.fillStyle = THEME.green;
        ctx.fillText("✦ 种族天赋已激活", r.x + 20, r.y + 116);
      }
    }
    this.scroll.contentH = CHARACTERS.length * (chh + 14) + 8;
    ctx.restore();

    this.back = drawTopBar(ctx, w, "选择角色", true);
  }

  onDown(e: PointerEvt) {
    this.moved = 0;
    if (e.y >= this.listTop) this.scroll.down(e.y);
  }

  onMove(e: PointerEvt) {
    this.moved += Math.abs(this.scroll.move(e.y));
  }

  onUp(e: PointerEvt) {
    this.scroll.up();
    if (this.back && inRect(e, this.back)) return this.nav.back();
    if (this.applyBtn && inRect(e, this.applyBtn) && this.applyEnabled) {
      this.runner.dispatch({ e: "chara", id: this.selectedId }); // 走回放事件
      this.save.setCharacter(this.selectedId);
      return this.nav.back();
    }
    if (this.moved > 10) return; // 拖动滚列表不算点选
    for (const c of this.cards) {
      if (inRect(e, c.r) && e.y >= this.listTop) {
        this.selectedId = c.ch.id; // 仅切换预览；应用走上方按钮
        return;
      }
    }
  }
}
