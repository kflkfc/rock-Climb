// 设置页：音效开关 / 存档导入导出（回调交壳层——Web 用 prompt，微信换 wx API）/ 重置进度。

import { Scene, PointerEvt, Rect, inRect, drawButton, drawTopBar, THEME } from "./scene.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";

export interface SettingsHooks {
  back: () => void;
  setMuted: (m: boolean) => void; // 壳层接 audio
  exportSave: () => void;
  importSave: () => void;
  wipeSave: () => void;
}

export class SettingsScene implements Scene {
  private buttons: { r: Rect; act: () => void; label: () => string; color?: string }[] = [];
  private back: Rect | null = null;
  private confirmWipe = false;

  constructor(private save: SaveManager, private hooks: SettingsHooks) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);
    this.back = drawTopBar(ctx, w, "设置", true);

    const bw = Math.min(320, w * 0.75);
    const bh = 52;
    const x = w / 2 - bw / 2;
    let y = 110;
    this.buttons = [];
    const add = (label: () => string, act: () => void, color?: string) => {
      const r = { x, y, w: bw, h: bh };
      drawButton(ctx, r, label(), { color: color ?? THEME.dark, fontPx: 17 });
      this.buttons.push({ r, act, label, color });
      y += bh + 16;
    };
    add(
      () => (this.save.data.settings.muted ? "🔇 音效已关（点击开启）" : "🔊 音效已开（点击关闭）"),
      () => {
        const m = !this.save.data.settings.muted;
        this.save.setMuted(m);
        this.hooks.setMuted(m);
      },
      THEME.green,
    );
    add(() => "📤 导出存档（备份）", this.hooks.exportSave, THEME.wood);
    add(() => "📥 导入存档", this.hooks.importSave, THEME.wood);
    add(
      () => (this.confirmWipe ? "⚠ 再点一次确认清空全部进度" : "🗑 重置全部进度"),
      () => {
        if (!this.confirmWipe) {
          this.confirmWipe = true;
          return;
        }
        this.hooks.wipeSave();
        this.confirmWipe = false;
      },
      this.confirmWipe ? THEME.accent : undefined,
    );

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(79,63,48,0.5)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("物理调参面板：右上角 ⚙（开发工具，正式版隐藏）", w / 2, h - 20);
  }

  onDown(e: PointerEvt) {
    if (this.back && inRect(e, this.back)) return this.hooks.back();
    let hitAny = false;
    for (const b of this.buttons)
      if (inRect(e, b.r)) {
        b.act();
        hitAny = true;
      }
    if (!hitAny) this.confirmWipe = false; // 点空白取消确认
  }
}
