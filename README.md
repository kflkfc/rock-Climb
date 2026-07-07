# KingKong Climbing · 金刚攀岩

**从小孩到金刚**——让每个人在浏览器/微信里体会真实抱石的爽快与脑力博弈，一路从 V0 攀到 V10+。硬核抱石模拟器：四肢独立操作 + 重心平衡 + 岩点抓法匹配 + 耐力管理。

🎮 **在线试玩**：https://kflkfc.github.io/rock-Climb/

> 项目已从技术验证 Demo（BoulderSim 垂直切片）进入**正式版 V1.0 开发**（P0 架构固化阶段）。
> 完整设计见 `RockClimbing Game/设计文档/正式版V1_游戏设计文档.md` 与 `正式版V1_开发流程与TODO.md`。

---

## 玩法（V4 接触式拖拽 + 耐力匹配）

```
拖动角色身上的彩色把手（肢端）→ 接触岩点即锁定 → 在岩点上微调找甜点
→ 松手弹出抓法环（每个抓法显示匹配度 %）→ 选抓法 → 开始消耗耐力
```

- **四肢独立**：左手(粉) / 右手(紫) / 左脚(绿) / 右脚(橙)，逐个挪到更高岩点向上攀爬
- **重心平衡**：重心必须落在抓点支撑跨度内，否则失衡 → 脱手
- **耐力匹配**：匹配度越高越省力；错误抓法不立即脱手，而是耐力急耗
- **三星评定**：★登顶（完攀）/ ★流畅（动作简练无脱手无 undo）/ ★神速（限时内登顶）
- 星数是成长货币：解锁能力点、选手等级、隐藏角色（猴子/猩猩）

---

## 快速开始

```bash
npm install
npm run dev        # 浏览器打开 http://localhost:5173
```

其他命令：

```bash
npm test           # Vitest 单元 + 集成测试（全 workspace）
npm run typecheck  # 三包分层类型检查（core 层禁 DOM）
npm run build      # 类型检查 + 生产构建到 packages/platform-web/dist
npm run preview    # 预览生产构建
```

---

## 架构（npm workspaces monorepo）

核心原则：**确定性纯逻辑内核与平台彻底解耦**——同一份输入序列在任何端重演出比特级相同的结果（回放 / 反作弊 / 关卡生成验证的共同地基）。

```
packages/
├── core/            # ★ 确定性纯逻辑内核（tsconfig 禁 DOM，可移植 Web/微信/Node）
│   ├── math/        #    向量 / 2-骨解析 IK
│   ├── model/       #    11 段骨骼姿态 / 人体参数
│   ├── sim/         #    岩点 / 抓法匹配 / 物理 / 耐力 / 状态机
│   ├── level/       #    关卡 Schema + 关卡数据
│   └── config/      #    全部物理常数（调参面板热改）
├── app/             # 应用层：渲染 / 摄像机 / 姿态平滑（只读 core 状态）
└── platform-web/    # 网页壳：DOM / 指针 / WebAudio / localStorage / Vite
```

后续将新增 `platform-wx/`（微信小游戏壳）、`server/`（排行榜重演校验）、`tools/`（关卡编辑器 / AI 试解器）。

核心机制实现位置：

| 机制 | 文件 |
|---|---|
| 匹配度公式 | `packages/core/src/sim/grip.ts` |
| 力分解 / 抓力上限 / 平衡 / 脱手 | `packages/core/src/sim/physics.ts` |
| 混合动力学（骨盆动量 + Verlet 摆动） | `packages/core/src/sim/physics.ts` |
| 状态机 + V4 交互编排 | `packages/core/src/sim/gameState.ts` |
| 平台抽象接口 | `packages/app/src/platform.ts` |

---

## 设计资料

`RockClimbing Game/` 保留全部设计产出：

- `设计文档/正式版V1_游戏设计文档.md` — **26 模块 GDD（当前蓝图）**
- `设计文档/正式版V1_开发流程与TODO.md` — P0-P7 里程碑与任务清单
- `设计文档/` 其余 — 立项期 Demo PRD、Klifur 元素分析、22 模块架构
- `可视化图/` `参考视频_关键帧/` — 交互演化与参考素材

---

## 路线图（正式版 V1.0 · 约 25 周）

- [x] Demo 垂直切片（6 关 / 变墙角 / 屋檐倒挂 / 混合动力学）
- [ ] **P0 架构固化**：monorepo + 确定性内核 + 回放 + 黄金测试 + 存档 ← 当前
- [ ] P1 模拟深度：12 岩点 / 8 抓法 / 12 参数人体 + 角色阵容 / Dyno
- [ ] P2 成长与内容：三星评定 / 星数成长 / 编辑器 / AI 试解器 / 38 关
- [ ] P3 UI/UX：Canvas UI 框架 + 15 屏幕 + 美术音频
- [ ] P4 关卡生成器 + 每日挑战
- [ ] P5 后端排行榜（回放重演反作弊）+ 分享
- [ ] P6 微信小游戏适配
- [ ] P7 打磨与发布

---

🤖 本项目由 [Claude Code](https://claude.com/claude-code) 协作实现。
