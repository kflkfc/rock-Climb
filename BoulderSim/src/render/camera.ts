// 竖向跟随摄像机：世界坐标 ↔ 屏幕坐标。世界 y 向下，攀爬向上 = y 减小。

import { Vec2, clamp } from "../core/math/vec2.ts";
import { LevelDef } from "../core/level/levelSchema.ts";

export class Camera {
  scale = 1;
  private camY = 0;
  private offX = 0;
  constructor(
    public canvasW: number,
    public canvasH: number,
    private level: LevelDef,
  ) {
    this.resize(canvasW, canvasH);
    this.camY = level.worldHeight - this.viewH() / 2;
  }

  resize(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;
    this.scale = w / this.level.worldWidth;
    this.offX = (w - this.level.worldWidth * this.scale) / 2;
  }

  private viewH() {
    return this.canvasH / this.scale;
  }

  /** 平滑跟随目标世界 y（角色重心），夹在关卡上下边界内 */
  follow(targetY: number, dt: number) {
    const half = this.viewH() / 2;
    const want = clamp(targetY, half, this.level.worldHeight - half);
    this.camY += (want - this.camY) * Math.min(1, dt * 4);
  }

  toScreen(p: Vec2): Vec2 {
    return {
      x: p.x * this.scale + this.offX,
      y: (p.y - this.camY) * this.scale + this.canvasH / 2,
    };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.offX) / this.scale,
      y: (sy - this.canvasH / 2) / this.scale + this.camY,
    };
  }
}
