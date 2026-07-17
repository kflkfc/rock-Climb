// 游戏场景：固定步长逻辑 + 世界渲染 + HUD + V4 指针交互 + 结算按钮。
// （原 platform-web/main.ts 的游戏循环与 pointer.ts 的交互逻辑收编于此——
//   场景化后微信端可整体复用，壳层只做事件转发。）

import { Scene, PointerEvt, Rect, inRect, drawButton, roundRect, THEME } from "./scene.ts";
import { GameRunner, LOGIC_DT } from "@kkc/core/replay/runner.ts";
import { Replay } from "@kkc/core/replay/format.ts";
import { LEVELS } from "@kkc/core/level/levels.ts";
import { wallAngleAtY } from "@kkc/core/level/levelSchema.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { Camera } from "../render/camera.ts";
import { drawWall } from "../render/drawWall.ts";
import { drawHolds } from "../render/drawHolds.ts";
import { drawReach } from "../render/drawReach.ts";
import { drawCharacter } from "../render/drawCharacter.ts";
import { drawStaminaRings } from "../render/drawStaminaRings.ts";
import { drawGripRing, ringLayout } from "../render/drawGripRing.ts";
import { drawHUD, HudHit } from "../render/drawHUD.ts";
import { updateEffects, drawEffects } from "../render/effects.ts";
import { PoseSmoother } from "../render/poseSmoother.ts";

const MAX_CATCHUP_STEPS = 5;

export class GameScene implements Scene {
  private smoother = new PoseSmoother();
  private hud: HudHit | null = null;
  private acc = 0;
  private lastLevelId: string;
  private pointerActive = false;
  private settleButtons: {
    again: Rect;
    next: Rect;
    back: Rect;
    board: Rect;
    replay: Rect;
  } | null = null;
  private hintFade = 0; // 教学气泡透明度
  private t = 0; // 动效计时
  private confirmingExit = false; // 退出确认弹窗（打开时逻辑暂停、屏蔽其他交互）
  private confirmBtns: { yes: Rect; no: Rect } | null = null;
  private resumeOnEnter = false; // 从回放场景返回：不重开本关（保留结算态）

  constructor(
    private runner: GameRunner,
    private cam: Camera,
    _save: SaveManager, // 存档由壳层经 game 回调写入；保留参数位供后续（结算最佳对比）
    private nav: {
      exit: () => void;
      leaderboard?: (levelId: string, levelName: string) => void;
      replay?: (rep: Replay) => void;
    },
    private entry?: { levelIndex?: number; dailyDate?: string },
  ) {
    this.lastLevelId = this.runner.game.level.id;
  }

  /** 进关：切目标关 → 立即生效 → 重开 tape——回放 = 干净的单关尝试（提交排行榜用） */
  enter() {
    this.confirmingExit = false;
    if (this.resumeOnEnter) {
      // 从回放场景返回：保留现场（结算态/进行中），不重开
      this.resumeOnEnter = false;
      return;
    }
    if (this.entry?.dailyDate) this.runner.dispatch({ e: "daily", date: this.entry.dailyDate });
    else if (this.entry?.levelIndex != null)
      this.runner.dispatch({ e: "level", i: this.entry.levelIndex });
    else this.runner.dispatch({ e: "reset" }); // 无目标=重进当前关，也开新尝试
    this.runner.step(); // 事件立即生效（切关/复位完成）
    this.runner.restartTape(); // tape 起点 = 本关起始状态（含 daily 初始条件快照）
    this.lastLevelId = this.runner.game.level.id;
  }

  private get game() {
    return this.runner.game;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    // 固定步长逻辑（确定性内核约束：逻辑只吃 LOGIC_DT）；退出确认弹窗打开时暂停
    if (this.confirmingExit) {
      this.acc = 0;
    } else {
      this.acc += Math.min(0.25, dt);
      let steps = 0;
      while (this.acc >= LOGIC_DT && steps < MAX_CATCHUP_STEPS) {
        this.runner.step();
        this.acc -= LOGIC_DT;
        steps++;
      }
      if (steps === MAX_CATCHUP_STEPS) this.acc = 0;
    }

    const game = this.game;
    updateEffects(dt);
    if (game.level.id !== this.lastLevelId) {
      this.lastLevelId = game.level.id;
      this.cam.setLevel(game.level);
    }
    const pose = this.smoother.update(game, dt);
    this.cam.follow(pose.com.x, pose.com.y, dt);
    this.cam.followAngle(wallAngleAtY(game.level, pose.com.y), dt);

    ctx.clearRect(0, 0, w, h);
    drawWall(ctx, this.cam, game.level);
    drawHolds(ctx, this.cam, game);
    drawReach(ctx, this.cam, game);
    drawCharacter(ctx, this.cam, pose, game);
    drawStaminaRings(ctx, this.cam, game, pose);
    drawEffects(ctx, this.cam, game);
    drawGripRing(ctx, this.cam, game);
    this.hud = drawHUD(ctx, this.cam, game);

    // 教学引导层：进关未操作时显示 hint 气泡（开始拖拽后淡出）；t1 加脉冲手指
    this.hintFade += (game.started || !game.level.hint ? -3 : 3) * dt;
    this.hintFade = Math.max(0, Math.min(1, this.hintFade));
    if (this.hintFade > 0.01 && game.level.hint) {
      const alpha = this.hintFade;
      const pad = 18;
      const bw2 = Math.min(400, w - 40);
      ctx.save();
      ctx.globalAlpha = alpha;
      // 自动换行
      ctx.font = "600 15px system-ui, sans-serif";
      const chars = game.level.hint.split("");
      const lines: string[] = [];
      let line = "";
      for (const c of chars) {
        if (ctx.measureText(line + c).width > bw2 - pad * 2) {
          lines.push(line);
          line = c;
        } else line += c;
      }
      if (line) lines.push(line);
      const bh2 = lines.length * 22 + pad * 2;
      const bx = w / 2 - bw2 / 2;
      const by = h * 0.62;
      ctx.fillStyle = "rgba(43,57,51,0.92)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw2, bh2, 12);
      ctx.fill();
      ctx.fillStyle = "#F5EBD3";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, by + pad + i * 22));
      // t1：从右手把手到终点的脉冲手指
      if (game.level.id === "t1") {
        this.t += dt;
        const rh = game.c.limbs.RH;
        const from = this.cam.toScreen(rh.hold ? rh.hold.pos : rh.freePos);
        const goal = game.holds.find((hd) => hd.isGoal);
        if (goal) {
          const to = this.cam.toScreen(goal.pos);
          const k = (Math.sin(this.t * 2.4) + 1) / 2; // 0..1 往返
          ctx.font = "34px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("👆", from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + 22);
        }
      }
      ctx.restore();
    }

    // 结算按钮（won 时）：再来一次 / 下一关 / 返回选关
    if (game.status === "won") {
      const bw = 118;
      const bh = 44;
      const y = h / 2 + 58;
      const gap = 12;
      const x0 = w / 2 - (bw * 3 + gap * 2) / 2;
      this.settleButtons = {
        again: { x: x0, y, w: bw, h: bh },
        next: { x: x0 + bw + gap, y, w: bw, h: bh },
        back: { x: x0 + (bw + gap) * 2, y, w: bw, h: bh },
        board: { x: w / 2 - 130, y: y + bh + 12, w: 126, h: 40 },
        replay: { x: w / 2 + 4, y: y + bh + 12, w: 126, h: 40 },
      };
      drawButton(ctx, this.settleButtons.again, "↻ 再来", { color: THEME.green, fontPx: 17 });
      drawButton(ctx, this.settleButtons.next, "下一关 ›", { fontPx: 17 });
      drawButton(ctx, this.settleButtons.back, "选关", { color: THEME.wood, fontPx: 17 });
      drawButton(ctx, this.settleButtons.board, "🏅 排行榜", { color: THEME.dark, fontPx: 14 });
      drawButton(ctx, this.settleButtons.replay, "▶ 回放", { color: THEME.dark, fontPx: 14 });
    } else {
      this.settleButtons = null;
    }

    // 退出确认弹窗（最顶层）：需二次确认才离开本关
    if (this.confirmingExit) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, w, h);
      const cw = Math.min(340, w - 48);
      const chh = 196;
      const card: Rect = { x: w / 2 - cw / 2, y: h / 2 - chh / 2, w: cw, h: chh };
      ctx.fillStyle = THEME.light;
      roundRect(ctx, card, 16);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText("退出本关？", w / 2, card.y + 44);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(79,63,48,0.85)";
      ctx.fillText("本次尝试不保留，确定要退出吗？", w / 2, card.y + 82);
      const bw2 = (cw - 16 * 3) / 2;
      this.confirmBtns = {
        no: { x: card.x + 16, y: card.y + chh - 64, w: bw2, h: 46 },
        yes: { x: card.x + 16 * 2 + bw2, y: card.y + chh - 64, w: bw2, h: 46 },
      };
      drawButton(ctx, this.confirmBtns.no, "继续爬", { color: THEME.green, fontPx: 17 });
      drawButton(ctx, this.confirmBtns.yes, "退出", { color: THEME.accent, fontPx: 17 });
      ctx.textBaseline = "alphabetic";
    } else {
      this.confirmBtns = null;
    }
  }

  onDown(e: PointerEvt) {
    const game = this.game;
    const cam = this.cam;

    // 退出确认弹窗打开时：只响应弹窗按钮
    if (this.confirmingExit) {
      if (this.confirmBtns && inRect(e, this.confirmBtns.yes)) {
        this.confirmingExit = false;
        return this.nav.exit();
      }
      if (this.confirmBtns && inRect(e, this.confirmBtns.no)) this.confirmingExit = false;
      return;
    }

    // 结算按钮（再来/下一关都重开 tape：每次提交都是干净的单关回放）
    if (this.settleButtons) {
      if (inRect(e, this.settleButtons.again)) {
        this.entry = this.entry?.dailyDate ? this.entry : { levelIndex: game.levelIndex };
        return this.enter();
      }
      if (inRect(e, this.settleButtons.next)) {
        this.entry = { levelIndex: (game.levelIndex + 1) % LEVELS.length };
        return this.enter();
      }
      if (inRect(e, this.settleButtons.back)) return this.nav.exit();
      if (inRect(e, this.settleButtons.board))
        return this.nav.leaderboard?.(game.level.id, game.level.name);
      if (inRect(e, this.settleButtons.replay) && this.nav.replay) {
        this.resumeOnEnter = true; // 回放结束返回时保留结算态
        return this.nav.replay(this.runner.exportReplay());
      }
    }

    const hitIcon = (ic?: { x: number; y: number; r: number }) =>
      !!ic && Math.hypot(e.x - ic.x, e.y - ic.y) <= ic.r + 6;

    // HUD：↻ 重置；⤴ 返回选关（非结算态需二次确认）；↶ 回退
    if (this.hud && hitIcon(this.hud.reset)) return this.runner.dispatch({ e: "reset" });
    if (this.hud && hitIcon(this.hud.exit)) {
      if (game.status === "won") return this.nav.exit(); // 已完攀：直接走
      this.confirmingExit = true;
      return;
    }
    if (this.hud && hitIcon(this.hud.undo)) return this.runner.dispatch({ e: "undo" });

    if (game.status === "won" || game.status === "fallen") return;

    if (game.status === "ring" && game.ring) {
      for (const slot of ringLayout(cam, game.ring)) {
        if (Math.hypot(e.x - slot.c.x, e.y - slot.c.y) <= slot.r) {
          this.runner.dispatch({ e: "grip", i: game.ring.options.indexOf(slot.opt) });
          return;
        }
      }
      this.runner.dispatch({ e: "cancelRing" });
      return;
    }

    if (game.status === "climbing") {
      const wpt = cam.toWorld(e.x, e.y);
      this.runner.dispatch({ e: "dragStart", x: wpt.x, y: wpt.y });
      this.pointerActive = true;
    }
  }

  onMove(e: PointerEvt) {
    if (!this.pointerActive) return;
    const wpt = this.cam.toWorld(e.x, e.y);
    this.runner.dispatch({ e: "dragMove", x: wpt.x, y: wpt.y });
  }

  onUp() {
    if (this.pointerActive) {
      this.pointerActive = false;
      this.runner.dispatch({ e: "dragEnd" });
    }
  }
}
