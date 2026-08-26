import { describe, it, expect } from "vitest";
import { generateLevelTs, constName } from "../src/editor/codegen.ts";
import { blankLevel } from "../src/editor/draft.ts";
import { LevelDef } from "../../core/src/level/levelSchema.ts";
import { Limb } from "../../core/src/model/skeleton.ts";

const rich = (): LevelDef => ({
  ...blankLevel("x9"),
  name: "PRÓF",
  grade: "V5",
  wallSegments: [
    { yTop: 500, yBottom: 1000, angleDeg: 78 },
    { yTop: 0, yBottom: 500, angleDeg: 120 },
  ],
  wallHue: 200,
  hint: "带引号的 \"提示\" 也要转义",
  rules: { maxMovesPerLimb: 2 },
  stars: { targetMoves: 11, targetTimeSec: 80 },
  holds: [
    ...blankLevel("x9").holds,
    { id: "c1", type: "crimp", x: 250, y: 600, radius: 15, pullDirDeg: 180, pullTolDeg: 40, material: "slick", color: "#E07FA8" },
    { id: "v1", type: "volume", x: 420, y: 620, radius: 40 },
    { id: "p1", type: "pocket", x: 430, y: 560, onVolume: "v1" },
  ],
});

describe("关卡代码生成 · 常量名", () => {
  it("id → TS 常量名（数字开头补前缀、连字符转下划线）", () => {
    expect(constName("x1")).toBe("X1");
    expect(constName("my-route")).toBe("MY_ROUTE");
    expect(constName("2b")).toBe("L2B");
  });
});

describe("关卡代码生成 · 结构完整", () => {
  const src = generateLevelTs(rich(), {
    date: "2026-07-31",
    seq: [
      ["LH", "c1"],
      ["RH", "p1"],
      ["LF", "v1"],
      ["RF", "s_rf"],
      ["LH", "goal"],
    ] as [Limb, string][],
  });

  it("头部、import、导出常量齐备", () => {
    expect(src).toContain("// PRÓF · x9（关卡编辑器生成于 2026-07-31）");
    expect(src).toContain(`import { LevelDef } from "./levelSchema.ts";`);
    expect(src).toContain(`import { Limb } from "../model/skeleton.ts";`);
    expect(src).toContain("export const X9_LEVEL: LevelDef = {");
    expect(src).toContain("export const X9_SEQ: [Limb, string][] = [");
  });

  it("每颗岩点都在，全部属性都带出来", () => {
    for (const h of rich().holds) expect(src, h.id).toContain(`id: "${h.id}"`);
    expect(src).toContain(`radius: 15`);
    expect(src).toContain(`pullDirDeg: 180`);
    expect(src).toContain(`pullTolDeg: 40`);
    expect(src).toContain(`material: "slick"`);
    expect(src).toContain(`color: "#E07FA8"`);
    expect(src).toContain(`onVolume: "v1"`);
    expect(src).toContain(`goal: true`);
    expect(src).toContain(`start: "LH"`);
  });

  it("关卡级字段与分段墙都在", () => {
    expect(src).toContain("wallSegments: [");
    expect(src).toContain("{ yTop: 500, yBottom: 1000, angleDeg: 78 },");
    expect(src).toContain("wallHue: 200,");
    expect(src).toContain("rules: { maxMovesPerLimb: 2 },");
    expect(src).toContain("stars: { targetMoves: 11, targetTimeSec: 80 },");
  });

  it("字符串按 JSON 规则转义（引号不会截断代码）", () => {
    expect(src).toContain(String.raw`hint: "带引号的 \"提示\" 也要转义",`);
  });

  it("附带注册清单，并点名 append-only 契约", () => {
    expect(src).toContain("注册清单");
    expect(src).toContain("append-only");
    expect(src).toContain("LEVEL_SEQS");
    expect(src).toContain("CALIBRATED");
    expect(src).toContain("gyms.ts");
  });

  it("缺省字段不写出来（普通材质 / 未设颜色）", () => {
    const plain = generateLevelTs(blankLevel("p"), { date: "2026-07-31" });
    expect(plain).not.toContain("material:");
    expect(plain).not.toContain("color:");
    expect(plain).not.toContain("wallSegments");
    expect(plain).not.toContain("_SEQ"); // 没录序列就不生成序列常量与 Limb import
    expect(plain).not.toContain("skeleton.ts");
  });
});

describe("关卡代码生成 · 语义等价", () => {
  it("生成的字面量能求值回来，且与源 LevelDef 深等价", () => {
    const level = rich();
    const src = generateLevelTs(level, { date: "2026-07-31" });
    // 摘出 `= { … };` 这段对象字面量并求值（不含 import/注释）
    const body = src.slice(src.indexOf("= {") + 2, src.lastIndexOf("};") + 1);
    const back = new Function(`return (${body})`)() as LevelDef;
    // 生成端会省略 undefined 字段，源侧走一次 JSON 往返对齐
    expect(back).toEqual(JSON.parse(JSON.stringify(level)));
  });
});
