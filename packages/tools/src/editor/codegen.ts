// 草稿 → 正式关卡 TS 源码。打通"编辑器里做完 → 进 packages/core/src/level/"最后一公里。
// 纯字符串生成，不碰 DOM —— 可单测。
//
// 手写风格而非 JSON.stringify：每颗岩点一行、键序固定、省略缺省字段，
// 生成出来的文件和 levels.ts / labRoute.ts 里手写的读起来一样。

import { LevelDef, HoldDef, WallSegment } from "@kkc/core/level/levelSchema.ts";
import { Limb } from "@kkc/core/model/skeleton.ts";

/** 关卡 id → TS 常量名前缀：x1 → X1，my-route → MY_ROUTE，2b → L2B */
export function constName(id: string): string {
  const s = id.replace(/[^0-9a-zA-Z]+/g, "_").toUpperCase();
  return /^[0-9]/.test(s) ? "L" + s : s || "DRAFT";
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const str = (s: string) => JSON.stringify(s);

/** 一颗岩点一行，键序固定，缺省字段不写 */
function holdLine(h: HoldDef): string {
  const kv: string[] = [`id: ${str(h.id)}`, `type: ${str(h.type)}`, `x: ${num(h.x)}`, `y: ${num(h.y)}`];
  if (h.radius != null) kv.push(`radius: ${num(h.radius)}`);
  if (h.pullDirDeg != null) kv.push(`pullDirDeg: ${num(h.pullDirDeg)}`);
  if (h.pullTolDeg != null) kv.push(`pullTolDeg: ${num(h.pullTolDeg)}`);
  if (h.material && h.material !== "normal") kv.push(`material: ${str(h.material)}`);
  if (h.color) kv.push(`color: ${str(h.color)}`);
  if (h.onVolume) kv.push(`onVolume: ${str(h.onVolume)}`);
  if (h.goal) kv.push(`goal: true`);
  if (h.start) kv.push(`start: ${str(h.start)}`);
  return `    { ${kv.join(", ")} },`;
}

const segLine = (s: WallSegment) =>
  `    { yTop: ${num(s.yTop)}, yBottom: ${num(s.yBottom)}, angleDeg: ${num(s.angleDeg)} },`;

export interface CodegenOpts {
  /** 生成日期（默认今天；单测传固定值） */
  date?: string;
  /** 试玩录制的参考序列 */
  seq?: [Limb, string][];
}

/** 产出可直接落到 packages/core/src/level/<id>.ts 的整份源码 */
export function generateLevelTs(level: LevelDef, opts: CodegenOpts = {}): string {
  const C = constName(level.id);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const seq = opts.seq ?? [];

  const L: string[] = [];
  L.push(`// ${level.name} · ${level.id}（关卡编辑器生成于 ${date}）`);
  L.push(`// 注册步骤见文件末尾。`);
  L.push(``);
  L.push(`import { LevelDef } from "./levelSchema.ts";`);
  if (seq.length) L.push(`import { Limb } from "../model/skeleton.ts";`);
  L.push(``);
  L.push(`export const ${C}_LEVEL: LevelDef = {`);
  L.push(`  id: ${str(level.id)},`);
  L.push(`  name: ${str(level.name)},`);
  L.push(`  grade: ${str(level.grade)},`);
  L.push(`  wallAngleDeg: ${num(level.wallAngleDeg)},`);
  if (level.wallAngleTop != null) L.push(`  wallAngleTop: ${num(level.wallAngleTop)},`);
  if (level.wallSegments?.length) {
    L.push(`  wallSegments: [`);
    for (const s of level.wallSegments) L.push(segLine(s));
    L.push(`  ],`);
  }
  L.push(`  worldWidth: ${num(level.worldWidth)},`);
  L.push(`  worldHeight: ${num(level.worldHeight)},`);
  if (level.wallHue != null) L.push(`  wallHue: ${num(level.wallHue)},`);
  L.push(`  goalHoldId: ${str(level.goalHoldId)},`);
  L.push(`  starThreshold: ${num(level.starThreshold)},`);
  if (level.stars)
    L.push(
      `  stars: { targetMoves: ${num(level.stars.targetMoves)}, targetTimeSec: ${num(level.stars.targetTimeSec)} },`,
    );
  if (level.rules?.maxMovesPerLimb != null)
    L.push(`  rules: { maxMovesPerLimb: ${num(level.rules.maxMovesPerLimb)} },`);
  if (level.hint) L.push(`  hint: ${str(level.hint)},`);
  L.push(`  holds: [`);
  for (const h of level.holds) L.push(holdLine(h));
  L.push(`  ],`);
  L.push(`};`);

  if (seq.length) {
    L.push(``);
    L.push(`/** 参考攀爬序列（编辑器试玩录制）：CI followSeq 出厂检验用 */`);
    L.push(`export const ${C}_SEQ: [Limb, string][] = [`);
    // 每行 4 组，长线路不至于刷屏
    for (let i = 0; i < seq.length; i += 4) {
      const row = seq.slice(i, i + 4).map(([l, id]) => `[${str(l)}, ${str(id)}]`);
      L.push(`  ${row.join(", ")},`);
    }
    L.push(`];`);
  }

  L.push(``);
  L.push(`/* ── 注册清单（照做即可接入正式内容）──`);
  L.push(` * 1. levels.ts 顶部：import { ${C}_LEVEL${seq.length ? `, ${C}_SEQ` : ""} } from "./${level.id}.ts";`);
  L.push(` * 2. levels.ts 的 LEVELS 数组【尾部追加】 ${C}_LEVEL`);
  L.push(` *    ⚠ append-only 契约：黄金回放按 levelIndex 引用，绝不可插在中间或重排`);
  if (seq.length) L.push(` * 3. levels.ts 的 LEVEL_SEQS 加一行：${level.id}: ${C}_SEQ,`);
  L.push(
    ` * ${seq.length ? 4 : 3}. levels.ts 的 CALIBRATED 加一行：${level.id}: { targetMoves: ${level.stars?.targetMoves ?? "?"}, targetTimeSec: ${level.stars?.targetTimeSec ?? "?"} },`,
  );
  L.push(` * ${seq.length ? 5 : 4}. gyms.ts：把 ${str(level.id)} 加进某个岩馆的 levelIds`);
  L.push(` * ${seq.length ? 6 : 5}. 录黄金回放：GOLDEN_RECORD=1 npx vitest run golden`);
  L.push(` *    （若只是内部诊断线，改为加进 levels.ts 的 LAB_LEVEL_IDS 跳过黄金与出厂检验）`);
  L.push(` */`);
  L.push(``);
  return L.join("\n");
}
