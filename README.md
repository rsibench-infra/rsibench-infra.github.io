# RSIBench-Infra Pages

白底研究项目页：作者介绍、可切换指标的排行榜、7 个模型的独立图表、20 题交互得分矩阵和评测方法。采用 Next.js 静态导出、React、TypeScript、Tailwind CSS、Radix UI Tabs/Tooltip/Dialog、Ant Design X Bubble、Recharts 和 Lucide；字体通过 Fontsource 自托管。

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

脚本只读 `http://127.0.0.1:10952/api/leaderboard`，验证完整 20 题、有效分数、Faster Rate 和 Median Speedup 后，导出 `data/leaderboard.json` 与静态数据文件 `public/data/leaderboard.json`。仅公开允许字段，移除内部路径、实验 ID、计费说明及错误信息。保存源响应 SHA-256、来源和 UTC 观测时间。失败时不会覆盖已有快照。刷新后重新构建部署，网页不会请求本机 API。

Faster Rate 为全 20 题中 reward > 1.10 的比例；Median Speedup 按全 20 题计算，缺失以 0 参与聚合。单题视图中缺失始终显示 `—`，不冒充零分。未完成模型标为 Provisional。

## 原始 Agent trajectory

矩阵中的 140 个单元格均可打开轨迹查看器。消息采用 [Ant Design X Bubble](https://x.ant.design/components/bubble/)，工具参数、输出与 reasoning 采用 Ant Design Collapse，弹窗使用 Radix Dialog。支持全文搜索、每页 20 步、原始步骤与顶层元数据查看；页面和弹窗均不提供下载按钮；不截断或改写源文件。Markdown 禁止嵌入 HTML 和远程图片。

```bash
npm run data:trajectories
# 在其他机器上显式指定只读数据源：
python3 scripts/export_trajectories.py --api http://127.0.0.1:10952/api --state-db /path/to/state.sqlite3
```

导出器保持已有分数快照不变，按 manager 榜单选中的 task、对应 result_path 的 attempt 定位轨迹；重评沿 source_attempt_ids 读取原始 Agent。若分数已变化则拒绝导出，需先运行 `npm run data:refresh`，然后重新导出轨迹。公开索引保留来源运行 ID、分数状态与当前运行状态、导出时间、文件 SHA-256 和采集完整性提示，不导出数据库路径。轨迹比评分快照更新时仍单独标明来源与导出时间。

静态文件位于 `public/data/trajectories/`，浏览器只在打开单元格时请求对应 gzip 文件，解压后校验 SHA-256。原始文件共约 40 MB（gzip），不会加入首页 JS。当前导出 139 份轨迹，另外 1 个单元格明确显示 ATIF 缺失；不使用其他运行补位。源轨迹里的命令、路径及工具输出保持原样。浏览器需支持 DecompressionStream 和 Web Crypto（HTTPS 或 localhost）。

## GitHub Pages

```bash
npm run build
# 组织根域名构建（无仓库子路径）
NEXT_PUBLIC_BASE_PATH= npm run build
```

静态产物在 `out/`。已准备 `.github/workflows/pages.yml`：推送 main 后使用官方 Pages Actions 发布，自动读取 Pages base_path。部署仓库为 https://github.com/rsibench-infra/rsibench-infra.github.io ，目标地址为 https://rsibench-infra.github.io/ 。首次部署需在仓库 Settings → Pages 中将 Source 设为 GitHub Actions，随后在 Actions 中运行 Deploy GitHub Pages。首次启用需要仓库管理权限，工作流内置 GITHUB_TOKEN 无法代替这一步。

项目源码入口通过 `NEXT_PUBLIC_PROJECT_GITHUB` 配置，尚未确认时显示 Code coming soon。此入口与网页部署仓库不同。

## 来源与组件

作者和项目描述参考 `/opt/tiger/arxiv-seed-rsibench-infra/paper.tex`，未添加未经确认的论文或 arXiv URL。

- [Radix UI](https://www.radix-ui.com/)：可访问的标签页、提示框、轨迹弹窗（MIT）。
- [Ant Design X](https://x.ant.design/) / [Ant Design](https://ant.design/)：现成 Bubble 对话消息、Collapse 工具详情与分页组件（MIT）。
- [react-markdown](https://github.com/remarkjs/react-markdown) / remark-gfm：消息 Markdown 渲染（MIT）。
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

浏览器测试覆盖 140 个分数与快照逐项一致、筛选与搜索、指标切换、无下载入口、空态、详情和 390/768/1440px 无页面溢出。可通过 `CHROMIUM_PATH` 指定已有 Chromium，`TEST_BASE_URL` 指向预览地址。Pages 工作流通过仓库变量 `NEXT_PUBLIC_PROJECT_GITHUB` 设置公开代码链接。

轨迹验证还覆盖 140 个索引绑定、139 份原始文件 SHA-256、工具折叠、跨页搜索、源文件完整性、缺失提示、请求失败重试，以及移动端弹窗布局。

## 公开结果选择

页面顺序为 RSIBench-Infra-Lite 排行榜、RSIBench-Infra 排行榜、RSIBench-Infra 逐题结果、两个 benchmark 的介绍。Lite 总榜按五题 mean_score 降序排列；逐题得分合并为一张分组柱状图，横轴为五道题，每组按总榜顺序展示七个模型，共用刻度和 Oracle / SOL 参考线。悬停或方向键查看精确分数，保留零分及超过 SOL 的分数，移动端可横向滚动。

`data/selected-results.json` 固定 Claude Opus 5.5 的 infer-kimik3-2p8t 使用 attempt #271，保存 verifier 原始指标与 result.json SHA-256。该运行状态仍为 failed，但 verifier 有效分数为 1.1804461942257218；公开分数状态为 verified。轨迹同步指向 #271。其余四道题按用户提供的说明标注 Anthropic 风控限制，缺失保留为 null，聚合仍使用全 20 题。

`public_results.py` 将公开模型范围和指定结果应用到数据刷新，不改实验管理器记录。静态数据和轨迹目录仅包含当前展示的七个模型。

`data/selected-trajectories.json` 固定 GLM-5.3 模型的 Qwen3 TTS 单元格使用 attempt #326 的原始轨迹（源模型名 deployed/GLM-5.3）。该次实验没有 verifier 得分，单元格继续显示缺失；导出器验证模型与任务身份，并禁止以仅轨迹选择替换已验证得分的来源。归一化公式使用 KaTeX，Lite 分组柱状图只展示 Agent 得分，Oracle / SOL 以参考线呈现。
