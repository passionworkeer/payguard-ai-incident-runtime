export const stageOrder = [
  'verify',
  'locate',
  'contact',
  'escalate',
  'recover',
  'evaluate',
] as const;

export type IncidentStage = (typeof stageOrder)[number];
export type RuntimeMode = 'mock' | 'llm';
export type RunStatus =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'needs_human'
  | 'failed'
  | 'completed';

export interface RuntimeEvent {
  id: string;
  type:
    | 'stage_started'
    | 'tool_call_started'
    | 'tool_call_completed'
    | 'tool_call_failed'
    | 'decision_ready'
    | 'approval_required'
    | 'stage_completed';
  at: string;
  label: string;
  detail: string;
  durationMs?: number;
}

export interface DecisionFactor {
  label: string;
  value: string;
  evidence: string;
}

// 工具分类：决定 UI 渲染（左侧 SVG icon / 配色 / 是否画迷你图）。
export type ToolCategory =
  | 'metrics'      // metrics.query：成功率/延迟/QPS/错误码 时序
  | 'alert'        // alerts.context_fetch：合并告警 + 同环比
  | 'log'          // logs.search：错误日志检索
  | 'change'       // change_records.list：变更记录
  | 'case'         // case_rag.retrieve：历史相似案例 RAG
  | 'cert'         // cert.inspector：商户证书检查
  | 'channel'      // channel.health：渠道健康度
  | 'error'        // error_analyzer：错误码集中度分析
  | 'calendar'     // promotion.calendar：大促日历
  | 'merchant'     // merchant.profile：商户画像
  | 'message'      // message.composer：消息起草
  | 'policy'       // policy.engine：升级策略匹配
  | 'oncall'       // oncall.directory：值班团队查找
  | 'ticket'       // ticket.create：工单/跟进单创建
  | 'eval'         // eval.store：评测样本写入
  | 'metric';     // metric.calculator：效果指标刷新

// 可视化提示：UI 见到该值时，在工具卡片里渲染对应迷你图。
export type ToolChartHint =
  | 'metric_trend'        // metrics 时序：成功率/P95/QPS 折线 + 基线 markLine
  | 'channel_breakdown'   // 渠道拆分：堆叠条或饼图
  | 'log_excerpt'         // 日志检索：代码块风格的命中行
  | 'change_timeline'     // 变更列表：时间轴
  | 'case_similarity'    // Case RAG：相似度排序
  | 'flag_summary';     // 其他：仅显示摘要 + flag 状态

// 工具调用：AI 在阶段内对内部 API 的结构化调用记录。Mock 与真实模式共用同一形状。
export interface ToolCall {
  // 唯一标识，如 "metrics.query" / "logs.search"
  name: string;
  // UI 显示名（中文）
  displayName: string;
  // 工具分类（驱动左侧 SVG icon）
  category: ToolCategory;
  // 工具输入参数（结构化）
  input: Record<string, unknown>;
  // 工具返回结果（结构化）
  output: Record<string, unknown>;
  // 调用耗时 ms
  latencyMs: number;
  // 调用状态
  status: 'success' | 'partial' | 'failed';
  // 工具自身是否检出异常（独立于阶段 output.isIncident：让招聘方看到"多源信号聚合"）
  flagged: boolean;
  // 异常/正常理由
  flagReason?: string;
  // 可选：可视化提示
  chartHint?: ToolChartHint;
}

export interface IncidentSummaryData {
  merchant: string;
  severity: 'P0' | 'P1' | 'P2';
  impact: string;
  title: string;
  detectedAt: string;
}

export interface StageExecution {
  stage: IncidentStage;
  title: string;
  goal: string;
  // 阶段上下文（事故基本属性 + 阶段专属参数）。与 tools 解耦：tools 才是 AI 触发的真实 API。
  context: Record<string, unknown>;
  // 工具调用列表：每个阶段一次调用 1-4 个内部接口
  tools: ToolCall[];
  events: RuntimeEvent[];
  decisionFactors: DecisionFactor[];
  // AI 最终结构化输出（与工具 output 区分：这是综合多源信号后的结论）
  output: Record<string, unknown>;
  metrics: {
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    costYuan: number;
    confidence: number;
    toolCalls: number;
    evidenceCount: number;
  };
  gate: string;
  successMetric: string;
  risk: string;
  fallback: string;
  requiresApproval?: boolean;
  provider?: 'mock' | 'real_llm';
  model?: string;
  costEstimated?: boolean;
}

export interface IncidentRun {
  id: string;
  scenarioId: string;
  mode: RuntimeMode;
  incident: IncidentSummaryData;
  status: RunStatus;
  currentStage: IncidentStage;
  completedStages: IncidentStage[];
  executions: Partial<Record<IncidentStage, StageExecution>>;
  // 追加型执行流水：恢复重入时 executions 只留每阶段最新一次，累计指标从这里取才不丢历史。
  attempts?: StageExecution[];
  // 每阶段执行次数：恢复重入等分支需要知道当前是第几次尝试。
  stageAttempts?: Partial<Record<IncidentStage, number>>;
  // 误报短路时跳过的阶段：跳过 ≠ 已完成，不进 completedStages。
  skippedStages?: IncidentStage[];
  pendingApproval?: { id: string; stage: 'contact'; label: string };
  humanReason?: string;
}

// 场景标准答案：评测判分（TP/TN/FP/FN 与根因命中）的对照基准。
export interface GroundTruth {
  isIncident: boolean;
  severity: 'P0' | 'P1' | 'P2';
  rootCause: string;
  // 与 rootCause 等价的可接受表述：真实模型措辞不同不判错。
  acceptableCauses: string[];
  // 关键词全部命中也算 Top-1 命中：容忍模型自由措辞。
  rootCauseKeywords: string[];
  recovered: boolean;
}

export interface RuntimeScenario {
  id: string;
  // 场景选择器短名与一句话讲解。
  label: string;
  summary: string;
  // 事故中心对应行的事故 ID：双向跳转对齐。
  incidentId: string;
  // mock 模式的预期执行路径（重入阶段重复出现）；真实模式路径由模型输出决定。
  expectedPath: IncidentStage[];
  incident: IncidentSummaryData;
  // 阶段 fixture 表：每个阶段一次调用 1-4 个内部接口工具。
  stages: Record<IncidentStage, StageExecution>;
  // 重入阶段（如恢复判断第 2 次）的替换 fixture：按 attempt 顺序取用，超界复用最后一个。
  // 真实模式尤其依赖：不换观测窗口输入，模型会一直判「未稳定」直到触顶转人工。
  retryStages?: Partial<Record<IncidentStage, StageExecution[]>>;
  groundTruth: GroundTruth;
}

export interface IncidentRuntime {
  restoreRun?(run: IncidentRun): IncidentRun;
  createIncident(scenarioId: string): Promise<IncidentRun>;
  executeStage(
    runId: string,
    stage: IncidentStage,
  ): Promise<{ run: IncidentRun; execution: StageExecution }>;
  approveAction(runId: string, actionId: string): Promise<IncidentRun>;
  rejectAction(
    runId: string,
    actionId: string,
    reason: string,
  ): Promise<IncidentRun>;
  getRun(runId: string): Promise<IncidentRun>;
  resetRun(runId: string): Promise<IncidentRun>;
}