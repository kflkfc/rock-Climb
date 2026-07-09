// 摄像机：世界坐标 ↔ 屏幕坐标。固定缩放(可视宽度恒定→角色大小不变)，
// 横向 + 纵向都跟随角色重心，墙可比屏幕更宽并横向滚动。

import { Vec2, clamp } from "@kkc/core/math/vec2.ts";
import { LevelDef } from "@kkc/core/level/levelSchema.ts";

const VIEW_W = 500; // 屏幕横向可见的世界宽度（越大可见墙面越宽、角色越小）

const TILT_K = 0.3; // 墙角→视角倾斜比例（1=完全跟随会晕；0=关闭）

export class Camera {
  scale = 1;
  private camX = 0;
  private camY = 0;
  /** 当前显示旋转（弧度，绕屏幕中心）：过角时缓动 1-2s 而非瞬切 */
  private rot = 0;
  constructor(
    public canvasW: number,
    public canvasH: number,
    private level: LevelDef,
  ) {
    this.resize(canvasW, canvasH);
    this.camX = level.worldWidth / 2;
    this.camY = level.worldHeight - this.viewH() / 2;
  }

  setLevel(level: LevelDef) {
    this.level = level;
    this.resize(this.canvasW, this.canvasH);
    this.camX = clamp(level.worldWidth / 2, this.halfW(), level.worldWidth - this.halfW());
    this.camY = level.worldHeight - this.viewH() / 2;
  }

  resize(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;
    // 可视宽度取 min(关卡宽, VIEW_W)：窄关卡完整居中，宽关卡固定缩放并横向滚动
    const viewW = Math.min(this.level.worldWidth, VIEW_W);
    this.scale = w / viewW;
  }

  private viewW() {
    return this.canvasW / this.scale;
  }
  private viewH() {
    return this.canvasH / this.scale;
  }
  private halfW() {
    return this.viewW() / 2;
  }

  /** 平滑跟随重心（横+纵），夹在关卡边界内 */
  follow(targetX: number, targetY: number, dt: number) {
    const k = Math.min(1, dt * 4);
    const hw = this.halfW();
    const hh = this.viewH() / 2;
    const wantX = clamp(targetX, hw, Math.max(hw, this.level.worldWidth - hw));
    const wantY = clamp(targetY, hh, Math.max(hh, this.level.worldHeight - hh));
    this.camX += (wantX - this.camX) * k;
    this.camY += (wantY - this.camY) * k;
  }

  /** 过角缓动：视角向墙角方向轻微倾斜（部分跟随，~1s 到位），暗示"墙变陡了" */
  followAngle(wallAngleDeg: number, dt: number) {
    const target = (-(wallAngleDeg - 90) * Math.PI * TILT_K) / 180;
    this.rot += (target - this.rot) * Math.min(1, dt * 1.6);
  }

  toScreen(p: Vec2): Vec2 {
    const dx = (p.x - this.camX) * this.scale;
    const dy = (p.y - this.camY) * this.scale;
    const cos = Math.cos(this.rot);
    const sin = Math.sin(this.rot);
    return {
      x: dx * cos - dy * sin + this.canvasW / 2,
      y: dx * sin + dy * cos + this.canvasH / 2,
    };
  }

  toWorld(sx: number, sy: number): Vec2 {
    const dx = sx - this.canvasW / 2;
    const dy = sy - this.canvasH / 2;
    const cos = Math.cos(-this.rot);
    const sin = Math.sin(-this.rot);
    return {
      x: (dx * cos - dy * sin) / this.scale + this.camX,
      y: (dx * sin + dy * cos) / this.scale + this.camY,
    };
  }
}
