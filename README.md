# RSIBench-Infra Pages

白底研究项目页：作者介绍、可切换指标的排行榜、8 个模型的独立图表、20 题交互得分矩阵和评测方法。采用 Next.js 静态导出、React、TypeScript、Tailwind CSS、Radix UI Tabs/Tooltip、Recharts 和 Lucide；字体通过 Fontsource 自托管。

## 本地运行

```bash
npm ci
npm run dev
```

## 数据刷新

在可访问 npu-fly 实验管理器的机器上运行：

```bash
npm run data:refresh
```

脚本只读 `http://127.0.0.1:10952/api/leaderboard`，验证完整 20 题、有效分数、Faster Rate 和 Median Speedup 后，导出 `data/leaderboard.json` 与可下载的 `public/data/leaderboard.json`。仅公开允许字段，移除内部路径、实验 ID、计费说明及错误信息。保存源响应 SHA-256、来源和 UTC 观测时间。失败时不会覆盖已有快照。刷新后重新构建部署，网页不会请求本机 API。

Faster Rate 为全 20 题中 reward > 1.10 的比例；Median Speedup 按全 20 题计算，缺失以 0 参与聚合。单题视图中缺失始终显示 `—`，不冒充零分。未完成模型标为 Provisional。

## GitHub Pages

```bash
npm run build
# 仓库子路径验证
NEXT_PUBLIC_BASE_PATH=/rsibench-infra-pages npm run build
```

静态产物在 `out/`。已准备 `.github/workflows/pages.yml`：推送 main 后使用官方 Pages Actions 发布，自动读取 Pages base_path。部署仓库为 https://github.com/wyifei26/rsibench-infra-page ，目标地址为 https://wyifei26.github.io/rsibench-infra-page/ 。首次部署需在仓库 Settings → Pages 中将 Source 设为 GitHub Actions，随后在 Actions 中运行 Deploy GitHub Pages。首次启用需要仓库管理权限，工作流内置 GITHUB_TOKEN 无法代替这一步。

项目源码入口通过 `NEXT_PUBLIC_PROJECT_GITHUB` 配置，尚未确认时显示 Code coming soon。此入口与网页部署仓库不同。

## 来源与组件

作者和项目描述参考 `/opt/tiger/arxiv-seed-rsibench-infra/paper.tex`，未添加未经确认的论文或 arXiv URL。

- [Radix UI](https://www.radix-ui.com/)：可访问的标签页、提示框（MIT）。
- [Recharts](https://recharts.org/)：排行榜及各模型独立图表（MIT）。
- [Lucide](https://lucide.dev/)：图标（ISC）。
- [Fontsource](https://fontsource.org/)：Inter、Source Serif 4，字体许可随 npm 包保留（OFL）。

详细规划见 [docs/site-plan.md](docs/site-plan.md)。

## 验证

```bash
npm run typecheck
npm run build
# 将 out/ 通过静态 HTTP 服务运行在 3100 端口后：
npx playwright test
```

浏览器测试覆盖 160 个分数与快照逐项一致、筛选与搜索、指标切换、下载内容、空态、详情和 390/768/1440px 无页面溢出。可通过 `CHROMIUM_PATH` 指定已有 Chromium，`TEST_BASE_URL` 指向预览地址。Pages 工作流通过仓库变量 `NEXT_PUBLIC_PROJECT_GITHUB` 设置公开代码链接。
