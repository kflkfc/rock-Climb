// 终态哈希：把 Game 的全部逻辑状态压成 16 位十六进制指纹。
// 两次模拟"比特级相同" ⟺ 哈希相等。浮点一律取 IEEE754 位模式，不走十进制字符串
//（十进制会丢位；位模式才能暴露 1ulp 的分叉）。

import { Game } from "../sim/gameState.ts";
import { LIMBS } from "../model/skeleton.ts";

const buf = new DataView(new ArrayBuffer(8));

function f64bits(x: number): string {
  buf.setFloat64(0, x);
  return (
    buf.getUint32(0).toString(16).padStart(8, "0") + buf.getUint32(4).toString(16).padStart(8, "0")
  );
}

/** FNV-1a 双流 32 位 → 64 位十六进制指纹 */
function fnv64(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ 0x5bd1e995;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** 逻辑终态指纹：状态机 + 计数 + 骨盆/朝向/失衡 + 四肢完整状态 + 重心 */
export function stateHash(game: Game): string {
  const c = game.c;
  const parts: string[] = [
    game.level.id,
    game.status,
    String(game.gripCount),
    f64bits(game.time),
    f64bits(c.pelvis.x),
    f64bits(c.pelvis.y),
    f64bits(c.pelvisVel.x),
    f64bits(c.pelvisVel.y),
    f64bits(c.lean),
    f64bits(c.shoulderTwist),
    f64bits(c.hipTwist),
    f64bits(c.imbalanceT),
    f64bits(c.pullBlend),
    f64bits(c.pose.com.x),
    f64bits(c.pose.com.y),
    c.fallen ? "1" : "0",
    c.dyno ? "d" + f64bits(c.dyno.t) + c.dyno.leadLimb + c.dyno.excluded.join(",") : "-", // 腾空态入指纹
    f64bits(c.injuryT), // 指伤剩余（影响后续物理）
  ];
  for (const l of LIMBS) {
    const st = c.limbs[l];
    parts.push(
      l,
      st.attached ? "1" : "0",
      st.hold ? st.hold.id : "-",
      st.grip ?? "-",
      f64bits(st.stamina),
      f64bits(st.match),
      f64bits(st.contactDist),
      f64bits(st.contactOff.x), // 接触偏移影响 gripPos → 全部物理，必须入指纹
      f64bits(st.contactOff.y),
      f64bits(st.freePos.x),
      f64bits(st.freePos.y),
      st.slipping ? "1" : "0",
    );
  }
  return fnv64(parts.join("|"));
}

/** 通用字符串指纹（关卡数据哈希等复用） */
export const contentHash = fnv64;
