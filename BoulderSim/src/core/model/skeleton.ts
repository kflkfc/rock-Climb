// 纯逻辑 · 11 段骨骼姿态解算。
// 11 段 = 头 + 颈 + 躯干 + 上臂×2 + 前臂×2 + 大腿×2 + 小腿×2。
// 输入：骨盆位置 pelvis + 身体倾斜 lean(rad，跟随墙角) + 4 肢端目标。
// 关节约束（对齐设计文档）：伸展极限 手≤臂长 / 脚≤腿长（reached=false 即超限）。

import { Vec2, add, sub, scale, rotate, norm, dot } from "../math/vec2.ts";
import { solve2Bone, IkSolution } from "../math/ik.ts";
import { BodyParams, armReach, legReach } from "./body.ts";

export type Limb = "LH" | "RH" | "LF" | "RF";
export const LIMBS: Limb[] = ["LH", "RH", "LF", "RF"];
export const isHand = (l: Limb) => l === "LH" || l === "RH";
export const isFoot = (l: Limb) => l === "LF" || l === "RF";

export interface Pose {
  pelvis: Vec2;
  hipL: Vec2;
  hipR: Vec2;
  shoulderC: Vec2;
  shoulderL: Vec2;
  shoulderR: Vec2;
  neck: Vec2;
  head: Vec2;
  /** 每个肢端的根关节（肩/髋）、中间关节（肘/膝）、末端、是否在伸展范围内 */
  limb: Record<Limb, { root: Vec2; ik: IkSolution }>;
  /** 重心近似：骨盆 + 躯干中点的加权点 */
  com: Vec2;
}

/**
 * 身体朝向：
 *  - lean：脊柱倾斜（偏身），左右倾会横移肩与重心 → 驱动方向性受力对齐。
 *  - shoulderTwist：肩线绕脊柱旋转（躯干面向双手 / 扭身）。
 *  - hipTwist：髋线绕脊柱旋转（偏身 / 熏膝 / 倒钩）。
 * 三者独立 → 身体不再直上直下像蜘蛛。
 */
export interface Orientation {
  lean: number;
  shoulderTwist: number;
  hipTwist: number;
}

const UP: Vec2 = { x: 0, y: -1 }; // 屏幕坐标 y 向下，攀爬向上 = -y

export function maxReachOf(b: BodyParams, l: Limb): number {
  return l === "LH" || l === "RH" ? armReach(b) : legReach(b);
}

/**
 * 解算姿态。targets: 各肢端末端世界坐标（被抓住的肢端=岩点位置；自由肢端=把手当前位置）。
 * ori: 身体朝向（脊柱倾斜 + 肩/髋独立旋转）。
 */
export function resolvePose(
  b: BodyParams,
  pelvis: Vec2,
  ori: Orientation,
  targets: Record<Limb, Vec2>,
): Pose {
  const up = rotate(UP, ori.lean); // 脊柱方向（偏身）
  const right = { x: -up.y, y: up.x }; // 基准右方向
  const shoulderRight = rotate(right, ori.shoulderTwist); // 肩线（可绕脊柱扭转）
  const hipRight = rotate(right, ori.hipTwist); // 髋线（可独立扭转）

  const hipL = add(pelvis, scale(hipRight, -b.hipWidth / 2));
  const hipR = add(pelvis, scale(hipRight, b.hipWidth / 2));
  const shoulderC = add(pelvis, scale(up, b.torsoLen));
  const shoulderL = add(shoulderC, scale(shoulderRight, -b.shoulderWidth / 2));
  const shoulderR = add(shoulderC, scale(shoulderRight, b.shoulderWidth / 2));
  const neck = add(shoulderC, scale(up, b.neckLen));
  const head = add(neck, scale(up, b.headR));

  // 解剖学正确的弯曲方向：肘"向下且外"，膝"向外为主、略向下"（攀岩蛙形）。
  // 由目标相对根关节的弦方向动态选 bendSign，杜绝反关节，且随姿态连续变化。
  const down = scale(up, -1);
  const out = (sign: number) => norm(add(down, scale(right, sign))); // 肘期望侧
  const knee = (sign: number) => norm(add(scale(right, sign * 1), scale(down, 0.35))); // 膝期望侧
  const bend = (root: Vec2, target: Vec2, want: Vec2): number => {
    const d = norm(sub(target, root));
    const perp = { x: -d.y, y: d.x }; // 与 ik.ts 内 perp 一致
    return dot(perp, want) >= 0 ? 1 : -1;
  };
  const limb = {
    LH: {
      root: shoulderL,
      ik: solve2Bone(shoulderL, targets.LH, b.upperArm, b.foreArm,
        bend(shoulderL, targets.LH, out(-0.6))),
    },
    RH: {
      root: shoulderR,
      ik: solve2Bone(shoulderR, targets.RH, b.upperArm, b.foreArm,
        bend(shoulderR, targets.RH, out(0.6))),
    },
    LF: {
      root: hipL,
      ik: solve2Bone(hipL, targets.LF, b.thigh, b.shank,
        bend(hipL, targets.LF, knee(-1))),
    },
    RF: {
      root: hipR,
      ik: solve2Bone(hipR, targets.RF, b.thigh, b.shank,
        bend(hipR, targets.RF, knee(1))),
    },
  } as Pose["limb"];

  const com = { x: (pelvis.x + shoulderC.x) / 2, y: (pelvis.y + shoulderC.y) / 2 };

  return { pelvis, hipL, hipR, shoulderC, shoulderL, shoulderR, neck, head, limb, com };
}

export { armReach, legReach };
