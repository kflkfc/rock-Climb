# BoulderSim（已归档）

Demo 垂直切片阶段的代码已于 2026-07-07 迁移至 monorepo 结构，此目录仅留此说明。

- 确定性纯逻辑内核 → `packages/core/`
- 渲染/摄像机/姿态平滑 → `packages/app/`
- 网页壳（DOM/音频/输入/Vite） → `packages/platform-web/`
- 岩点图鉴文档 → `docs/holds-catalog.html`

开发入口改为仓库根目录：`npm install && npm run dev`。

正式版设计文档见 `RockClimbing Game/设计文档/正式版V1_游戏设计文档.md`。
