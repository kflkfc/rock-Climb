// 调参面板：把 tuning 常数接到右上角滑块（应对"物理参数调参地狱"）。

import { tuning, TUNE_SPECS } from "../config/tuning.ts";

export function installTuningPanel() {
  const root = document.getElementById("tuning")!;
  const rows = root.querySelector(".rows") as HTMLElement;
  const title = document.getElementById("tuningTitle")!;
  title.addEventListener("click", () => root.classList.toggle("collapsed"));

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
