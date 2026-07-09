// 调参面板：把 tuning 常数接到右上角滑块（应对"物理参数调参地狱"）。

import { tuning, TUNE_SPECS } from "@kkc/core/config/tuning.ts";
import { sfx } from "../audio/sfx.ts";
import { GameRunner } from "@kkc/core/replay/runner.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { LEVEL_LABEL } from "@kkc/core/model/body.ts";
import { HOLD_TYPES, HOLD_META, HoldType } from "@kkc/core/sim/holds.ts";
import { HAND_TABLE, FOOT_TABLE } from "@kkc/core/sim/gripTable.ts";
import { HAND_GRIPS, FOOT_GRIPS, GRIP_LABEL } from "@kkc/core/sim/grip.ts";
import { CHARACTERS } from "@kkc/core/model/characters.ts";

export function installTuningPanel(runner: GameRunner, save: SaveManager) {
  const game = runner.game;
  const root = document.getElementById("tuning")!;
  const rows = root.querySelector(".rows") as HTMLElement;
  const title = document.getElementById("tuningTitle")!;
  title.addEventListener("click", () => root.classList.toggle("collapsed"));

  // 选手级别 1-10（新手→世界杯）
  const lvLabel = document.createElement("label");
  const lvName = document.createElement("span");
  const lvText = (n: number) => `🧗 级别 ${n}${LEVEL_LABEL[n] ? "·" + LEVEL_LABEL[n] : ""}`;
  lvName.textContent = lvText(game.climberLevel);
  const lv = document.createElement("input");
  lv.type = "range";
  lv.min = "1";
  lv.max = "10";
  lv.step = "1";
  lv.value = String(game.climberLevel);
  lv.addEventListener("input", () => {
    const n = parseInt(lv.value, 10);
    runner.dispatch({ e: "climber", n }); // 走事件：级别变化也进回放 tape
    save.setClimberLevel(n);
    lvName.textContent = lvText(n);
  });
  lvLabel.append(lvName, lv);
  rows.appendChild(lvLabel);

  // 角色切换（P3 前的临时入口；正式角色选择页含解锁态/预览）
  const chLabel = document.createElement("label");
  const chName = document.createElement("span");
  chName.textContent = "🧍 角色";
  const chSel = document.createElement("select");
  chSel.style.flex = "1";
  for (const c of CHARACTERS) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name + (c.unlock ? `（${c.unlock.stars}⭐解锁）` : "");
    chSel.appendChild(o);
  }
  chSel.value = game.characterId;
  chSel.addEventListener("change", () => {
    runner.dispatch({ e: "chara", id: chSel.value }); // 走事件：换角色进回放 tape（会重开本线）
  });
  chLabel.append(chName, chSel);
  rows.appendChild(chLabel);

  // 静音开关
  const muteLabel = document.createElement("label");
  const muteName = document.createElement("span");
  muteName.textContent = "🔊 音效/振动";
  const mute = document.createElement("input");
  mute.type = "checkbox";
  mute.checked = !sfx.isMuted;
  mute.addEventListener("change", () => {
    sfx.setMuted(!mute.checked);
    save.setMuted(!mute.checked);
    muteName.textContent = mute.checked ? "🔊 音效/振动" : "🔇 已静音";
  });
  muteLabel.append(muteName, mute);
  rows.appendChild(muteLabel);

  // 存档导出/导入（P3 前的临时入口；正式 UI 在设置页）
  const ioLabel = document.createElement("label");
  const mkBtn = (text: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "flex:1;padding:2px 6px;cursor:pointer";
    b.addEventListener("click", onClick);
    return b;
  };
  ioLabel.append(
    mkBtn("📤 导出存档", () => {
      window.prompt("复制以下存档 JSON 备份：", save.export());
    }),
    mkBtn("📥 导入", () => {
      const t = window.prompt("粘贴存档 JSON：");
      if (!t) return;
      if (save.import(t)) location.reload(); // 干净地按新档重启
      else window.alert("存档无效，未做任何改动");
    }),
  );
  rows.appendChild(ioLabel);

  // ---- 匹配表页签：选岩点类型 → 热调该类型的手/脚匹配数值（核心数值资产现场校准） ----
  const tblHead = document.createElement("div");
  tblHead.textContent = "―― 匹配表（选类型热调）――";
  tblHead.style.cssText = "margin:8px 0 2px;color:#E5A636;font-weight:700;cursor:pointer";
  rows.appendChild(tblHead);
  const tblBox = document.createElement("div");
  tblBox.style.display = "none";
  tblHead.addEventListener("click", () => {
    tblBox.style.display = tblBox.style.display === "none" ? "block" : "none";
  });
  rows.appendChild(tblBox);

  const sel = document.createElement("select");
  sel.style.cssText = "width:100%;margin:4px 0";
  for (const t of HOLD_TYPES) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = HOLD_META[t].label;
    sel.appendChild(o);
  }
  tblBox.appendChild(sel);
  const gripRows = document.createElement("div");
  tblBox.appendChild(gripRows);

  function renderGripRows() {
    gripRows.innerHTML = "";
    const t = sel.value as HoldType;
    const mkRow = (name: string, get: () => number, set: (v: number) => void) => {
      const label = document.createElement("label");
      const s = document.createElement("span");
      s.textContent = name;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = String(get());
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = get().toFixed(2);
      input.addEventListener("input", () => {
        set(parseFloat(input.value));
        val.textContent = parseFloat(input.value).toFixed(2);
      });
      label.append(s, input, val);
      gripRows.appendChild(label);
    };
    for (const g of HAND_GRIPS)
      mkRow(`✋${GRIP_LABEL[g]}`, () => HAND_TABLE[t][g], (v) => (HAND_TABLE[t][g] = v));
    for (const g of FOOT_GRIPS)
      mkRow(`👟${GRIP_LABEL[g]}`, () => FOOT_TABLE[t][g], (v) => (FOOT_TABLE[t][g] = v));
  }
  sel.addEventListener("change", renderGripRows);
  renderGripRows();

  for (const spec of TUNE_SPECS) {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = spec.label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(tuning[spec.key]);
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = String(tuning[spec.key]);
    input.addEventListener("input", () => {
      const n = parseFloat(input.value);
      (tuning[spec.key] as number) = n;
      val.textContent = n.toFixed(2);
    });
    label.append(name, input, val);
    rows.appendChild(label);
  }
}
