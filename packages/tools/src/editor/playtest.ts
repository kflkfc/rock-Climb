// 试玩控制器 + 诊断面板。
// 试玩跑在草稿的深拷贝上（改不到草稿），并顺带录一条参考攀爬序列——
// 那正是新关进 CI 出厂检验（followSeq）所需要的 LEVEL_SEQS 条目。

import { LevelDef } from "@kkc/core/level/levelSchema.ts";
import { wallAngleAtY } from "@kkc/core/level/levelSchema.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { LOGIC_DT } from "@kkc/core/replay/runner.ts";
import { Limb, LIMBS } from "@kkc/core/model/skeleton.ts";
import { isBalanced, SLIP_REASON_LABEL } from "@kkc/core/sim/physics.ts";
import { GRIP_LABEL } from "@kkc/core/sim/grip.ts";
import { CHARACTERS } from "@kkc/core/model/characters.ts";
import { MAX_LEVEL } from "@kkc/core/model/body.ts";
import { EditorState } from "./state.ts";
import { validateDraft } from "./validate.ts";
import { cloneDoc } from "./draft.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const LIMB_CN: Record<Limb, string> = { LH: "左手", RH: "右手", LF: "左脚", RF: "右脚" };

interface SlipLog {
  limb: Limb;
  reason: string;
  t: number;
}

export class Playtest {
  game: Game | null = null;
  private acc = 0;
  private paused = false;
  private stepOnce = false;
  private speed = 1;
  private slipLog: SlipLog[] = [];
  private lastSlipT = -1;
  private held: Record<string, string | null> = {};
  /** 本次试玩录到的参考序列 */
  seq: [Limb, string][] = [];

  constructor(
    private S: EditorState,
    private onModeChange: () => void,
  ) {
    const chara = $<HTMLSelectElement>("pChara");
    for (const c of CHARACTERS) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      chara.appendChild(o);
    }
    const lv = $<HTMLSelectElement>("pLevel");
    for (let i = 1; i <= MAX_LEVEL; i++) {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = String(i);
      lv.appendChild(o);
    }
    lv.value = "5";
    chara.onchange = () => this.restart();
    lv.onchange = () => this.restart();
    $<HTMLSelectElement>("pSpeed").onchange = (e) => {
      this.speed = parseFloat((e.target as HTMLSelectElement).value);
    };
    $("pPause").onclick = () => {
      this.paused = !this.paused;
      $("pPause").textContent = this.paused ? "▶" : "⏸";
    };
    $("pStep").onclick = () => {
      this.paused = true;
      $("pPause").textContent = "▶";
      this.stepOnce = true;
    };
    $("pRestart").onclick = () => this.restart();
    $("pExit").onclick = () => this.exit();
  }

  get active() {
    return this.game !== null;
  }

  /** 进试玩：先过硬校验，省得进去了才发现缺起始肢 */
  enter(): boolean {
    const errs = validateDraft(this.S.level).filter((i) => i.level === "error");
    if (errs.length) {
      alert("这关还不能试玩：\n\n" + errs.map((e) => "· " + e.msg).join("\n"));
      return false;
    }
    this.build(cloneDoc(this.S.level));
    $("playbar").style.display = "flex";
    $("diag").style.display = "block";
    $("mode").textContent = "试玩中（Esc 返回编辑）";
    this.onModeChange();
    return true;
  }

  private build(level: LevelDef) {
    const g = new Game(level);
    g.setClimberLevel(parseInt($<HTMLSelectElement>("pLevel").value, 10) || 5);
    g.setCharacter($<HTMLSelectElement>("pChara").value);
    this.game = g;
    this.acc = 0;
    this.paused = false;
    this.stepOnce = false;
    $("pPause").textContent = "⏸";
    this.slipLog = [];
    this.lastSlipT = -1;
    this.seq = [];
    this.held = {};
    for (const l of LIMBS) this.held[l] = g.c.limbs[l].hold?.id ?? null;
  }

  restart() {
    if (!this.game) return;
    this.build(cloneDoc(this.S.level));
  }

  exit() {
    if (!this.game) return;
    // 录到的序列回写草稿（生成 TS 时带上）；空序列不覆盖已有的
    if (this.seq.length) {
      this.S.doc.seq = this.seq.slice();
      this.S.commit();
    }
    this.game = null;
    $("playbar").style.display = "none";
    $("diag").style.display = "none";
    $("mode").textContent = "编辑模式";
    this.onModeChange();
  }

  /** 固定步长推进（确定性内核只吃 LOGIC_DT；倍速改的是喂帧速度，不是 dt） */
  update(dt: number) {
    const g = this.game;
    if (!g) return;
    if (this.stepOnce) {
      this.stepOnce = false;
      g.update(LOGIC_DT);
      this.harvest();
      return;
    }
    if (this.paused) return;
    this.acc += Math.min(0.25, dt) * this.speed;
    let n = 0;
    while (this.acc >= LOGIC_DT && n < 8) {
      g.update(LOGIC_DT);
      this.harvest();
      this.acc -= LOGIC_DT;
      n++;
    }
    if (n === 8) this.acc = 0;
  }

  /** 每逻辑帧后采集：抓取序列 + 脱手日志 */
  private harvest() {
    const g = this.game!;
    for (const l of LIMBS) {
      const now = g.c.limbs[l].hold?.id ?? null;
      if (now && now !== this.held[l]) this.seq.push([l, now]);
      this.held[l] = now;
    }
    const s = g.lastSlip;
    if (s && s.t !== this.lastSlipT) {
      this.lastSlipT = s.t;
      this.slipLog.unshift({ limb: s.limb, reason: SLIP_REASON_LABEL[s.reason], t: s.t });
      this.slipLog.length = Math.min(this.slipLog.length, 8);
    }
  }

  /** 诊断面板（每渲染帧刷新） */
  renderDiag() {
    const g = this.game;
    if (!g) return;
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const bar = (n: number) => {
      const k = Math.max(0, Math.min(10, Math.round(n * 10)));
      return "█".repeat(k) + "·".repeat(10 - k);
    };
    const L: string[] = [];
    L.push(`<b>状态</b> ${g.status}   步 ${g.gripCount}   ${g.time.toFixed(1)}s`);
    L.push(
      `<b>墙角</b> ${Math.round(wallAngleAtY(g.level, g.c.pose.com.y))}°   <b>平衡</b> ${isBalanced(g.c) ? "✓" : "✗ 失衡"}`,
    );
    const xs = LIMBS.filter((l) => g.c.limbs[l].attached).map((l) => g.c.limbs[l].hold!.pos.x);
    if (xs.length)
      L.push(
        `<b>重心x</b> ${g.c.pose.com.x.toFixed(0)}   支撑跨度 ${Math.min(...xs).toFixed(0)}~${Math.max(...xs).toFixed(0)}`,
      );
    L.push("");
    for (const l of LIMBS) {
      const st = g.c.limbs[l];
      if (!st.attached || !st.hold) {
        L.push(`<b>${LIMB_CN[l]}</b> —（自由）`);
        continue;
      }
      L.push(
        `<b>${LIMB_CN[l]}</b> ${st.hold.id} · ${GRIP_LABEL[st.grip!] ?? "?"}\n` +
          `  匹配 ${pct(st.match)}  对齐 ${pct(st.align)}\n` +
          `  耐力 ${bar(st.stamina)} ${pct(st.stamina)}`,
      );
    }
    if (g.status === "ring" && g.ring) {
      L.push("");
      L.push(`<b>抓法环</b> ${g.ring.hold.id}（${g.ring.hold.type}）`);
      for (const o of g.ring.options) L.push(`  ${GRIP_LABEL[o.grip]} ${pct(o.match)}`);
    }
    if (this.slipLog.length) {
      L.push("");
      L.push("<b>脱手日志</b>");
      for (const s of this.slipLog) L.push(`  ${s.t.toFixed(1)}s ${LIMB_CN[s.limb]} ${s.reason}`);
    }
    if (this.seq.length) {
      L.push("");
      L.push(`<b>已录序列</b> ${this.seq.length} 步（退出试玩时写回草稿）`);
    }
    $("diag").innerHTML = L.join("\n");
  }
}
