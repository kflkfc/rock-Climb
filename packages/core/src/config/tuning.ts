// 全部物理常数集中此处（应对"调参地狱"）。调参面板直接改这个对象的字段。

export interface Tuning {
  hangFrac: number; // 休息时肩悬于手下方 = hangFrac × 臂长（越大越接近直臂悬挂、越省力）
  pullHang: number; // 发力(移动)时肩悬比例（更小=屈臂锁定上拉，带动重心上移）
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
  // 混合法：骨盆弹簧-阻尼动量 + 抓点柔性 + 自由肢端 Verlet 摆动
  pelvisStiff: number; // 骨盆弹簧刚度（越大越跟目标、动量越小）
  pelvisDamp: number; // 骨盆速度每帧保留 0..1（越小越快稳、越大越荡/过冲）
  gripStiff: number; // 抓点柔性刚度：超伸时回拉刚度（越大越硬钉、越小越下沉）
  limbGravity: number; // 自由肢端重力（px/s²，次级摆动下坠）
  limbSwingDamp: number; // 自由肢端惯性保留 0..1（越大摆得越久）
  limbRestPull: number; // 自由肢端回到休息位的弹簧（越大越快归位、摆动越小）
}

export const tuning: Tuning = {
  hangFrac: 0.95,
  pullHang: 0.7,
  standFrac: 0.85,
  reachLead: 0.4,
  balanceShift: 0.18,
  pelvisFollow: 0.16,
  limbTau: 0.09,
  capacity: 175,
  staminaDrain: 0.42,
  staminaRecover: 0.5,
  imbalanceDrain: 0.9,
  maxForceK: 1.0,
  reachSlack: 1.1,
  fallResetDelay: 1.1,
  dirPenalty: 1.3,
  tensionCost: 0.6,
  rotFollow: 0.12,
  rotLimit: 0.6,
  pelvisStiff: 240,
  pelvisDamp: 0.82,
  gripStiff: 120,
  limbGravity: 900,
  limbSwingDamp: 0.9,
  limbRestPull: 55,
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
  { key: "pullHang", label: "锁臂屈度", min: 0.4, max: 1.0, step: 0.02 },
  { key: "standFrac", label: "脚支撑比", min: 0.4, max: 1.05, step: 0.02 },
  { key: "reachLead", label: "伸手联动", min: 0, max: 0.9, step: 0.05 },
  { key: "balanceShift", label: "重心平衡", min: 0, max: 0.5, step: 0.02 },
  { key: "pelvisFollow", label: "骨盆跟随", min: 0.04, max: 0.6, step: 0.02 },
  { key: "limbTau", label: "动作柔度", min: 0.02, max: 0.3, step: 0.01 },
  { key: "dirPenalty", label: "错向惩罚", min: 0.5, max: 3, step: 0.1 },
  { key: "tensionCost", label: "张力开销", min: 0, max: 2, step: 0.05 },
  { key: "rotFollow", label: "旋转跟随", min: 0.03, max: 0.4, step: 0.01 },
  { key: "rotLimit", label: "旋转限幅", min: 0.2, max: 1.2, step: 0.05 },
  { key: "pelvisStiff", label: "骨盆刚度", min: 60, max: 600, step: 10 },
  { key: "pelvisDamp", label: "骨盆阻尼", min: 0.5, max: 0.97, step: 0.01 },
  { key: "gripStiff", label: "抓点柔性", min: 20, max: 400, step: 10 },
  { key: "limbGravity", label: "肢端重力", min: 0, max: 2000, step: 50 },
  { key: "limbSwingDamp", label: "摆动惯性", min: 0.5, max: 0.98, step: 0.01 },
  { key: "limbRestPull", label: "回位弹簧", min: 10, max: 200, step: 5 },
];
