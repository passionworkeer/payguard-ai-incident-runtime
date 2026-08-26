# PayGuard 真实多模态 LLM Runtime 设计

**日期：** 2026-08-26  
**状态：** 已确认，待实施计划  
**目标：** 在保留完整、确定性 Mock 演示的前提下，为六阶段事故处置流程增加可真实运行的多模态 LLM Runtime。

## 1. 背景与范围

当前 PayGuard 已具备六阶段端到端 Mock Runtime：智能核验、定位分析、商户触达、故障升级、恢复判断和评测回流。Mock 路径适合稳定讲解，但尚未调用真实模型。

本次新增第二条完整路径：六个阶段均调用真实 LLM。其中智能核验同时接收结构化事故数据和监控截图，展示模型的多模态理解能力；其余阶段基于当前事故、前序结构化输出和阶段证据完成推理。两条路径共享同一个 `IncidentRuntime` 契约和同一套 UI。

本次范围包括：

- 从 `D:\Data\Desktop\d2c-agent-workbench\.env` 迁移本地 LLM 配置至当前项目。
- 保留现有 Mock Runtime 和全部 Mock 黄金路径能力。
- 新增服务端真实 LLM Client、真实 Runtime API 和客户端 Runtime Adapter。
- 六阶段全部使用真实 LLM，智能核验支持内置合成截图和用户上传替换。
- 增加运行模式切换、模型/图片来源标记、真实调用 Trace、重试和切回 Mock。
- 增加 Schema 校验、安全防护、自动测试和真实端到端验收。

不在本次范围内：

- 云端部署、Site 发布或托管密钥。
- 对接真实支付宝监控、商户、工单、On-call 或消息系统。
- 长期保存用户上传图片或真实 LLM Run。
- 自动训练、微调模型或建立向量数据库。

## 2. 关键产品原则

1. **Mock 与真实路径同等完整。** Mock 仍可从 0/6 演示到 6/6，不依赖网络和密钥。
2. **真实结果不被 Mock 冒充。** 真实调用失败时显示失败，不自动用 Mock 输出伪装成功。
3. **一次点击只推进一个业务步骤。** 真实模式沿用当前讲解式交互和人工审批门槛。
4. **结果必须结构化且可校验。** 前端不直接消费自由文本；服务端先验证 LLM 输出，再构建 `StageExecution`。
5. **只展示可审计依据。** 展示输入证据、工具调用和结构化决策因子，不展示隐藏思维链。
6. **密钥只存在于服务端。** 浏览器、HTML、客户端 Bundle、Trace、日志和错误响应均不得包含密钥。

## 3. 方案选择

### 3.1 采用方案：Vinext 服务端 LLM Runtime

在当前项目内部新增服务端 Route Handler。服务端读取 `.env.local`，调用 Anthropic-compatible 多模态端点，并把通过 Schema 校验的结果映射为现有 Runtime 契约。

优点：

- 单项目、单启动命令，适合本地演示。
- 密钥不会进入浏览器。
- Mock 与真实 Runtime 可共享类型、状态机、UI 和评测转换。
- 后续更换模型或真实工具时只需替换 Adapter。

### 3.2 未采用方案

- **浏览器直连：** 会暴露密钥，并受 CORS、浏览器日志和扩展程序影响。
- **独立本地服务：** 边界清晰，但需要同时启动两套服务，对当前 Demo 过重。

## 4. 总体架构

```text
GuidedIncidentDemo
        │
        ├──────── mode=mock ────────► MockIncidentRuntime
        │                                │
        │                                └─ deterministic scenario
        │
        └──────── mode=llm ─────────► LlmIncidentRuntime
                                         │ HTTP
                                         ▼
                              /api/runtime/incidents/*
                                         │
                              ServerIncidentOrchestrator
                                         │
                 ┌───────────────────────┴──────────────────────┐
                 ▼                                              ▼
        MultimodalLlmClient                          Stage schemas/prompts
                 │
                 ▼
      Anthropic-compatible endpoint
```

### 4.1 共享契约

继续使用 `IncidentRuntime`：

- `createIncident`
- `executeStage`
- `approveAction`
- `rejectAction`
- `getRun`
- `resetRun`

新增的 `LlmIncidentRuntime` 是客户端 HTTP Adapter。前端组件不根据 Provider 分叉业务逻辑，只根据 `run.mode` 和 Trace 元数据展示状态。

### 4.2 服务端状态

真实 Run 存储在服务端进程内存 `Map` 中，适合本地开发与演示：

- 不写入浏览器 `localStorage`。
- 不跨服务重启恢复。
- 不记录图片原始内容、密钥或完整上游响应。
- 重启服务后重新创建真实 Run。

Mock Run 继续使用当前浏览器本地恢复策略。

## 5. 环境变量与密钥迁移

源文件包含三个变量：`key`、`url`、`model`。实施时安全复制到当前项目 `.env.local`，保持变量值不变，并在服务端归一化为内部配置：

```ts
interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}
```

规则：

- `.env.local` 必须被 `.gitignore` 的 `.env*` 覆盖。
- 不把变量改为 `NEXT_PUBLIC_*`。
- 不在测试快照、日志、Trace、错误消息或 README 中写入实际值。
- 启动时仅暴露 `configured: boolean`、脱敏模型名和 Provider 类型。
- 缺少任一变量时，真实模式入口显示“未配置”，Mock 不受影响。

## 6. 多模态输入

### 6.1 图片来源

智能核验支持两种图片来源：

1. **内置合成监控截图：** 项目提供固定 PNG，展示支付成功率、P95 延迟、超时错误码和时间窗口。
2. **用户上传替换：** 支持 PNG、JPEG、WebP；上传后仅保存在当前浏览器会话。

默认使用内置截图。用户上传后，页面显示文件名、缩略图、类型和大小，并把它作为本次真实 Run 的核验图片。

### 6.2 限制

- 最大 4 MB。
- 仅允许 `image/png`、`image/jpeg`、`image/webp`。
- 客户端先校验类型和大小；服务端再次校验 Data URL 媒体类型和解码后大小。
- 图片不写入磁盘、Local Storage、Git、Trace 或日志。
- 后续五个阶段不重复发送图片，只消费核验阶段的结构化视觉结论，减少成本和上下文污染。

### 6.3 上游消息格式

智能核验的用户消息由一个图片块和一个文本块组成：

```json
[
  {
    "type": "image",
    "source": {
      "type": "base64",
      "media_type": "image/png",
      "data": "<base64>"
    }
  },
  {
    "type": "text",
    "text": "<事故指标、告警上下文和输出约束>"
  }
]
```

## 7. 六阶段真实执行设计

每个阶段都有独立的输入投影、System Prompt、Tool Schema 和结果映射。Prompt 不允许模型自行发起外部副作用，所有所谓 Metrics、Logs、Ticket 等工具均是当前 Demo 的证据命名和结构化调用记录。

### 7.1 智能核验 `verify`

输入：

- 监控截图。
- 商户、事故标题、等级、影响金额、发现时间。
- 支付成功率、P95 延迟、TIMEOUT 增长和观察窗口。

输出：

- `isIncident: boolean`
- `severity: P0 | P1 | P2`
- `confidence: number`
- `impactScope: string`
- `visualFindings: string[]`
- `decisionFactors[]`

要求模型把截图可见趋势与结构化指标交叉核验，不能仅凭截图文字作结论。

### 7.2 定位分析 `locate`

输入：

- 核验结果。
- 日志摘要、变更记录和历史 Case RAG 摘要。

输出：

- `topCause`
- `alternatives[]`
- `evidenceRefs[]`
- `recommendedActions[]`
- `decisionFactors[]`

根因必须引用输入中的证据 ID，不能生成不存在的日志或变更。

### 7.3 商户触达 `contact`

输入：

- 已确认根因、影响范围、商户等级、偏好渠道和建议动作。

输出：

- `subject`
- `message`
- `actionLinkLabel`
- `channels[]`
- `decisionFactors[]`

此阶段执行后 Run 进入 `awaiting_approval`。只有用户点击“批准并发送”后才完成该阶段并进入升级；拒绝则进入 `needs_human`。

### 7.4 故障升级 `escalate`

输入：

- 事故等级、影响金额、已批准触达结果和升级策略。

输出：

- `ticketTitle`
- `teams[]`
- `sla`
- `escalationReason`
- `decisionFactors[]`

真实 LLM 只生成升级方案，不调用真实工单或 On-call 服务。输出明确标记 `simulatedAction: true`。

### 7.5 恢复判断 `recover`

输入：

- 三个连续监控窗口的成功率、P95 延迟和 TIMEOUT 指标。
- 根因修复动作和事故前基线。

输出：

- `recovered: boolean`
- `stableWindows: number`
- `residualRisk`
- `observationAdvice`
- `decisionFactors[]`

恢复必须基于连续窗口和基线差异，不允许单点回弹直接闭环。

### 7.6 评测回流 `evaluate`

输入：

- 六阶段 Trace、最终恢复事实、人工审批结果和预测根因。

输出：

- `sampleId`
- `verifyLabel`
- `predictedRootCause`
- `finalRootCause`
- `humanCorrected`
- `dataset`
- `qualityChecks[]`

完成后生成当前 `EvaluationSample`，并显示在 AI 评测页顶部。

## 8. LLM Client 与响应协议

### 8.1 请求

沿用源项目的 Anthropic-compatible 调用方式：

- `POST {baseUrl}/v1/messages`
- Header：`x-api-key`、`anthropic-version`、`content-type`
- 使用强制 Tool Call 返回结构化结果。
- 每阶段单独设置 Tool Schema。
- 默认超时 30 秒；用户可以重试当前阶段。

### 8.2 响应校验

服务端按以下顺序处理：

1. 检查 HTTP 状态。
2. 查找预期 `tool_use` 块。
3. 使用阶段 Schema 校验 `tool_use.input`。
4. 对置信度、数组长度和字符串长度做边界检查。
5. 过滤不可审计或未知字段。
6. 映射为 `StageExecution`。

原始上游响应不返回前端，也不写日志。

### 8.3 指标

真实执行记录：

- 上游请求耗时。
- `input_tokens`、`output_tokens`。
- 模型名称。
- Provider：`real_llm`。
- 图片来源：`built_in` 或 `uploaded`（仅核验阶段）。
- 成本为基于可配置单价的演示估算；若未配置单价则显示“未估算”，不伪造精确费用。

## 9. API 设计

```text
GET    /api/runtime/config
POST   /api/runtime/incidents
GET    /api/runtime/incidents/:runId
POST   /api/runtime/incidents/:runId/stages/:stage
POST   /api/runtime/incidents/:runId/actions/:actionId/approve
POST   /api/runtime/incidents/:runId/actions/:actionId/reject
POST   /api/runtime/incidents/:runId/reset
```

`GET /api/runtime/config` 仅返回：

```json
{
  "configured": true,
  "provider": "anthropic-compatible",
  "model": "<safe model label>",
  "multimodal": true
}
```

核验阶段请求可额外包含：

```json
{
  "image": {
    "mediaType": "image/png",
    "data": "<base64>",
    "source": "uploaded"
  }
}
```

其余阶段请求体为空，由服务端基于 Run 状态构建上下文，避免客户端篡改前序结果。

## 10. 状态机与一致性

真实 Runtime 复用 Mock 的合法转换规则：

- 只能执行 `currentStage`。
- 一次请求只生成一个 `StageExecution`。
- 商户触达未审批时禁止升级。
- 已完成 Run 禁止继续执行。
- 失败不推进 `currentStage`，保留此前 `executions`。
- 重试只覆盖当前失败尝试，不覆盖已完成阶段。
- 切回 Mock 会新建一个 Mock Run，不把真实输出混入 Mock Trace。

为避免 Mock 和真实状态机漂移，合法转换抽为共享纯函数或共享状态机模块；两个 Runtime 只负责获取阶段结果和保存 Run。

## 11. 前端交互

### 11.1 模式切换

处置演示页增加明确的二选一：

- `Mock 演示`
- `真实 LLM`

默认仍为 Mock。切换模式会提示新建对应 Run，不复用另一模式的进度。

真实模式入口同时显示：

- 配置状态。
- 模型安全标签。
- `MULTIMODAL` 标记。
- 当前图片来源。

### 11.2 图片控件

仅在真实模式、核验阶段显示：

- 内置监控截图缩略图。
- “替换图片”上传控件。
- 文件名、媒体类型和大小。
- “恢复内置截图”操作。

### 11.3 执行状态

真实调用期间：

- 主按钮显示 `真实 LLM 正在执行…`。
- 页面设置 `aria-busy=true`。
- 禁止重复提交和切换历史步骤。
- 超过 2 秒显示“模型正在分析图片/证据”的非确定性进度文案，不伪造百分比。

### 11.4 Trace 标识

每个真实阶段显示：

- `REAL LLM` 徽标。
- 模型名。
- 请求耗时和 Token。
- 核验阶段的图片来源。

Mock 阶段显示 `MOCK`，避免两类输出混淆。

## 12. 错误处理

错误类型：

| 错误码 | 场景 | UI 行为 |
| --- | --- | --- |
| `LLM_NOT_CONFIGURED` | 环境变量缺失 | 禁用真实启动，提示检查 `.env.local` |
| `LLM_UNAUTHORIZED` | 401/403 | 保留 Trace，可重试或切回 Mock |
| `LLM_RATE_LIMITED` | 429 | 显示限流，允许稍后重试 |
| `LLM_TIMEOUT` | AbortController 超时 | 保留当前步骤，允许重试 |
| `LLM_UPSTREAM_ERROR` | 网络或 5xx | 显示上游不可用，不推进流程 |
| `LLM_NO_TOOL` | 无预期 Tool Call | 标记响应不可解析，允许重试 |
| `LLM_INVALID_OUTPUT` | Schema 校验失败 | 不返回原始响应，允许重试 |
| `IMAGE_INVALID` | 类型、大小或 Base64 非法 | 不发起 LLM 请求 |

错误响应只包含安全错误码、用户可读消息和 `retryable`，不包含请求 Header、密钥、完整图片或上游响应正文。

## 13. 安全设计

- 所有 LLM 调用只在服务端执行。
- `.env.local` 不提交。
- 对 `baseUrl` 做绝对 HTTPS URL 校验；本地测试通过依赖注入使用 Mock Fetch。
- 图片只接受固定媒体类型，限制解码后大小。
- Prompt 只接收白名单字段，避免把整个浏览器状态或文件系统内容发送给模型。
- 上游错误正文不直接透传。
- 日志只记录 Run ID、阶段、状态、耗时和安全错误码。
- 最终执行 `git grep` 和历史差异扫描，确认 key、完整 URL 值和 Base64 图片未进入提交。

## 14. 测试策略

### 14.1 单元测试

- 环境配置存在、缺失和 URL 非法。
- 多模态消息包含正确图片块和文本块。
- 六个阶段分别使用正确 Tool Schema。
- 正常响应映射为 `StageExecution`。
- 无 Tool Call、Schema 错误、401/403、429、5xx、超时和网络失败。
- 错误消息不包含 key、Header 或上游正文。
- 图片类型、Base64 和大小校验。

### 14.2 Runtime 测试

- 真实模式一次只推进一个阶段。
- 商户触达后必须审批。
- 失败不推进且可重试。
- 切回 Mock 创建独立 Run。
- Mock 原有全部测试继续通过。

### 14.3 组件测试

- 默认 Mock，真实模式明确可选。
- 未配置时禁用真实启动。
- 图片上传与恢复内置图片。
- `REAL LLM` / `MOCK`、模型名和图片来源显示正确。
- 错误后显示重试与切回 Mock。
- 未来阶段输出仍不可见。

### 14.4 真实验收

使用迁移后的真实配置执行：

1. 内置监控截图完成智能核验。
2. 完成定位分析。
3. 生成商户触达并人工批准。
4. 完成故障升级。
5. 完成恢复判断。
6. 完成评测回流并在 AI 评测页看到本次样本。
7. 上传一张替换图片，重新核验并确认图片来源为 `uploaded`。
8. 重置并完整走通 Mock 黄金路径。

最终运行测试、类型检查、Lint、生产构建、生产依赖审计和密钥扫描。

## 15. 文件规划

预计新增或修改：

```text
.env.local                                      # 本地复制，不提交
public/mock/merchant-monitor.png                # 内置合成监控截图
lib/runtime/types.ts                            # mode/provider/真实指标类型
lib/runtime/llm-client.ts                       # Anthropic-compatible 多模态 Client
lib/runtime/llm-schemas.ts                      # 六阶段 Schema 与 Tool 定义
lib/runtime/llm-prompts.ts                      # 六阶段 Prompt 与上下文投影
lib/runtime/server-orchestrator.ts              # 服务端真实 Run 状态机
lib/runtime/llm-runtime.ts                      # 客户端 HTTP Adapter
app/api/runtime/config/route.ts                 # 安全配置状态
app/api/runtime/incidents/.../route.ts          # Runtime API
components/demo/RuntimeModeSwitch.tsx           # Mock / 真实 LLM
components/demo/IncidentImageInput.tsx          # 内置/上传图片
components/demo/useIncidentDemo.ts              # Runtime 切换与真实错误状态
components/demo/GuidedIncidentDemo.tsx          # 模式、模型和来源展示
components/demo/StageWorkspace.tsx              # REAL LLM Trace 元数据
app/globals.css                                 # 模式与上传控件样式
README.md                                       # 本地配置与双路径说明
docs/demo-script.md                             # Mock/真实双路线讲解
```

Route 文件可根据 Vinext 对动态 Route Handler 的实际兼容性合并为少量静态端点；对外 Runtime 契约保持不变。

## 16. 完成标准

只有同时满足以下条件才视为完成：

- Mock 六阶段演示完整可用，现有回归测试全部通过。
- 真实 LLM 六阶段均产生通过 Schema 校验的结构化输出。
- 智能核验确实向模型发送图片块，并支持内置与上传图片。
- 商户触达审批门槛在两种模式下均生效。
- 真实失败不被 Mock 结果替代，当前步骤可重试。
- 密钥未进入客户端、日志、Trace、提交或 GitHub。
- 桌面、平板和移动端均可操作，无控制台错误和页面横向溢出。
- 测试、类型检查、Lint、构建、生产依赖审计与密钥扫描全部通过。
- 仍然只在本地 `localhost` 运行，不发布 Site。
