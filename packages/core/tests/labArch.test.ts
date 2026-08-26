// 实验室诊断线 x2「BOGI」的出厂检验。
// 这条线的存在意义是"极限"：步距顶到伸展上限、墙角一路变、还要下攀。
// 所以断言也围绕这三件事——它们一旦被后续调参悄悄破坏，这里就会红。

import { describe, it, expect } from "vitest";
import { GameRunner } from "../src/replay/runner.ts";
import { LEVELS, LEVEL_SEQS, LAB_LEVEL_IDS } from "../src/level/levels.ts";
import { LAB_ARCH_LEVEL, LAB_ARCH_SEQ } from "../src/level/labArch.ts";
import { HOLD_TYPES } from "../src/sim/holds.ts";
import { wallAngleAtY } from "../src/level/levelSchema.ts";
import { followSeq } from "./helpers/seqFollower.ts";

const IDX = LEVELS.findIndex((l) => l.id === "x2");
const holdOf = (id: string) => LAB_ARCH_LEVEL.holds.find((h) => h.id === id)!;

describe("实验室诊断线 x2 · 结构", () => {
  it("10 种形状全覆盖", () => {
    const used = new Set(LAB_ARCH_LEVEL.holds.map((h) => h.type));
    for (const t of HOLD_TYPES) expect(used.has(t), `缺少形状 ${t}`).toBe(true);
  });

  it("追加在 LEVELS 末尾并归入实验室（不进黄金/出厂检验）", () => {
    expect(IDX).toBeGreaterThan(8);
    expect(LAB_LEVEL_IDS.has("x2")).toBe(true);
    for (let i = 0; i < 9; i++) expect(LEVELS[i].id).toBe(`v${i + 1}`);
  });

  it("五段变墙角：板墙→直壁→仰角→微仰→顶部板墙，首尾相接全覆盖", () => {
    const segs = LAB_ARCH_LEVEL.wallSegments!;
    expect(segs.length).toBe(5);
    expect(segs[0].yBottom).toBe(LAB_ARCH_LEVEL.worldHeight);
    expect(segs[segs.length - 1].yTop).toBe(0);
    for (let i = 1; i < segs.length; i++) expect(segs[i].yBottom).toBe(segs[i - 1].yTop);
    const angles = segs.map((s) => s.angleDeg);
    expect(Math.min(...angles)).toBeLessThan(80); // 有板墙
    expect(Math.max(...angles)).toBeGreaterThan(110); // 有仰角
    expect(new Set(angles).size).toBe(5); // 五段各不相同
  });
});

describe("实验室诊断线 x2 · 上下攀", () => {
  /** 参考序列里每一步落点的 y */
  const ys = LAB_ARCH_SEQ.map(([, id]) => holdOf(id).y);

  it("先上后下：最高点出现在序列中段，之后一路向下", () => {
    const top = ys.indexOf(Math.min(...ys));
    expect(top).toBeGreaterThan(4); // 不是一开头就到顶
    expect(top).toBeLessThan(ys.length - 4); // 到顶之后还有相当长的下攀
    expect(ys[ys.length - 1]).toBeGreaterThan(ys[top] + 400); // 终点比拱顶低 400 以上
  });

  it("确实存在向下移动的步子（不是只靠拱形绕路）", () => {
    let down = 0;
    const at: Record<string, number> = {};
    for (const [limb, id] of LAB_ARCH_SEQ) {
      const y = holdOf(id).y;
      if (at[limb] != null && y > at[limb] + 20) down++;
      at[limb] = y;
    }
    expect(down, "向下移动的步数").toBeGreaterThan(12);
  });

  it("上行与下行经过同一批墙角区间（同一角度用两种身位各过一次）", () => {
    const top = ys.indexOf(Math.min(...ys));
    const angUp = new Set(ys.slice(0, top).map((y) => Math.round(wallAngleAtY(LAB_ARCH_LEVEL, y))));
    const angDown = new Set(ys.slice(top).map((y) => Math.round(wallAngleAtY(LAB_ARCH_LEVEL, y))));
    const shared = [...angUp].filter((a) => angDown.has(a));
    expect(shared.length, "上下行共同经历的墙角档数").toBeGreaterThan(1);
  });
});

describe("实验室诊断线 x2 · 大步距", () => {
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  /** 每颗点到最近邻点的距离——衡量"看上去稀不稀疏" */
  const nearest = LAB_ARCH_LEVEL.holds.map((h) => {
    let m = Infinity;
    for (const o of LAB_ARCH_LEVEL.holds) {
      if (o === h) continue;
      m = Math.min(m, Math.hypot(h.x - o.x, h.y - o.y));
    }
    return m;
  });

  /** 按参考序列，每一步肢端实际要跨过的距离——衡量"够不够得着" */
  const moves = (() => {
    const at: Record<string, { x: number; y: number }> = {};
    for (const h of LAB_ARCH_LEVEL.holds) if (h.start) at[h.start] = h;
    const out: number[] = [];
    for (const [limb, id] of LAB_ARCH_SEQ) {
      const h = holdOf(id);
      if (at[limb]) out.push(Math.hypot(h.x - at[limb].x, h.y - at[limb].y));
      at[limb] = h;
    }
    return out;
  })();

  it("没有挤成一堆的点（拱顶转折处最密，其余更松）", () => {
    expect(Math.min(...nearest)).toBeGreaterThanOrEqual(30);
    expect(med(nearest), "最近邻中位数").toBeGreaterThanOrEqual(50);
  });

  it("每一步都得真的把身体挪过去：移动距离中位数 ≥ 95", () => {
    expect(med(moves)).toBeGreaterThanOrEqual(95);
    expect(Math.min(...moves), "最小一步").toBeGreaterThanOrEqual(30);
  });

  it("步距贴着引擎伸展上限：手的单步没有超过臂展宽容太多", () => {
    // 满级臂展 120 × reachSlack 1.1 = 132；肩根还在上一档手点下方约 25，
    // 所以档距 100 已是直壁上的实际上限——再大就只能靠甩跳。
    expect(Math.max(...moves)).toBeLessThan(260);
  });
});

describe("实验室诊断线 x2 · 可通关性", () => {
  it("Lv6 起按参考序列可通关（几何可达性 + 耐力预算回归）", () => {
    expect(followSeq(new GameRunner(IDX, 6), LEVEL_SEQS.x2)).toBe(true);
  });
});
