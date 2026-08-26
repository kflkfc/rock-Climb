// 草稿校验：把"这关做坏了"在摆点当下就说清楚，而不是等试玩才发现。
// 纯函数、不碰 DOM —— 可单测。判据尽量复用引擎与试解器里的同一套常量/公式，
// 避免编辑器说 OK 而引擎不认。

import { LevelDef, HoldDef, SEG_BLEND } from "@kkc/core/level/levelSchema.ts";
import { HOLD_META, makeHold, holdUsableBy, isPocket } from "@kkc/core/sim/holds.ts";
import { Limb, LIMBS, isHand, maxReachOf } from "@kkc/core/model/skeleton.ts";
import { bodyForLevel } from "@kkc/core/model/body.ts";
import { reachSlackOf } from "@kkc/core/sim/physics.ts";
import { limbRadiusOf, discOverlapRatio } from "@kkc/core/sim/contact.ts";
import { tuning } from "@kkc/core/config/tuning.ts";
import { v } from "@kkc/core/math/vec2.ts";

export interface Issue {
  level: "error" | "warn";
  /** 归类标签，方便测试断言与 UI 分组 */
  code: string;
  msg: string;
  /** 相关岩点（UI 点条目可定位高亮） */
  holdId?: string;
}

const dist = (a: HoldDef, b: HoldDef) => Math.hypot(a.x - b.x, a.y - b.y);

/** 校验用的参考体格：满级成人（宽松侧——满级都够不到，谁都够不到） */
function refBody() {
  return bodyForLevel(10);
}

/** 某肢从 a 点能否够到 b 点（保守近似：肢根≈岩点位置，与试解器 feasible 同量级） */
export function reachableBy(a: HoldDef, b: HoldDef, limb: Limb): boolean {
  const body = refBody();
  return dist(a, b) <= maxReachOf(body, limb) * reachSlackOf(body, tuning);
}

/**
 * 两点是否近到"两肢都瞄中心就会被 V1.1 占位规则拒绝"。
 * 用中心距而非"各自贴外缘的最大错开距"：后者在默认调参下几乎永远不触发
 * （最小岩点半径 8 > 脚占位半径 7，贴边总能错开），报出来没有指导意义；
 * 而中心距这一档正是玩家实际会踩的坑——想都抓在点中间，第二只手放不上去。
 */
export function overlapTight(a: HoldDef, b: HoldDef, la: Limb, lb: Limb): boolean {
  return (
    discOverlapRatio(dist(a, b), limbRadiusOf(la, tuning), limbRadiusOf(lb, tuning)) >
    tuning.overlapMax
  );
}

export function validateDraft(level: LevelDef): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, msg: string, holdId?: string) =>
    out.push({ level: "error", code, msg, holdId });
  const warn = (code: string, msg: string, holdId?: string) =>
    out.push({ level: "warn", code, msg, holdId });

  const holds = level.holds ?? [];

  // ---- 1 岩点 id ----
  const seen = new Set<string>();
  for (const h of holds) {
    if (!h.id) err("id-empty", "有岩点 id 为空");
    else if (seen.has(h.id)) err("id-dup", `岩点 id 重复：${h.id}`, h.id);
    else seen.add(h.id);
  }

  // ---- 2 起始肢端 ----
  for (const l of LIMBS) {
    const owners = holds.filter((h) => h.start === l);
    if (owners.length === 0) err("start-missing", `缺起始肢端 ${l}（选中岩点→起始肢）`);
    else if (owners.length > 1)
      err("start-dup", `起始肢端 ${l} 被 ${owners.length} 个点占用`, owners[1].id);
    const o = owners[0];
    // 脚现在哪儿都能踩，只剩"手抓不住脚钉"一条硬限制
    if (o && !holdUsableBy(makeHold(o.id, o.type, v(o.x, o.y)), l))
      err("start-unusable", `${o.id} 是「${HOLD_META[o.type].label}」，${l} 用不了`, o.id);
  }

  // ---- 3 终点 ----
  const goals = holds.filter((h) => h.goal);
  if (goals.length === 0) err("goal-missing", "缺终点（选中岩点→勾选终点）");
  else if (goals.length > 1) err("goal-dup", `终点有 ${goals.length} 个，只能有一个`, goals[1].id);
  if (goals[0]) {
    if (level.goalHoldId !== goals[0].id)
      err("goal-id", `goalHoldId(${level.goalHoldId}) 与终点岩点(${goals[0].id}) 不一致`, goals[0].id);
    if (!HOLD_META[goals[0].type].hands)
      err("goal-hands", `终点是「${HOLD_META[goals[0].type].label}」，手抓不了`, goals[0].id);
  }

  // ---- 4 坐标越界 ----
  for (const h of holds) {
    if (h.x < 0 || h.x > level.worldWidth || h.y < 0 || h.y > level.worldHeight)
      err("out-of-world", `${h.id} 在关卡范围外`, h.id);
  }

  // ---- 5 分段墙 ----
  const segs = level.wallSegments;
  if (segs && segs.length > 0) {
    for (const s of segs) {
      if (s.yTop >= s.yBottom) err("seg-inverted", `分段 ${s.yTop}~${s.yBottom} 上下颠倒`);
      if (s.angleDeg < 40 || s.angleDeg > 180)
        err("seg-angle", `分段角度 ${s.angleDeg}° 超出 40~180`);
    }
    // wallAngleAtY 要求：segs[0] 最底，相邻首尾相接，整体覆盖 [0, worldHeight]
    if (Math.abs(segs[0].yBottom - level.worldHeight) > 1)
      err("seg-bottom", `最底段应止于 y=${level.worldHeight}（现为 ${segs[0].yBottom}）`);
    if (Math.abs(segs[segs.length - 1].yTop) > 1)
      err("seg-top", `最顶段应止于 y=0（现为 ${segs[segs.length - 1].yTop}）`);
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].yBottom > segs[i - 1].yBottom) err("seg-order", "分段必须从底到顶排列");
      if (Math.abs(segs[i].yBottom - segs[i - 1].yTop) > 1)
        err("seg-gap", `第 ${i} 段与上一段之间有缝（${segs[i - 1].yTop} vs ${segs[i].yBottom}）`);
    }
    // 过渡带提醒：岩点离段边界太近时，实际墙角不是标称值
    for (const h of holds) {
      for (let i = 1; i < segs.length; i++) {
        const b = segs[i].yBottom;
        if (Math.abs(h.y - b) < SEG_BLEND)
          warn(
            "seg-blend",
            `${h.id} 距墙角分界 ${Math.round(Math.abs(h.y - b))} < ${SEG_BLEND}，此处实际墙角是过渡值`,
            h.id,
          );
      }
    }
  }

  // ---- 6 可达性 / 7 孤立点 ----
  const body = refBody();
  const slack = reachSlackOf(body, tuning);
  const handR = maxReachOf(body, "LH") * slack;
  const footR = maxReachOf(body, "LF") * slack;
  const maxR = Math.max(handR, footR);
  for (const h of holds) {
    if (h.start) continue; // 起始点天然到位
    const others = holds.filter((o) => o !== h);
    if (!others.some((o) => dist(h, o) <= maxR))
      warn("isolated", `${h.id} 是死点：没有任何点在伸展范围内`, h.id);
    else if (
      !others.some((o) => o.y > h.y && dist(h, o) <= (HOLD_META[h.type].hands ? handR : footR))
    )
      warn("dyno-only", `${h.id} 下方无可达点，只能靠甩跳到达`, h.id);
  }

  // ---- 7.5 指洞独占：洞一次只容一只肢端，孤零零一颗指洞会卡住"手脚同点"的走法 ----
  for (const h of holds) {
    if (!isPocket(h.type)) continue;
    const near = holds.filter((o) => o !== h && dist(h, o) <= maxR);
    if (near.length < 2)
      warn(
        "pocket-solo",
        `${h.id} 是指洞（一次只容一只肢端），周围可选点太少，容易走死`,
        h.id,
      );
  }

  // ---- 8 占位冲突：两点近到双手/双脚放不下 ----
  for (let i = 0; i < holds.length; i++) {
    for (let j = i + 1; j < holds.length; j++) {
      const a = holds[i];
      const b = holds[j];
      if (dist(a, b) > 60) continue; // 远到不可能冲突，跳过（O(n²) 剪枝）
      const pairs: [Limb, Limb][] = [
        ["LH", "RH"],
        ["LF", "RF"],
        ["LH", "LF"],
      ];
      for (const [la, lb] of pairs) {
        // 两点都得对这组肢端可用，否则这组根本不会同时出现（手抓不住脚钉；脚则哪儿都能踩）
        if (isHand(la) && !HOLD_META[a.type].hands) continue;
        if (isHand(lb) && !HOLD_META[b.type].hands) continue;
        if (!overlapTight(a, b, la, lb)) continue;
        const who = isHand(la) && isHand(lb) ? "两只手" : isHand(la) ? "一手一脚" : "两只脚";
        warn("overlap-tight", `${a.id} 与 ${b.id} 太近：${who}同用得刻意错开边缘，别都瞄中心`, b.id);
        break;
      }
    }
  }

  return out;
}

export const errorsOf = (issues: Issue[]) => issues.filter((i) => i.level === "error");
