// 角色选择：阵容纵列卡（定位/体格摘要/解锁态），点击切换（走 chara 回放事件）。

import { Scene, PointerEvt, Rect, inRect, drawWoodCard, drawTopBar, THEME } from "./scene.ts";
import { CHARACTERS, CharacterDef } from "@kkc/core/model/characters.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { totalStars, characterUnlocked } from "@kkc/core/progress/growth.ts";
import { GameRunner } from "@kkc/core/replay/runner.ts";

export class CharacterScene implements Scene {
  private cards: { r: Rect; ch: CharacterDef; unlocked: boolean }[] = [];
  private back: Rect | null = null;

  constructor(
    private save: SaveManager,
    private runner: GameRunner,
    private nav: { back: () => void },
  ) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, "选择角色", true);

    const stars = totalStars(this.save.data);
    const testMode = !!this.save.data.settings.testMode;
    const current = this.runner.game.characterId;
    const cw = Math.min(420, w - 32);
    const ch = 128;
    const x = w / 2 - cw / 2;
    let y = 80;
    this.cards = [];
    for (const c of CHARACTERS) {
      const starUnlocked = characterUnlocked(c, stars);
      const unlocked = starUnlocked || testMode; // 测试模式：全角色可选
      const r = { x, y, w: cw, h: ch };
      drawWoodCard(ctx, r, current === c.id ? "#B8965F" : undefined);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = unlocked ? 1 : 0.55;
      ctx.fillStyle = THEME.text;
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText(c.name + (current === c.id ? "（当前）" : ""), r.x + 20, r.y + 36);
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "rgba(79,63,48,0.9)";
      ctx.fillText(c.tagline, r.x + 20, r.y + 60);
      const p = c.physique;
      ctx.fillText(
        `身高×${p.height}  臂展×${p.apeIndex}  体重${p.weight}  柔韧${Math.round(p.flexibility * 100)}%`,
        r.x + 20,
        r.y + 82,
      );
      ctx.globalAlpha = 1;
      ctx.font = "700 14px system-ui, sans-serif";
      if (!unlocked) {
        ctx.fillStyle = THEME.accent;
        ctx.fillText(`🔒 需 ${c.unlock!.stars}⭐（当前 ${stars}⭐）`, r.x + 20, r.y + 108);
      } else if (!starUnlocked) {
        // 测试模式解锁：提示这是本该锁着的角色
        ctx.fillStyle = THEME.green;
        ctx.fillText(`🧪 测试模式解锁（正式需 ${c.unlock!.stars}⭐）`, r.x + 20, r.y + 108);
      } else if (c.abilityBias) {
        ctx.fillStyle = THEME.green;
        ctx.fillText("✦ 种族天赋已激活", r.x + 20, r.y + 108);
      }
      this.cards.push({ r, ch: c, unlocked });
      y += ch + 14;
    }
    ctx.fillStyle = "rgba(79,63,48,0.5)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("切换角色会重开当前线路（体格不同，解法不同）", w / 2, y + 8);
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.nav.back();
    for (const c of this.cards) {
      if (inRect(e, c.r) && c.unlocked) {
        this.runner.dispatch({ e: "chara", id: c.ch.id }); // 走回放事件
        this.save.setCharacter(c.ch.id);
        return this.nav.back();
      }
    }
  }
}
