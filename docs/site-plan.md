# RSIBench-Infra benchmark 官网方案

记录日期：2026-10-31

## 目标与范围

制作一个美观、专业、可交互的 benchmark 官网。排行榜、评测任务与结果是核心内容；论文链接和 Citation 作为辅助入口。参考 Artificial Analysis 的数据展示与视觉语言；按最新需求，首屏采用大标题、作者与项目链接，随后展示排行榜和完整任务得分。

已完成首版应用实现：Next.js 静态导出、Radix UI 交互组件、Recharts 图表、最新实验管理器数据快照、20 题矩阵及 GitHub Pages 工作流。网页部署仓库已确认为 https://github.com/wyifei26/rsibench-infra-page ，项目源码入口尚待确认。

## 已选技术栈与素材

| 层面 | 选择 | 用途 |
| --- | --- | --- |
| 框架 | Next.js + React + TypeScript | 页面、路由、可复用交互组件；采用静态导出 |
| 样式 | Tailwind CSS | 统一布局、间距、颜色、边框和响应式规则 |
| UI 组件 | shadcn/ui（使用 Radix UI 基础组件） | 筛选器、下拉菜单、标签页、弹窗和表格界面 |
| 图标 | Lucide React | 一致的线条图标 |
| 图表 | Recharts | 柱状图、散点图和模型对比等交互图表 |
| 默认字体 | Inter + Source Serif 4 | 开源字体组合；无衬线用于数据和正文，衬线用于部分展示标题 |
| 数据 | 静态 JSON | 经核验的榜单与任务数据，版本化管理 |
| 构建部署 | GitHub Actions + GitHub Pages | 构建静态产物并发布到 github.io |

具体依赖版本在应用初始化时选择兼容版本并用 lockfile 固定；不照搬参考网站的旧版本。

### 设计参考及事实边界

参考网站：https://artificialanalysis.ai/

本次讨论中检查其公开前端资源，识别到 Next.js、Tailwind CSS、Radix UI、Lucide、Recharts，以及 CSS 字体名 Suisse Intl 和 Victor Serif Basic。没有足够证据确认它采用 shadcn/ui 或某个现成网站模板。shadcn/ui 是我们项目主动选择的实现方案。

默认使用 Inter + Source Serif 4；如果后续需要 Suisse Intl / Victor Serif Basic，应先取得合适的 Web 字体授权。不复制参考网站的品牌标识或未经授权的素材，也不将近似字体描述为同款字体。

资源入口：

- Next.js：https://nextjs.org/
- Tailwind CSS：https://tailwindcss.com/
- shadcn/ui：https://ui.shadcn.com/
- Radix UI：https://www.radix-ui.com/
- Lucide：https://lucide.dev/
- Recharts：https://recharts.org/
- Inter：https://fonts.google.com/specimen/Inter
- Source Serif 4：https://fonts.google.com/specimen/Source+Serif+4

## 视觉方向

- 白色或浅色背景、深色文字、细边框、充分但有节制的留白。
- 以清晰排版和真实数据图表形成主视觉，避免依赖大量装饰插画。
- 无衬线字体保证表格与正文的可读性，少量衬线标题形成编辑出版物的气质。
- 一个主强调色配合有语义的图表色板；模型在不同图表中的颜色保持一致。
- 榜单具有适中的信息密度；数字对齐、表头清晰，详细指标按需展开。
- 移动端确保导航、筛选和图表可用；宽表格允许横向滚动。
- 兼顾键盘操作、焦点状态与对比度，图表不能只靠颜色区分数据。

## 初步信息架构

1. 首页：一句话定位、核心结果图、进入排行榜和查看任务的入口。
2. Leaderboard：排序、筛选、指标定义、结果版本与更新时间。
3. Tasks：任务分类、真实输入、目标、运行环境与结果示例。
4. Results / Compare：模型间表现对比及必要的成本、速度和质量图表。
5. Methodology：评测协议、指标解释、适用范围和复现说明。
6. Get Started：代码、数据、运行指南及提交入口；没有真实提交服务时只展示指南。
7. Paper / Citation：辅助资料及 BibTeX。

实际模块以已核实的 benchmark 内容为准，不为填充设计虚构模型、分数、规模或性能结论。未知结果显示缺失状态，不当作零分；展示性占位数据必须明确标注，不能混入正式榜单。

## GitHub Pages 部署约束

Next.js 使用 `output: "export"`，构建产物为 `out/`。页面中的排序、筛选、搜索、交互图表在浏览器端执行。

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // 项目站点 username.github.io/repo-name 才设置此项。
  // 根站点或独立域名通常省略；发布目标确定后再填写。
  // basePath: "/repo-name",
  images: { unoptimized: true },
};

export default nextConfig;
```

- 图片、字体及 JSON 的 URL 必须兼容仓库子路径，统一处理资源前缀。
- `/tasks/[id]` 等动态路径需要在构建时通过 `generateStaticParams` 枚举。
- 字体优先随构建产物自托管，并保留所需许可文件。
- 不依赖 SSR、Server Actions、请求时 API Routes、数据库服务或默认图片优化服务。
- 可调用允许跨域的外部公开 API，但不得在客户端或静态产物中放置密钥。首版优先采用静态 JSON。
- 数据更新通过更新 JSON 并重新构建发布完成。
- 采用 GitHub Actions 官方 Pages artifact/deploy 流程；确定仓库和 Pages 配置后再实施。

## 后续实施顺序

1. 初始化 Next.js 静态导出项目，固定依赖并建立设计 tokens。
2. 整理经过核实的数据和项目素材，定义榜单与任务 JSON schema。
3. 实现首屏、排行榜、任务卡片与核心图表，统一字体和视觉样式。
4. 补充方法、复现、引用等内容。
5. 验证响应式布局、键盘交互、数据一致性、静态构建及仓库子路径资源加载。
6. 确定 GitHub 发布仓库、域名与发布设置，配置 Actions 并部署。

## 验收重点

- 首页明确呈现 benchmark 的价值和结果，核心榜单容易到达。
- 筛选、排序、图表交互正确，指标与原始来源一致。
- 桌面与手机布局可读，无意外溢出或资源缺失。
- 静态导出成功，Pages 子路径下刷新与资源访问正常。
- 展示的数据、来源、更新时间和缺失状态明确。

## 首版验证记录（2026-10-31）

- 数据来自 08:22:50 UTC（北京时间 16:22:50）的管理器快照，8 个模型、20 道题、153 个有效得分；7 个缺失得分保留状态。
- 根路径及 `/rsibench-infra-pages/` 子路径静态构建成功，TypeScript 检查通过。
- 两轮 Playwright 测试均通过：160 个单元格逐项核对、指标切换、模型筛选、训练类别、搜索、空态、精确得分详情、JSON 下载。
- 390、768、1440px 三种宽度没有页面整体横向溢出；宽矩阵可在容器内横向滚动。
- 桌面和移动端截图保留在 `artifacts/`（未纳入 Git）；QA 静态服务已关闭。使用 `npm run dev` 可继续本地预览。
- 公开代码仓库尚未核实，因此显示 Code coming soon；未创建远程仓库、推送或部署。

- 后续确认：用户提供公开 GitHub 地址 `https://github.com/wyifei26/rsibench-infra-page`，已更新所有页面代码入口及默认配置；未推送或部署。

- 用户更正：`wyifei26/rsibench-infra-page` 是网页部署仓库，不是 benchmark 源码入口。已恢复源码入口占位，配置向该仓库推送及 GitHub Pages 自动部署。

- 部署代码已推送至 `wyifei26/rsibench-infra-page` 的 main 分支，仓库子路径 `/rsibench-infra-page` 构建通过。首次 Pages 启用需要管理权限；当前 SSH 可推送但不能配置 Pages，连接器无法访问此仓库。网页上线需另行确认，不以推送成功代替部署成功。
