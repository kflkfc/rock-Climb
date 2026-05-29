// 全部物理常数集中此处（应对"调参地狱"）。调参面板直接改这个对象的字段。

export interface Tuning {
  hangFrac: number; // 手抓住时肩悬于手下方 = hangFrac × 臂长（越大越接近直臂悬挂、越省力）
  standFrac: number; // 脚抓住时髋立于脚上方 = standFrac × 腿长（越大腿越直、越站得起来）
  reachLead: number; // 伸手时身体跟随系数：自由肢端对骨盆目标的权重（联动/重心跟随）
  balanceShift: number; // 两/三点平衡时重心移向支撑点的果断程度（counterbalance）
  pelvisFollow: number; // 骨盆平滑跟随系数 0..1（每帧 60Hz；越大越跟手）
  limbTau: number; // 渲染平滑时间常数（秒，越小越跟手越硬，越大越柔）
  dirPenalty: number; // 方向错位惩罚指数（越大错向越致命）
  tensionCost: number; // 双向对抗(张力)的耐力开销系数
  rotFollow: number; // 身体旋转缓动系数 0..1（每帧 60Hz）
  rotLimit: number; // 旋转/偏身限幅（弧度）
  capacity: number; // 抓力上限基准容量（与负载同量纲=体重单位）
  staminaDrain: number; // 耐力消耗系数（越大掉得越快）
  staminaRecover: number; // 自由肢端耐力恢复速度（每秒）
  imbalanceDrain: number; // 失衡时附加负载放大系数
  maxForceK: number; // 抓力上限缩放
  reachSlack: number; // 伸展极限宽容（>1 略微允许超伸）
  fallResetDelay: number; // 掉落后自动复位起点的延迟（秒）
}

export const tuning: Tuning = {
  hangFrac: 0.88,
  standFrac: 0.9,
  reachLead: 0.4,
  balanceShift: 0.18,
  pelvisFollow: 0.16,
  limbTau: 0.09,
  capacity: 175,
  staminaDrain: 0.42,
  staminaRecover: 0.5,
  imbalanceDrain: 0.9,
  maxForceK: 1.0,
  reachSlack: 1.0,
  fallResetDelay: 1.1,
  dirPenalty: 1.3,
  tensionCost: 0.6,
  rotFollow: 0.12,
  rotLimit: 0.6,
};

export interface TuneSpec {
  key: keyof Tuning;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const TUNE_SPECS: TuneSpec[] = [
  { key: "capacity", label: "抓力容量", min: 80, max: 320, step: 5 },
  { key: "staminaDrain", label: "耐力消耗", min: 0.05, max: 1.5, step: 0.01 },
  { key: "staminaRecover", label: "耐力恢复", min: 0.05, max: 1.5, step: 0.01 },
  { key: "imbalanceDrain", label: "失衡惩罚", min: 0, max: 2, step: 0.05 },
  { key: "maxForceK", label: "抓力上限", min: 0.3, max: 2.5, step: 0.05 },
  { key: "hangFrac", label: "手悬挂比", min: 0.4, max: 1.05, step: 0.02 },
  { key: "standFrac", label: "脚支撑比", min: 0.4, max: 1.05, step: 0.02 },
  { key: "reachLead", label: "伸手联动", min: 0, max: 0.9, step: 0.05 },
  { key: "balanceShift", label: "重心平衡", min: 0, max: 0.5, step: 0.02 },
  { key: "pelvisFollow", label: "骨盆跟随", min: 0.04, max: 0.6, step: 0.02 },
  { key: "limbTau", label: "动作柔度", min: 0.02, max: 0.3, step: 0.01 },
  { key: "dirPenalty", label: "错向惩罚", min: 0.5, max: 3, step: 0.1 },
  { key: "tensionCost", label: "张力开销", min: 0, max: 2, step: 0.05 },
  { key: "rotFollow", label: "旋转跟随", min: 0.03, max: 0.4, step: 0.01 },
  { key: "rotLimit", label: "旋转限幅", min: 0.2, max: 1.2, step: 0.05 },
];
