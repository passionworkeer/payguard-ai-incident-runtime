# PayGuard 商户故障 AI 处置台

一个可本地运行的三方商户故障智能处置系统 Demo。系统覆盖故障核验、定位分析、商户触达、故障升级、恢复判断和评测回流，并把每一步的输入、工具调用、耗时、决策依据、结构化输出与产品设计展示在同一条可审计链路中。

> 所有商户、事故、金额、指标和模型结果均为合成数据，仅用于产品方案和交互演示，不代表支付宝或蚂蚁集团的真实业务数据。

## 系统能力

- 逐步演示：一次点击只执行一个阶段，方便边操作边讲解。
- 人机协同：商户触达属于外部高风险动作，必须显式批准后才能升级。
- 可观测执行：累计展示 AI 耗时、Token、成本、工具调用和证据数量。
- 可审计结果：每一步均保留输入、工具轨迹、决策因子、结构化输出、门槛、指标、风险和降级策略。
- 流程分析：包含全链路漏斗、桑基图、阶段 P50/P95/SLA、工具使用率与触达行为漏斗。
- 效果评测：包含 Precision、Recall、F1、Top-K、Grounding、混淆矩阵、实验对比与 Bad Case 回流。
- 双运行时边界：默认使用确定性的 Mock Runtime；同一套 UI 可注入 HTTP Runtime 对接真实后端。
- 本地恢复：Mock 进度写入 `localStorage`，刷新后继续；重置后从智能核验重新开始。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev -- --port 3002
```

打开 [http://localhost:3002](http://localhost:3002)。本项目不需要云端发布、账号或 API Key。

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
IncidentRuntime
   ├─ MockIncidentRuntime  → 确定性场景 + localStorage
   └─ HttpIncidentRuntime  → 真实事故与工具服务
```

`IncidentRuntime` 定义在 `lib/runtime/types.ts`。HTTP 适配器默认约定：

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| `POST` | `/api/incidents` | `IncidentRun` |
| `GET` | `/api/incidents/:runId` | `IncidentRun` |
| `POST` | `/api/incidents/:runId/stages/:stage` | `{ run, execution }` |
| `POST` | `/api/incidents/:runId/actions/:actionId/approve` | `IncidentRun` |
| `POST` | `/api/incidents/:runId/actions/:actionId/reject` | `IncidentRun` |
| `POST` | `/api/incidents/:runId/reset` | `IncidentRun` |

服务端错误可返回 `{ "code": "upstream_timeout", "message": "工具超时" }`。适配器会把 408、429 和 5xx 标记为可重试错误。HTTP Run 不会写入浏览器本地存储。

## 目录重点

- `lib/runtime/`：运行时契约、黄金场景、状态机、持久化、HTTP 适配器和评测样本转换。
- `components/demo/`：逐步处置控制器、六步导航、执行工作区与产品设计面板。
- `components/AnalyticsViews.tsx`：漏斗、桑基图、延迟、工具和评测图表。
- `docs/demo-script.md`：3–5 分钟逐步讲解脚本。
