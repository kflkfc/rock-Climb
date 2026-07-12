// 轻量音效（WebAudio 合成，无外部素材）+ 触感振动反馈。
// 对齐 PRD Demo 范围："脱手、抓住、过关都要有轻微触感音效（也可配合振动 API）"。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function vibrate(p: number | number[]) {
  if (!muted && typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(p);
    } catch {
      /* 不支持则忽略 */
    }
  }
}

/** 单音：freq Hz，dur 秒，波形，起始音量（带衰减包络） */
function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// ---- 程序化 lo-fi BGM（零素材零包体）：五声音阶琶音 + 缓慢和弦轮换 ----
let bgmTimer: number | null = null;
let bgmStep = 0;
// C 五声（C D E G A）两组八度的琶音序列；每 8 步换和弦根音
const BGM_SCALE = [261.6, 293.7, 329.6, 392.0, 440.0];
const BGM_PATTERN = [0, 2, 4, 2, 1, 3, 4, 3]; // 音阶索引序列
const BGM_ROOTS = [1, 0.75, 0.84, 0.667]; // 根音倍率（C/G/A/F 感）

function bgmTick() {
  if (muted) return;
  const c = ac();
  if (!c || !master) return;
  const bar = Math.floor(bgmStep / 8) % BGM_ROOTS.length;
  const idx = BGM_PATTERN[bgmStep % 8];
  const freq = BGM_SCALE[idx] * BGM_ROOTS[bar] * (bgmStep % 16 >= 8 ? 2 : 1);
  tone(freq, 0.9, "sine", 0.045); // 极轻，垫底氛围
  if (bgmStep % 8 === 0) tone(BGM_SCALE[0] * BGM_ROOTS[bar] * 0.5, 1.8, "triangle", 0.03); // 低音垫
  bgmStep++;
}

export const sfx = {
  /** 浏览器自动播放策略：需在用户手势内创建/恢复 AudioContext */
  unlock() {
    ac();
    if (bgmTimer == null) bgmTimer = window.setInterval(bgmTick, 480); // ~125bpm 八分音
  },

  /** 接触锁定：轻"咔" */
  contact() {
    tone(520, 0.07, "triangle", 0.18);
    vibrate(8);
  },

  /** 抓住：音高随匹配度上扬（高匹配更"实"） */
  grab(match: number) {
    const f = 300 + match * 360;
    tone(f, 0.1, "sine", 0.22);
    tone(f * 1.5, 0.08, "sine", 0.1, 0.02);
    vibrate(match > 0.7 ? 18 : 10);
  },

  /** 脱手：下行"噗" + 较强振动 */
  slip() {
    const c = ac();
    if (c) {
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(380, t0);
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.28);
      g.gain.setValueAtTime(0.22, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(g);
      g.connect(master!);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    }
    vibrate([20, 40, 30]);
  },

  /** Dyno 起跳：快速上滑"嗖" */
  dyno() {
    const c = ac();
    if (c && master) {
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.22);
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.28);
    }
    vibrate([10, 20, 25]);
  },

  /** 过关：上行琶音 + 节奏振动 */
  win() {
    const notes = [523, 659, 784, 1047]; // C E G C
    notes.forEach((f, i) => tone(f, 0.22, "triangle", 0.2, i * 0.1));
    vibrate([12, 30, 12, 30, 40]);
  },

  setMuted(m: boolean) {
    muted = m;
    if (m) vibrate(0); // 取消进行中的振动
  },
  toggle(): boolean {
    this.setMuted(!muted);
    return muted;
  },
  get isMuted() {
    return muted;
  },
};
