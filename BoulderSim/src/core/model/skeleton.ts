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

// 各肢端在身体坐标系里的"期望弯曲侧"方向。
// 肘向下且略外；膝主要朝下(自然屈膝)、仅略偏外 —— 避免悬挂时双腿撇成青蛙。
function bendWant(l: Limb, up: Vec2, right: Vec2): Vec2 {
  const down = scale(up, -1);
  if (l === "LH") return norm(add(down, scale(right, -0.6)));
  if (l === "RH") return norm(add(down, scale(right, 0.6)));
  if (l === "LF") return norm(add(scale(down, 1), scale(right, -0.35)));
  return norm(add(scale(down, 1), scale(right, 0.35)));
}

/**
 * 计算各肢端"期望弯曲方向符号"(±1)，由根→末端弦的法向与期望侧点积决定。
 * 物理层据此把连续 bend 值平滑缓动到目标符号 → 关节换侧平滑、不突变。
 */
export function desiredBend(
  b: BodyParams,
  pelvis: Vec2,
  ori: Orientation,
  targets: Record<Limb, Vec2>,
): Record<Limb, number> {
  const up = rotate(UP, ori.lean);
  const right = { x: -up.y, y: up.x };
  const roots = limbRoots(b, pelvis, ori, up, right);
  const sgn = (root: Vec2, target: Vec2, want: Vec2): number => {
    const d = norm(sub(target, root));
    const perp = { x: -d.y, y: d.x };
    return dot(perp, want) >= 0 ? 1 : -1;
  };
  const out = {} as Record<Limb, number>;
  for (const l of LIMBS) out[l] = sgn(roots[l], targets[l], bendWant(l, up, right));
  return out;
}

function limbRoots(b: BodyParams, pelvis: Vec2, ori: Orientation, up: Vec2, right: Vec2) {
  const shoulderRight = rotate(right, ori.shoulderTwist);
  const hipRight = rotate(right, ori.hipTwist);
  const shoulderC = add(pelvis, scale(up, b.torsoLen));
  return {
    LH: add(shoulderC, scale(shoulderRight, -b.shoulderWidth / 2)),
    RH: add(shoulderC, scale(shoulderRight, b.shoulderWidth / 2)),
    LF: add(pelvis, scale(hipRight, -b.hipWidth / 2)),
    RF: add(pelvis, scale(hipRight, b.hipWidth / 2)),
  } as Record<Limb, Vec2>;
}

/**
 * 解算姿态。targets: 各肢端末端世界坐标（被抓住的肢端=岩点位置；自由肢端=把手当前位置）。
 * ori: 身体朝向（脊柱倾斜 + 肩/髋独立旋转；lean 可大角度乃至倒挂）。
 * bend: 各肢端连续弯曲量 ∈[-1,1]（物理层逐帧缓动，保证关节平滑换侧）。
 */
export function resolvePose(
  b: BodyParams,
  pelvis: Vec2,
  ori: Orientation,
  targets: Record<Limb, Vec2>,
  bend: Record<Limb, number>,
): Pose {
  const up = rotate(UP, ori.lean); // 脊柱方向（可大幅倾斜/倒置）
  const right = { x: -up.y, y: up.x };
  const shoulderRight = rotate(right, ori.shoulderTwist);
  const hipRight = rotate(right, ori.hipTwist);

  const hipL = add(pelvis, scale(hipRight, -b.hipWidth / 2));
  const hipR = add(pelvis, scale(hipRight, b.hipWidth / 2));
  const shoulderC = add(pelvis, scale(up, b.torsoLen));
  const shoulderL = add(shoulderC, scale(shoulderRight, -b.shoulderWidth / 2));
  const shoulderR = add(shoulderC, scale(shoulderRight, b.shoulderWidth / 2));
  const neck = add(shoulderC, scale(up, b.neckLen));
  const head = add(neck, scale(up, b.headR));

  const limb = {
    LH: { root: shoulderL, ik: solve2Bone(shoulderL, targets.LH, b.upperArm, b.foreArm, bend.LH) },
    RH: { root: shoulderR, ik: solve2Bone(shoulderR, targets.RH, b.upperArm, b.foreArm, bend.RH) },
    LF: { root: hipL, ik: solve2Bone(hipL, targets.LF, b.thigh, b.shank, bend.LF) },
    RF: { root: hipR, ik: solve2Bone(hipR, targets.RF, b.thigh, b.shank, bend.RF) },
  } as Pose["limb"];

  const com = { x: (pelvis.x + shoulderC.x) / 2, y: (pelvis.y + shoulderC.y) / 2 };

  return { pelvis, hipL, hipR, shoulderC, shoulderL, shoulderR, neck, head, limb, com };
}

export { armReach, legReach };
