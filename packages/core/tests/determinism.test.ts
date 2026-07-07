import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dsin,
  dcos,
  datan,
  datan2,
  dhypot,
  dexp,
  dlog,
  dpow,
  makeRng,
  hashSeed,
} from "../src/math/dmath.ts";

// 精度基线：确定性实现与原生 Math 的偏差必须小到对玩法无感。
// （跨引擎位一致性由黄金回放在 Node/Chrome/Safari 三端重演验证——见 P0-7）

describe("dmath · 三角", () => {
  it("dsin/dcos 与 Math 偏差 < 1e-9（±4π 全程扫描）", () => {
    for (let x = -4 * Math.PI; x <= 4 * Math.PI; x += 0.0037) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-9);
    }
  });
  it("特殊值", () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(dsin(Math.PI / 2)).toBeCloseTo(1, 12);
  });
  it("datan2 与 Math.atan2 偏差 < 1e-8（四象限网格）", () => {
    for (let y = -5; y <= 5; y += 0.173) {
      for (let x = -5; x <= 5; x += 0.173) {
        if (x === 0 && y === 0) continue;
        expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-8);
      }
    }
  });
  it("datan2 轴向与零点约定", () => {
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 12);
    expect(datan2(0, 0)).toBe(0);
    expect(Math.abs(datan(0.99999) - Math.atan(0.99999))).toBeLessThan(1e-9);
  });
});

describe("dmath · exp/log/pow/hypot", () => {
  it("dexp 相对误差 < 1e-12", () => {
    for (let x = -20; x <= 20; x += 0.317) {
      const rel = Math.abs(dexp(x) - Math.exp(x)) / Math.exp(x);
      expect(rel).toBeLessThan(1e-12);
    }
  });
  it("dlog 误差 < 1e-12", () => {
    for (let x = 1e-6; x <= 1e6; x *= 1.7) {
      expect(Math.abs(dlog(x) - Math.log(x))).toBeLessThan(1e-12);
    }
  });
  it("dpow 相对误差 < 1e-11（物理常用域：正底数）", () => {
    for (let x = 0.01; x <= 3; x += 0.083) {
      for (let y = -3; y <= 3; y += 0.29) {
        const ref = Math.pow(x, y);
        expect(Math.abs(dpow(x, y) - ref) / ref).toBeLessThan(1e-11);
      }
    }
  });
  it("dpow 快路径与边界", () => {
    expect(dpow(0.82, 1)).toBe(0.82); // 固定步长下阻尼 pow(x, dt*60)=pow(x,1) 走精确路径
    expect(dpow(5, 0)).toBe(1);
    expect(dpow(3, 2)).toBe(9);
    expect(dpow(0, 2)).toBe(0);
  });
  it("dhypot 与 Math.hypot 偏差 < 1e-9（游戏坐标量级）", () => {
    for (let x = -2000; x <= 2000; x += 173.3) {
      for (let y = -2000; y <= 2000; y += 173.3) {
        expect(Math.abs(dhypot(x, y) - Math.hypot(x, y))).toBeLessThan(1e-9);
      }
    }
  });
});

describe("dmath · 种子随机", () => {
  it("同 seed 同序列", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it("mulberry32 已知序列锚点（防实现被无意改动）", () => {
    const r = makeRng(1);
    // 这些值是 mulberry32(seed=1) 的标准输出；改动实现会立即在此翻车
    const first = r();
    const second = r();
    expect(first).toBeCloseTo(0.6270739405881613, 15);
    expect(second).toBeCloseTo(0.002735721180215478, 15);
  });
  it("值域 [0,1) 且分布不退化", () => {
    const r = makeRng(42);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeGreaterThan(0.45);
    expect(sum / 10000).toBeLessThan(0.55);
  });
  it("hashSeed 稳定且不同输入不同种子", () => {
    expect(hashSeed("2026-07-07")).toBe(hashSeed("2026-07-07"));
    expect(hashSeed("2026-07-07")).not.toBe(hashSeed("2026-07-08"));
  });
});

// ---- 静态扫描：core/src 禁用非确定性 Math 函数与 Math.random ----
// 作用等同 lint 规则，但零依赖直接跑在测试里（CI 卡口）。

const BANNED =
  /\bMath\.(random|sin|cos|tan|asin|acos|atan2?|pow|exp|expm1|log|log2|log10|log1p|hypot|cbrt|sinh|cosh|tanh|asinh|acosh|atanh)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("确定性静态扫描", () => {
  it("core/src 内除 dmath.ts 外不得出现被禁 Math 函数", () => {
    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    const offenders: string[] = [];
    for (const file of walk(srcDir)) {
      if (file.replace(/\\/g, "/").endsWith("math/dmath.ts")) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line: string, i: number) => {
        if (BANNED.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `发现非确定性 Math 调用：\n${offenders.join("\n")}`).toEqual([]);
  });
});
