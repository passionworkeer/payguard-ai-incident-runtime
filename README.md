# PayGuard 商户故障 AI 处置台

一个可本地运行的三方商户故障智能处置系统 Demo。系统覆盖故障核验、定位分析、商户触达、故障升级、恢复判断和评测回流，并把每一步的输入、工具调用、耗时、决策依据、结构化输出与产品设计展示在同一条可审计链路中。

> 所有商户、事故、金额、指标和模型结果均为合成数据，仅用于产品方案和交互演示，不代表支付宝或蚂蚁集团的真实业务数据。

## 系统能力

- **四场景全链路演示**：黄金路径（网关超时）+ 误报收敛（短路）+ 商户证书（根因归属）+ 渠道回弹（恢复重入），分支由阶段 output 驱动 —— Mock 走 fixture，真实模式由模型自己判断。
- **逐步演示**：一次点击只执行一个阶段，方便边操作边讲解。
- **人机协同**：商户触达属于外部高风险动作，必须显式批准后才能升级；恢复判断连续 3 次 recovered=false 触顶转人工，展示 `humanReason` 原因说明。
- **可观测执行**：累计展示 AI 耗时、Token、成本、工具调用和证据数量；恢复重入时 totals 显示「恢复重试 X 次」。
- **可审计结果**：每一步均保留输入、工具轨迹、决策因子、结构化输出、门槛、指标、风险和降级策略。
- **运营总览**：北极星 / 一级 / 护栏三层指标（9 卡）、MTTR 分解堆叠条（合计 = 北极星卡口径）、告警量 vs 事故量 + 事故窗口阴影、成功率 / P95 双轴 + 基线 markLine、原始告警流。
- **流程分析**：全链路漏斗、桑基图、阶段 P50/P95/SLA、工具使用率与触达行为漏斗。
- **评测产品化常态化**：场景内置 ground-truth，每次 Run 完成自动追加样本到 localStorage，AI 评测页实时聚合 Accuracy / Precision / Recall / F1 / 根因命中率 + 混淆矩阵，会话累积最近 20 条。
- **双运行时**：默认 Mock（确定性场景 + localStorage）；可在页面显式切换到真实多模态 LLM Runtime（服务端编排，Anthropic Messages 兼容）。
- **多模态核验**：真实模式下智能核验向模型发送合成监控截图（支持上传替换），其余阶段消费结构化前序输出。
- **本地恢复**：Mock 进度 + 评测样本均写入 `localStorage`，刷新后继续；重置后从智能核验重新开始。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev -- --port 3002
```

打开 [http://localhost:3002](http://localhost:3002)。Mock 路径不需要任何 API Key。

### 启用真实 LLM 模式（可选）

在项目根目录创建 `.env.local`（已被 Git 忽略）：

```text
key=<你的 API Key>
url=<HTTPS Base URL，Anthropic Messages 兼容>
model=<多模态模型名>
```

- 三个变量齐全且 `url` 为合法 HTTPS 地址时，页面顶部「真实 LLM」入口才可点击；`/api/runtime/config` 只暴露 `configured`、Provider 和模型名，不会泄露 Key。
- 真实模式下所有 LLM 调用都发生在服务端（`app/api/runtime/command`），浏览器不接触密钥。
- 未配置或配置缺失时 Mock 演示不受影响。
- 真实失败不会用 Mock 结果替代：当前步骤保留可原地重试，也可一键切回 Mock。

质量检查：

```bash
npm test -- --run
npm run types:check
npm run lint
npm run build
```

## 推荐演示路线

完整讲解词见 [`docs/demo-script.md`](docs/demo-script.md)。系统内置 4 个演示场景，可在「处置演示」顶部的「演示场景」选择器切换：

| 场景 | 商户 | 等级 | 计划步数 | 分支 |
| --- | --- | --- | --- | --- |
| 网关超时（黄金路径） | 星海出行 | P0 | 6 | 线性闭环 |
| 误报收敛 | 麦田会员店 | P2 | 2 | verify 短路直达 evaluate |
| 商户证书 | 云杉生活 | P1 | 6 | 根因归属商户、触达含指导步骤 |
| 渠道回弹 | 万象零售 | P0 | 7 | recover 第 1 次判未稳定 → 第 2 次换窗口 |

黄金路径七步操作：执行智能核验 → 进入定位分析 → 生成商户触达方案 → 批准并发送 → 执行故障升级 → 判断是否恢复 → 回流评测样本。

完成后进入「AI 评测」看本次 Run 自动生成的样本 + 实时聚合指标；「运营总览」看三层指标大盘与 MTTR 分解；「流程分析」看常态化运营看板；「事故中心」支持按行跳转对应场景的演示链路。

## Runtime 结构

```text
GuidedIncidentDemo
        │
        ▼
IncidentRuntime（types.ts 契约，二选一切换）
   ├─ MockIncidentRuntime  → 确定性场景 + localStorage
   └─ LlmIncidentRuntime   → /api/runtime/command（服务端编排真实 LLM）
                                   └─ ServerIncidentOrchestrator → callStageLlm（Anthropic 兼容多模态）
```

`IncidentRuntime` 定义在 `lib/runtime/types.ts`。真实路径的服务端接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/runtime/config` | 安全配置状态（`configured` / Provider / 模型名） |
| `POST` | `/api/runtime/command` | 统一命令端点：`create` / `execute` / `approve` / `reject` / `get` / `reset` |

- 商户触达在两种模式下都必须人工审批；恢复判断连续 3 次 recovered=false 触顶转人工，状态机停留当前阶段、`humanReason` 可视化。
- 误报短路直达 evaluate，中间 4 阶段在 StepRail 显示「已跳过」徽标但不计入 completedStages。
- 解析方差（模型输出轻微超出 Schema 数量约束）会自动截断收敛，偶发不可解析时服务端原样重试一次真实调用（重试的 token 用量也会计入观测面板）。
- 错误响应只包含安全错误码、用户可读消息和 `retryable`，不透传请求头、密钥或上游正文。
- 同一 Run 的服务端命令串行执行：并发点击不会跳过阶段或回退状态机；浏览器侧请求有 90 秒兜底超时，不会永久锁死界面。
- 内置合成监控截图 4 个变体（`public/mock/merchant-monitor*.png`），可由 `node scripts/generate-monitor-png.mjs` 重新生成（纯合成数据）：gateway 黄金路径、false-alarm 健康但流量涨、merchant-cert 签名失败 61.2×、channel-rebound 工行渠道 12.4% + 回弹形状。

## 目录重点

- `lib/runtime/`：运行时契约、4 场景 fixture + groundTruth、共享分支状态机、持久化、服务端命令适配器、多模态 Client、六阶段 Schema 与服务端编排。
- `lib/runtime/evaluation.ts` + `lib/runtime/eval-store.ts`：ground-truth 判分（judgeVerify / matchRootCause）+ 会话样本 FIFO 持久化。
- `lib/overview-data.ts`：MTTR 分解、30 点时序、原始告警流。
- `components/demo/`：逐步处置控制器、六步导航（支持 skipped 状态）、执行工作区、模式切换、场景选择器与核验图片控件。
- `components/OverviewView.tsx`：三层指标 + MTTR 分解 + 时序 + 告警流。
- `components/AnalyticsViews.tsx`：漏斗、桑基图、延迟、工具、评测图表 + 「本次会话实时评测」面板。
- `scripts/generate-monitor-png.mjs`：4 个监控截图变体参数化生成器。
- `docs/demo-script.md`：Mock / 真实双路线讲解脚本（含 4 场景讲解词 + 总览 + 评测判分）。
