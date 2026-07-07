// 确定性数学（GDD 模块 25 · 确定性内核）。
//
// 为什么存在：JS 规范只保证 + - * / sqrt 按 IEEE754 正确舍入；
// Math.sin/cos/atan2/pow/hypot/exp/log 的精度是实现自定义的，
// V8(Chrome/Node) 与 JSC(Safari) 可能差 1ulp —— 物理迭代会把它放大成分叉，
// 回放/反作弊/黄金测试全都要求"同输入⇒比特级同结果"，所以 core 一律用本文件。
//
// 实现只用确定性原语（+ - * / sqrt round abs 位运算），系数取自 musl libm，
// 误差 ~1e-9 量级（对像素尺度的物理完全无感），但在所有引擎上比特一致。
// core/src 内禁止直接调用被 shim 的 Math 函数（tests/determinism.test.ts 静态扫描强制）。

const PI = Math.PI;
const HALF_PI = PI / 2;
const LN2 = 0.6931471805599453;

// ---- sin / cos ----
// 象限归约到 |r| ≤ π/4，musl __sin/__cos 内核多项式。

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function sinKernel(r: number): number {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function cosKernel(r: number): number {
  const z = r * r;
  return 1 - z * 0.5 + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** 象限号与余角。游戏角度都在 ±几个 π 内，round 归约精度足够 */
function reduce(x: number): { q: number; r: number } {
  const k = Math.round(x / HALF_PI); // round 是确定性的（规范定义半数进位）
  const r = x - k * HALF_PI;
  return { q: ((k % 4) + 4) % 4, r };
}

export function dsin(x: number): number {
  const { q, r } = reduce(x);
  switch (q) {
    case 0: return sinKernel(r);
    case 1: return cosKernel(r);
    case 2: return -sinKernel(r);
    default: return -cosKernel(r);
  }
}

export function dcos(x: number): number {
  const { q, r } = reduce(x);
  switch (q) {
    case 0: return cosKernel(r);
    case 1: return -sinKernel(r);
    case 2: return -cosKernel(r);
    default: return sinKernel(r);
  }
}

// ---- atan / atan2 ----
// |t| ≤ tan(π/8) < 7/16 上用 musl atan 的 11 系数多项式（该区间误差 <1ulp）。

const TAN_PI_8 = 0.41421356237309503; // tan(π/8) = √2 - 1

const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.11111104054623557880e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.65315727442169155270e-2;
const AT10 = 1.62858201153657823623e-2;

function atanKernel(t: number): number {
  const z = t * t;
  const p =
    AT0 +
    z * (AT1 + z * (AT2 + z * (AT3 + z * (AT4 + z * (AT5 + z * (AT6 + z * (AT7 + z * (AT8 + z * (AT9 + z * AT10)))))))));
  return t - t * z * p;
}

function atanPos(x: number): number {
  // x ≥ 0 → [0, π/2)
  if (x > 1) return HALF_PI - atanPos(1 / x);
  if (x > TAN_PI_8) return PI / 4 + atanKernel((x - 1) / (x + 1));
  return atanKernel(x);
}

export function datan(x: number): number {
  return x < 0 ? -atanPos(-x) : atanPos(x);
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  // x === 0
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0; // atan2(0,0)：与 Math.atan2 对 +0,+0 一致
}

// ---- hypot ----
// 游戏世界坐标 ~1e3 量级，无上溢/下溢风险，直接 sqrt（IEEE 正确舍入 → 确定）。

export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

// ---- exp / log / pow ----
// 通过 DataView 位操作拆装 float64 的指数/尾数（完全确定），多项式算小区间。

const buf = new ArrayBuffer(8);
const view = new DataView(buf);

/** 2^n（n 为整数，|n| < 1023），位构造，无精度损失 */
function pow2(n: number): number {
  view.setUint32(0, ((n + 1023) << 20) >>> 0);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const n = Math.round(x / LN2);
  const r = x - n * LN2; // |r| ≤ ln2/2 ≈ 0.347
  // e^r 泰勒（到 r¹²/12!，该区间误差 < 1e-17）
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 12; i++) {
    term = (term * r) / i;
    sum += term;
  }
  return sum * pow2(n);
}

export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // 拆出指数 e 与尾数 m ∈ [1,2)
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  let e = ((hi >>> 20) & 0x7ff) - 1023;
  let m: number;
  if (e === -1023) {
    // 次正规数：乘 2^54 归一后修正指数（物理里基本遇不到，兜底正确性）
    view.setFloat64(0, x * 18014398509481984);
    const hi2 = view.getUint32(0);
    e = (((hi2 >>> 20) & 0x7ff) - 1023) - 54;
    view.setUint32(0, (hi2 & 0x800fffff) | 0x3ff00000);
    m = view.getFloat64(0);
  } else {
    view.setUint32(0, (hi & 0x800fffff) | 0x3ff00000);
    m = view.getFloat64(0);
  }
  // m 调整到 [√2/2, √2) 使 |t| 更小
  if (m > 1.4142135623730951) {
    m *= 0.5;
    e += 1;
  }
  // ln(m) = 2·artanh(t)，t=(m-1)/(m+1)，|t| ≤ 0.1716 → 奇次级数到 t¹⁵ 误差 <1e-17
  const t = (m - 1) / (m + 1);
  const z = t * t;
  const s =
    2 * t * (1 + z * (1 / 3 + z * (1 / 5 + z * (1 / 7 + z * (1 / 9 + z * (1 / 11 + z * (1 / 13 + z / 15)))))));
  return e * LN2 + s;
}

/** pow：物理里只用正底数（阻尼/惩罚指数）。整数小指数走快路径 */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 3) return x * x * x;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN; // core 不允许负底数非整数幂；触发即暴露 bug
  return dexp(y * dlog(x));
}

// ---- 种子随机（mulberry32）----
// core 内一切随机必须经由 Rng 实例（Math.random 被静态扫描禁止）。

export type Rng = () => number;

/** 返回 [0,1) 均匀分布的确定性随机流；同 seed ⇒ 同序列（跨引擎） */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由任意字符串导出 32 位种子（FNV-1a），用于"日期→每日挑战种子"等 */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
