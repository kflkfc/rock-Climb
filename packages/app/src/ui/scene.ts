// Canvas UI 框架（GDD 4.6）：场景栈 + 控件绘制辅助。
// 铁律：零 DOM——全部经 Canvas 2D 上下文绘制、坐标命中（微信小游戏无 DOM，双端同码）。
// 尺寸约定：逻辑坐标 = 画布像素（调用方处理 DPR）；竖屏 9:16 基准。

export interface PointerEvt {
  x: number; // 画布像素坐标
  y: number;
}

export interface Scene {
  /** 每帧绘制（dt = 真实秒，仅动效用） */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number): void;
  onDown?(e: PointerEvt): void;
  onMove?(e: PointerEvt): void;
  onUp?(e: PointerEvt): void;
  /** 进入/离开钩子（懒加载/暂停逻辑） */
  enter?(): void;
  exit?(): void;
}

/** 场景栈：push/pop/replace + 0.25s 淡入转场 */
export class SceneStack {
  private stack: Scene[] = [];
  private fade = 0; // 1 → 0 淡入
  /** 收到本次 onDown 的场景：onMove/onUp 只回给它——
   *  onDown 里切场景（push/pop）时，防止同一次点击的 onUp 漏给新露出的场景误触。 */
  private downScene: Scene | null = null;

  get top(): Scene | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  push(s: Scene) {
    this.top?.exit?.();
    this.stack.push(s);
    s.enter?.();
    this.fade = 1;
  }

  pop() {
    if (this.stack.length <= 1) return;
    this.stack.pop()?.exit?.();
    this.top?.enter?.();
    this.fade = 1;
  }

  replace(s: Scene) {
    this.stack.pop()?.exit?.();
    this.stack.push(s);
    s.enter?.();
    this.fade = 1;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    this.top?.draw(ctx, w, h, dt);
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt * 4);
      ctx.fillStyle = `rgba(230,217,181,${this.fade})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  onDown(e: PointerEvt) {
    if (this.fade > 0.5) return; // 转场中不接输入
    this.downScene = this.top;
    this.top?.onDown?.(e);
  }
  onMove(e: PointerEvt) {
    if (this.downScene !== this.top) return;
    this.top?.onMove?.(e);
  }
  onUp(e: PointerEvt) {
    const target = this.downScene;
    this.downScene = null;
    if (target !== this.top) return;
    this.top?.onUp?.(e);
  }
}

// ---- Klifur 风格主题 ----
export const THEME = {
  bg: "#E6D9B5",
  dark: "#2B3933",
  accent: "#D64A47",
  gold: "#E5A636",
  green: "#5F9A6A",
  wood: "#9C7B5A",
  woodDark: "#7A5A40",
  text: "#4F3F30",
  light: "#F5EBD3",
};

// ---- 控件绘制/命中辅助（无状态函数式：每帧重画，命中即回调）----

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (e: PointerEvt, r: Rect) =>
  e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, rad: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

/** 主按钮（红底白字，Klifur "开始玩" 风格） */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  opts: { color?: string; fontPx?: number; disabled?: boolean } = {},
) {
  ctx.save();
  ctx.globalAlpha = opts.disabled ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(ctx, { ...r, y: r.y + 3 }, 12);
  ctx.fill();
  ctx.fillStyle = opts.color ?? THEME.accent;
  roundRect(ctx, r, 12);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.font = `700 ${opts.fontPx ?? 20}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.restore();
}

/** 木牌卡片底（关卡/岩馆卡） */
export function drawWoodCard(ctx: CanvasRenderingContext2D, r: Rect, tint?: string) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  roundRect(ctx, { ...r, y: r.y + 4 }, 10);
  ctx.fill();
  ctx.fillStyle = THEME.woodDark;
  roundRect(ctx, r, 10);
  ctx.fill();
  ctx.fillStyle = tint ?? THEME.wood;
  roundRect(ctx, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, 8);
  ctx.fill();
  // 木纹（简单横线）
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 3; i++) {
    const y = r.y + (r.h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(r.x + 10, y);
    ctx.lineTo(r.x + r.w - 10, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 顶栏（深绿）+ 返回按钮，返回其命中区 */
export function drawTopBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  title: string,
  withBack: boolean,
): Rect | null {
  ctx.fillStyle = THEME.dark;
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = THEME.light;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, w / 2, 34);
  if (!withBack) return null;
  const back: Rect = { x: 8, y: 12, w: 64, h: 40 };
  ctx.fillStyle = THEME.light;
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("‹ 返回", back.x + 6, 34);
  return { ...back, w: 90 };
}

/** 简单纵向滚动状态（拖动 + 边界钳制；无惯性——P3 打磨项） */
export class VScroll {
  offset = 0;
  private dragging = false;
  private lastY = 0;
  contentH = 0;
  viewH = 0;

  down(y: number) {
    this.dragging = true;
    this.lastY = y;
  }
  move(y: number): number {
    if (!this.dragging) return 0;
    const dy = y - this.lastY;
    this.lastY = y;
    this.offset = Math.max(Math.min(0, this.viewH - this.contentH), Math.min(0, this.offset + dy));
    return dy;
  }
  up() {
    this.dragging = false;
  }
}

/** 三星显示（分项：金★/灰☆） */
export function drawStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stars: { topped: boolean; flow: boolean; speed: boolean } | undefined,
  px = 16,
) {
  const items = [stars?.topped, stars?.flow, stars?.speed];
  ctx.font = `${px}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  items.forEach((got, i) => {
    ctx.fillStyle = got ? THEME.gold : "rgba(79,63,48,0.3)";
    ctx.fillText(got ? "★" : "☆", x + i * (px + 2), y);
  });
}
