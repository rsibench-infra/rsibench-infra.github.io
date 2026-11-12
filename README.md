# RSIBench-Infra Pages

研究项目页，包含 RSIBench-Infra-Lite、20 题全榜、逐题 Speedup / SOL score 和原始 Agent trajectory。Next.js 静态导出，发布至 https://rsibench-infra.github.io/ 。

## 当前结果选择

2026-11-12 发布口径：

- DeepSeek V4 Flash 和 Seed Evolving Auto 保留原实验的分数和逐字节轨迹，固定在 `data/historical-results.json`。
- GPT-6 Astra、Claude Opus 5.5、GLM-5.3、Qwen3.8 Max、Kimi K3 使用当前实验结果。逐题 result SHA-256 和 attempt 绑定在 `data/selected-results.json`，重评沿来源链读取原 Agent 轨迹。
- Claude 只采用当前完成的 10 题；其他 10 题显示未测试和用户指定的 API safety-policy 错误。失败的 GLM-5.2 记录不纳入这 10 个结果。
- 缺失 reward 保留 `null`，Speedup 显示 `—`，SOL score 为 0；正式零 reward 的 Speedup 显示 `0.00×`。

## SOL 归一化

参考 `ALL-20-SOL-RESULTS-20261112.md`：以 `summary.json` 的 20 题为基础，用 `latest-sb-20261112.json` 覆盖最新七题，使用未舍入数值。公开参考为 `data/sol-reference.json`，保留单位、硬件、baseline、SOL 和解析参考类型。四题为前缀平均外推，不宣称是实测性能。

令 `r = speedup`、`s = SOL / baseline`：

- 无 reward 或 reward=0：score=0。
- r≥s：score=1（先截断，避免倒数公式越过奇点）。
- 其他情况：`score = 1 / (1 + (1/r - 1/s) / (1 - 1/s))`。

Oracle=0.5，SOL=1。Claude 的 Full mean SOL score、median speedup 和 faster rate 仅按有正式分数的 10 题计算；Lite mean 仅按有正式分数的 3 题计算。正式零分计入分母，缺失不计入。其他模型仍按 Full 20 题、Lite 5 题计算。Claude 的柱形采用 † 标记、半透明填充及虚线边框，并标明 10/20、3/5 的覆盖范围。Faster 阈值为严格大于 1.10。Full 与 Lite 使用完全相同的逐题 SOL score。

## 刷新与验证

```bash
npm ci
npm run data:refresh
# 显式指定只读来源：
python3 scripts/refresh_publication.py --api http://127.0.0.1:10961/api --database /path/to/state.sqlite3 --sol-evidence /path/to/full-sol-20261109
npm run typecheck
python3 -m unittest discover -s tests -p 'test_*.py'
NEXT_PUBLIC_BASE_PATH='' npm run build
python3 -m http.server 3100 --directory out --bind 127.0.0.1
# 另一个终端：
CHROMIUM_PATH=/path/to/chrome npx playwright test
```

刷新脚本核对 API、只读 SQLite、原生 result reward 和文件 SHA，导出结束再次检查来源未变化。分数与轨迹一起刷新，禁止旧脚本独立重绑来源。`data:trajectories` 和旧 Python 导出入口均转到同一流程。不会修改实验状态、原始结果或原始轨迹。

当前共 140 个单元格、138 份可用 ATIF，另两道 Claude 题目明确显示不可用。gzip 以原始内容 SHA-256 命名；浏览器按需加载、解压并验证 SHA。原始 messages / tools / reasoning 保持原格式，支持搜索、分页和字段检查，不提供下载按钮。静态网站不连接实验管理器。

## 部署

部署仓库：https://github.com/rsibench-infra/rsibench-infra.github.io 。`.github/workflows/pages.yml` 在 main 推送后执行 GitHub Pages 部署，根域名强制 `NEXT_PUBLIC_BASE_PATH=''`。构建产物为 `out/`。源码链接由 `NEXT_PUBLIC_PROJECT_GITHUB` 配置。

发布时只提交网站源码、公开数据与当前 manifest 引用的轨迹；保留实验目录和历史来源。上线后核对数据哈希、根路径资源、指标切换和真实轨迹加载。
