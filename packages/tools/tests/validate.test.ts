import { describe, it, expect } from "vitest";
import { validateDraft, errorsOf } from "../src/editor/validate.ts";
import { blankLevel } from "../src/editor/draft.ts";
import { LevelDef } from "../../core/src/level/levelSchema.ts";

const good = (): LevelDef => blankLevel("t");
const codes = (l: LevelDef) => validateDraft(l).map((i) => i.code);
const errCodes = (l: LevelDef) => errorsOf(validateDraft(l)).map((i) => i.code);

describe("草稿校验 · 干净关卡", () => {
  it("空白模板零 error（新建即可试玩）", () => {
    expect(errorsOf(validateDraft(good()))).toEqual([]);
  });
});

describe("草稿校验 · 起始肢与终点", () => {
  it("缺起始肢端", () => {
    const l = good();
    delete l.holds.find((h) => h.start === "LF")!.start;
    expect(errCodes(l)).toContain("start-missing");
  });

  it("同一肢端被两个点占用", () => {
    const l = good();
    l.holds.push({ id: "x", type: "jug", x: 300, y: 900, start: "LF" });
    expect(errCodes(l)).toContain("start-dup");
  });

  it("起始手放在脚钉上（手抓不住）", () => {
    const l = good();
    l.holds.find((h) => h.start === "LH")!.type = "footchip";
    expect(errCodes(l)).toContain("start-unusable");
  });

  it("起始脚放在指洞上不再报错——脚哪儿都能踩，只是难踩", () => {
    const l = good();
    l.holds.find((h) => h.start === "LF")!.type = "pocket";
    expect(errCodes(l)).not.toContain("start-unusable");
  });

  it("缺终点 / 终点重复 / goalHoldId 不一致", () => {
    const noGoal = good();
    delete noGoal.holds.find((h) => h.goal)!.goal;
    expect(errCodes(noGoal)).toContain("goal-missing");

    const dup = good();
    dup.holds.push({ id: "g2", type: "jug", x: 300, y: 200, goal: true });
    expect(errCodes(dup)).toContain("goal-dup");

    const bad = good();
    bad.goalHoldId = "nope";
    expect(errCodes(bad)).toContain("goal-id");
  });

  it("终点是仅脚类型（脚钉）", () => {
    const l = good();
    l.holds.find((h) => h.goal)!.type = "footchip";
    expect(errCodes(l)).toContain("goal-hands");
  });
});

describe("草稿校验 · id 与坐标", () => {
  it("id 重复 / 为空", () => {
    const dup = good();
    dup.holds.push({ id: "goal", type: "jug", x: 100, y: 500 });
    expect(errCodes(dup)).toContain("id-dup");

    const empty = good();
    empty.holds.push({ id: "", type: "jug", x: 100, y: 500 });
    expect(errCodes(empty)).toContain("id-empty");
  });

  it("岩点跑出关卡范围", () => {
    const l = good();
    l.holds.push({ id: "far", type: "jug", x: 5000, y: 500 });
    expect(errCodes(l)).toContain("out-of-world");
  });
});

describe("草稿校验 · 分段墙", () => {
  const withSegs = (segs: LevelDef["wallSegments"]): LevelDef => ({ ...good(), wallSegments: segs });

  it("合法四段零 error", () => {
    const l = withSegs([
      { yTop: 700, yBottom: 1000, angleDeg: 78 },
      { yTop: 540, yBottom: 700, angleDeg: 92 },
      { yTop: 260, yBottom: 540, angleDeg: 118 },
      { yTop: 0, yBottom: 260, angleDeg: 96 },
    ]);
    expect(errorsOf(validateDraft(l))).toEqual([]);
  });

  it("段间有缝 / 没覆盖到顶 / 角度越界 / 上下颠倒", () => {
    expect(
      errCodes(
        withSegs([
          { yTop: 700, yBottom: 1000, angleDeg: 90 },
          { yTop: 0, yBottom: 650, angleDeg: 90 }, // 650 ≠ 700 → 有缝
        ]),
      ),
    ).toContain("seg-gap");

    expect(
      errCodes(
        withSegs([
          { yTop: 700, yBottom: 1000, angleDeg: 90 },
          { yTop: 300, yBottom: 700, angleDeg: 90 }, // 顶端停在 300
        ]),
      ),
    ).toContain("seg-top");

    expect(errCodes(withSegs([{ yTop: 0, yBottom: 1000, angleDeg: 300 }]))).toContain("seg-angle");
    expect(errCodes(withSegs([{ yTop: 1000, yBottom: 0, angleDeg: 90 }]))).toContain("seg-inverted");
  });

  it("岩点落在过渡带内 → warn（墙角不是标称值）", () => {
    const l = withSegs([
      { yTop: 500, yBottom: 1000, angleDeg: 78 },
      { yTop: 0, yBottom: 500, angleDeg: 120 },
    ]);
    l.holds.push({ id: "near", type: "jug", x: 360, y: 520 }); // 距分界 20 < SEG_BLEND
    expect(codes(l)).toContain("seg-blend");
  });
});

describe("草稿校验 · 几何 warn", () => {
  it("孤立死点：远到没有任何点在伸展范围内", () => {
    const l = good();
    l.holds.push({ id: "lonely", type: "jug", x: 60, y: 60 });
    const iss = validateDraft(l).filter((i) => i.holdId === "lonely");
    expect(iss.map((i) => i.code)).toContain("isolated");
  });

  it("两点几乎重合 → 瞄中心放不下（tight）", () => {
    const l = good();
    const lh = l.holds.find((h) => h.start === "LH")!;
    l.holds.push({ id: "tight", type: "crimp", x: lh.x + 2, y: lh.y + 2 });
    expect(codes(l)).toContain("overlap-tight");
  });

  it("仅脚类型不会报「两只手」冲突（按可用肢端过滤）", () => {
    const l = good();
    l.holds.push({ id: "c1", type: "footchip", x: 200, y: 800 });
    l.holds.push({ id: "c2", type: "footchip", x: 203, y: 800 });
    const msg = validateDraft(l).find((i) => i.code === "overlap-tight")?.msg ?? "";
    expect(msg).toContain("两只脚");
    expect(msg).not.toContain("两只手");
  });

  it("有点在伸展范围内、但下方无可达点 → 只能甩跳", () => {
    const l = good();
    // 手可达 120×1.1=132，脚可达 136×1.1=149.6：距最近点 140 落在两者之间
    l.holds.push({ id: "high", type: "jug", x: 330, y: 590 });
    const iss = validateDraft(l).filter((i) => i.holdId === "high");
    expect(iss.map((i) => i.code)).toContain("dyno-only");
  });
});
