# PayGuard 商户故障 AI 处置台

一个可本地运行的三方商户故障智能处置系统 Demo。系统覆盖故障核验、定位分析、商户触达、故障升级、恢复判断和评测回流，并把每一步的输入、工具调用、耗时、决策依据、结构化输出与产品设计展示在同一条可审计链路中。

> 所有商户、事故、金额、指标和模型结果均为合成数据，仅用于产品方案和交互演示，不代表支付宝或蚂蚁集团的真实业务数据。

## 系统能力

- 逐步演示：一次点击只执行一个阶段，方便边操作边讲解。
- 人机协同：商户触达属于外部高风险动作，必须显式批准后才能升级；也可转人工处理，流程随即暂停并展示终态，可一键重置重新开始。
- 可观测执行：累计展示 AI 耗时、Token、成本、工具调用和证据数量。
- 可审计结果：每一步均保留输入、工具轨迹、决策因子、结构化输出、门槛、指标、风险和降级策略。
- 流程分析：包含全链路漏斗、桑基图、阶段 P50/P95/SLA、工具使用率与触达行为漏斗。
- 效果评测：包含 Precision、Recall、F1、Top-K、Grounding、混淆矩阵、实验对比与 Bad Case 回流。
- 双运行时：默认使用确定性的 Mock Runtime；可在页面显式切换到真实多模态 LLM Runtime，六阶段全部由真实模型驱动。
- 多模态核验：真实模式下智能核验向模型发送合成监控截图（支持上传替换），其余阶段消费结构化前序输出。
- 本地恢复：Mock 进度写入 `localStorage`，刷新后继续；重置后从智能核验重新开始。

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

完整讲解词见 [`docs/demo-script.md`](docs/demo-script.md)。黄金路径共有六个业务阶段和一个独立审批动作：

1. 执行智能核验。
2. 进入定位分析。
3. 生成商户触达方案。
4. 批准并发送。
5. 执行故障升级。
6. 判断是否恢复。
7. 回流评测样本。

完成后进入「AI 评测」，可以看到由本次 Run 自动生成的 `EVAL-20260826-031` 样本；「流程分析」展示常态化运营看板；「事故中心」支持查看事故证据链或进入黄金场景。

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

- 商户触达在两种模式下都必须人工审批；解析方差（模型输出轻微超出 Schema 数量约束）会自动截断收敛，偶发不可解析时服务端原样重试一次真实调用（重试的 token 用量也会计入观测面板）。
- 错误响应只包含安全错误码、用户可读消息和 `retryable`，不透传请求头、密钥或上游正文。
- 同一 Run 的服务端命令串行执行：并发点击不会跳过阶段或回退状态机；浏览器侧请求有 90 秒兜底超时，不会永久锁死界面。
- 内置合成监控截图为 `public/mock/merchant-monitor.png`，可由 `node scripts/generate-monitor-png.mjs` 重新生成（纯合成数据）。

## 目录重点

- `lib/runtime/`：运行时契约、黄金场景、状态机、持久化、服务端命令适配器、多模态 Client、六阶段 Schema 与服务端编排。
- `components/demo/`：逐步处置控制器、六步导航、执行工作区、模式切换与核验图片控件。
- `components/AnalyticsViews.tsx`：漏斗、桑基图、延迟、工具和评测图表。
- `scripts/generate-monitor-png.mjs`：内置合成监控截图生成脚本。
- `docs/demo-script.md`：Mock / 真实双路线讲解脚本。
