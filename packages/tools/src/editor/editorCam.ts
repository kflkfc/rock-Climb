// 编辑用相机：自由缩放 + 平移，默认框住整关。
// 只实现 drawWall / drawHolds 用到的鸭子接口（scale / canvasW,H / toScreen / toWorld），
// 传给渲染函数时 as unknown as Camera（本仓先例：editor 的 editStub、app 的 previewFigure）。
// 试玩模式仍用真 Camera，保证试玩视野与真机一致。

import { Vec2 } from "@kkc/core/math/vec2.ts";
import { LevelDef } from "@kkc/core/level/levelSchema.ts";

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;

export class EditorCamera {
  /** 世界→屏幕像素比（渲染层直接读） */
  scale = 1;
  zoom = 1;
  private base = 1; // 框全整关时的比例
  private cx = 0;
  private cy = 0;

  constructor(
    public canvasW: number,
    public canvasH: number,
    private level: LevelDef,
  ) {
    this.fit();
  }

  setLevel(level: LevelDef) {
    this.level = level;
    this.fit();
  }

  resize(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;
    this.recalc();
  }

  /** 框住整关（F 键 / 换关 / 首次打开） */
  fit() {
    this.zoom = 1;
    this.cx = this.level.worldWidth / 2;
    this.cy = this.level.worldHeight / 2;
    this.recalc();
  }

  private recalc() {
    // 留 4% 边距，长短边都装得下
    this.base = Math.min(this.canvasW / this.level.worldWidth, this.canvasH / this.level.worldHeight) * 0.96;
    this.scale = this.base * this.zoom;
  }

  /** 以屏幕点 (sx,sy) 为锚缩放：该点下的世界坐标保持不动（符合直觉的滚轮缩放） */
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
    this.recalc();
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  /** 按屏幕像素平移（拖拽画布） */
  panBy(dxPx: number, dyPx: number) {
    this.cx -= dxPx / this.scale;
    this.cy -= dyPx / this.scale;
  }

  toScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.cx) * this.scale + this.canvasW / 2,
      y: (p.y - this.cy) * this.scale + this.canvasH / 2,
    };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.canvasW / 2) / this.scale + this.cx,
      y: (sy - this.canvasH / 2) / this.scale + this.cy,
    };
  }
}
