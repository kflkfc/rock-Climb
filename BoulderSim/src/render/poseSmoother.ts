// 渲染层姿态平滑：核心物理保持瞬时/逻辑正确，显示用的骨盆与四肢末端
// 做帧率无关的指数缓动，再用纯函数 resolvePose 重算 IK。
// 解决"抓住瞬间末端瞬移 / 突然加速 / 关节弹跳"，动作自然顺滑。

import { Vec2, lerp } from "../core/math/vec2.ts";
import { Pose, Limb, LIMBS, resolvePose } from "../core/model/skeleton.ts";
import { Game } from "../core/sim/gameState.ts";
import { limbTarget } from "../core/sim/physics.ts";
import { tuning } from "../config/tuning.ts";

export class PoseSmoother {
  private pelvis: Vec2 | null = null;
  private ends: Record<Limb, Vec2> | null = null;
  private epoch = -1;

  /** 取得本帧用于渲染的平滑姿态 */
  update(game: Game, dt: number): Pose {
    // 目标：won 时跟随回放姿态，否则跟随逻辑状态
    let tgtPelvis: Vec2;
    const tgtEnds = {} as Record<Limb, Vec2>;
    if (game.status === "won") {
      const rp = game.renderPose().pose;
      tgtPelvis = rp.pelvis;
      for (const l of LIMBS) tgtEnds[l] = rp.limb[l].ik.end;
    } else {
      tgtPelvis = game.c.pelvis;
      for (const l of LIMBS) tgtEnds[l] = limbTarget(game.c, l);
    }

    // 首帧 / 重置（epoch 变化）/ 掉落 → 直接吸附，避免滑入或残影
    if (!this.pelvis || !this.ends || this.epoch !== game.resetEpoch) {
      this.epoch = game.resetEpoch;
      this.pelvis = { ...tgtPelvis };
      this.ends = {} as Record<Limb, Vec2>;
      for (const l of LIMBS) this.ends[l] = { ...tgtEnds[l] };
    }

    // 帧率无关指数缓动：alpha = 1 - e^(-dt/tau)
    const aLimb = 1 - Math.exp(-dt / Math.max(0.02, tuning.limbTau));
    const aPelvis = 1 - Math.exp(-dt / Math.max(0.02, tuning.limbTau * 1.4));
    this.pelvis = lerp(this.pelvis, tgtPelvis, aPelvis);
    for (const l of LIMBS) this.ends[l] = lerp(this.ends[l], tgtEnds[l], aLimb);

    return resolvePose(game.c.body, this.pelvis, game.c.lean, this.ends);
  }

  reset() {
    this.pelvis = null;
    this.ends = null;
  }
}
