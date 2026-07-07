// Platform 接口的 Web 实现：performance.now / localStorage / WebAudio 音效。

import { Platform } from "@kkc/app/platform.ts";
import { sfx } from "./audio/sfx.ts";

export const webPlatform: Platform = {
  now: () => performance.now(),
  storage: {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null; // 隐私模式等场景下 localStorage 可能抛错
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* 存满/禁用则静默失败，游戏可继续 */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 同上 */
      }
    },
  },
  audio: sfx,
};
