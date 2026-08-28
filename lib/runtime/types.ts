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

export interface StageExecution {
  stage: IncidentStage;
  title: string;
  goal: string;
  input: Record<string, unknown>;
  events: RuntimeEvent[];
  decisionFactors: DecisionFactor[];
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
  imageSource?: 'built_in' | 'uploaded';
  costEstimated?: boolean;
}

export interface IncidentSummaryData {
  merchant: string;
  severity: 'P0' | 'P1' | 'P2';
  impact: string;
  title: string;
  detectedAt: string;
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
  // verify 阶段的监控截图（真实模式多模态输入）。
  monitorImage: string;
  // mock 模式的预期执行路径（重入阶段重复出现）；真实模式路径由模型输出决定。
  expectedPath: IncidentStage[];
  incident: IncidentSummaryData;
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
