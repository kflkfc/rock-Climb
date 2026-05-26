// 纯逻辑 · 解析法 2-骨 IK（手臂 = 上臂+前臂；腿 = 大腿+小腿）。
// 给定根关节 root、目标 target、两段骨长 l1/l2，解出中间关节 (肘/膝) 位置。
// bendSign 决定弯曲方向（+1 / -1），用于让左右肢、手脚自然反向弯。

import { Vec2, dist, norm, scale, add, sub, clamp } from "./vec2.ts";

export interface IkSolution {
  joint: Vec2; // 肘 / 膝
  end: Vec2; // 实际到达的末端（可能因不可达被夹断）
  reached: boolean; // 目标是否在可达范围内
}

export function solve2Bone(
  root: Vec2,
  target: Vec2,
  l1: number,
  l2: number,
  bendSign: number,
): IkSolution {
  const maxReach = l1 + l2;
  const minReach = Math.abs(l1 - l2);
  let d = dist(root, target);
  const dir = d < 1e-6 ? { x: 1, y: 0 } : norm(sub(target, root));

  let reached = true;
  let endTarget = target;
  if (d > maxReach) {
    // 不可达：伸直指向目标方向，末端夹到最大伸展处
    reached = false;
    d = maxReach;
    endTarget = add(root, scale(dir, maxReach));
  } else if (d < minReach) {
    reached = false;
    d = minReach + 1e-4;
    endTarget = add(root, scale(dir, d));
  }

  // 余弦定理求肘角对应的沿/垂分量
  const a = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  let along = l1 * a;
  let h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // 保底最小弯曲：肘/膝永不完全锁直（否则四肢像僵直木棍）。上臂长保持 l1 不变。
  const hMin = l1 * 0.16; // ≈ 9° 最小弯曲
  if (h < hMin) {
    h = hMin;
    along = Math.sqrt(Math.max(0, l1 * l1 - h * h));
  }
  const perp = { x: -dir.y, y: dir.x }; // 法向
  const joint = add(add(root, scale(dir, along)), scale(perp, h * bendSign));

  return { joint, end: endTarget, reached };
}
