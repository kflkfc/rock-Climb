// 平台抽象接口（模块 23）：app 层只依赖此接口，Web / 微信小游戏各自实现。
// 原则：只放"真的有两端差异"的能力；不预留用不上的方法。

/** 游戏音效表面（与玩法事件一一对应；实现内部可并联振动反馈） */
export interface GameAudio {
  /** 需在用户手势内调用以解锁 AudioContext（Web 自动播放策略 / 微信同理） */
  unlock(): void;
  contact(): void;
  grab(match: number): void;
  slip(): void;
  win(): void;
  setMuted(muted: boolean): void;
  readonly isMuted: boolean;
}

/** 键值存储（Web=localStorage，微信=wx storage；均为同步小数据） */
export interface KVStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface Platform {
  /** 单调时钟（毫秒）。仅供渲染循环节拍；逻辑层一律用固定步长帧号，禁止读墙钟 */
  now(): number;
  storage: KVStorage;
  audio: GameAudio;
}
