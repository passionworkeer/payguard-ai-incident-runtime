export const stageOrder = [
  'verify',
  'locate',
  'contact',
  'escalate',
  'recover',
  'evaluate',
] as const;

export type IncidentStage = (typeof stageOrder)[number];
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
  incident: IncidentSummaryData;
  status: RunStatus;
  currentStage: IncidentStage;
  completedStages: IncidentStage[];
  executions: Partial<Record<IncidentStage, StageExecution>>;
  pendingApproval?: { id: string; stage: 'contact'; label: string };
  humanReason?: string;
}

export interface RuntimeScenario {
  id: string;
  incident: IncidentSummaryData;
  stages: Record<IncidentStage, StageExecution>;
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
