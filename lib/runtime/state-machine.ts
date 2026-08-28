import {
  stageOrder,
  type IncidentRun,
  type IncidentStage,
  type StageExecution,
} from './types';

// 恢复判断允许的最大执行次数：真实模型可能持续判「未稳定」，触顶转人工而不是无限重入。
export const MAX_RECOVER_ATTEMPTS = 3;

// 单次阶段执行后的走向：由阶段 output 决定，mock 与真实 LLM 共用同一套判定。
export interface NextStep {
  kind: 'advance' | 'stay' | 'needs_human' | 'completed';
  nextStage?: IncidentStage;
  // 本次执行是否把当前阶段计入 completedStages：重入/跳过阶段不算完成。
  completes: boolean;
  skipped?: IncidentStage[];
  humanReason?: string;
}

export function resolveNextStep(
  stage: IncidentStage,
  output: Record<string, unknown>,
  attempt: number,
): NextStep {
  // 误报短路：核验判定非真实故障时，直接进入评测回流（沉淀 TN 样本），中间四步跳过。
  if (stage === 'verify' && output.isIncident === false) {
    return {
      kind: 'advance',
      nextStage: 'evaluate',
      completes: true,
      skipped: ['locate', 'contact', 'escalate', 'recover'],
    };
  }
  // 恢复重入：未稳定则停留在恢复判断，下一次执行带新观测窗口；触顶转人工。
  if (stage === 'recover' && output.recovered === false) {
    if (attempt < MAX_RECOVER_ATTEMPTS) return { kind: 'stay', nextStage: 'recover', completes: false };
    return {
      kind: 'needs_human',
      completes: false,
      humanReason: `恢复判断连续 ${MAX_RECOVER_ATTEMPTS} 次未达稳定标准（存在回弹），已转人工确认恢复。`,
    };
  }
  const next = stageOrder[stageOrder.indexOf(stage) + 1];
  if (!next) return { kind: 'completed', completes: true };
  return { kind: 'advance', nextStage: next, completes: true };
}

// 记录一次阶段执行：executions 保留每阶段最新，attempts 追加保留全部历史。
export function recordExecution(run: IncidentRun, stage: IncidentStage, execution: StageExecution) {
  run.executions[stage] = execution;
  run.attempts = [...(run.attempts ?? []), execution];
  run.stageAttempts = { ...run.stageAttempts, [stage]: (run.stageAttempts?.[stage] ?? 0) + 1 };
}

// 依据当前阶段 output 推进 run 状态：完成/跳过/停留/转人工统一在这里落地。
export function advanceRun(run: IncidentRun, stage: IncidentStage) {
  const step = resolveNextStep(stage, run.executions[stage]?.output ?? {}, run.stageAttempts?.[stage] ?? 1);
  if (step.completes && !run.completedStages.includes(stage)) run.completedStages.push(stage);
  if (step.skipped) run.skippedStages = step.skipped;
  if (step.kind === 'completed') {
    run.status = 'completed';
    run.currentStage = stage;
    return;
  }
  if (step.kind === 'needs_human') {
    run.status = 'needs_human';
    run.humanReason = step.humanReason;
    return;
  }
  run.status = 'running';
  if (step.nextStage) run.currentStage = step.nextStage;
}

// 本次 run 计划执行的阶段数：误报短路后从 6 变 2，totals 的分母据此展示。
export function plannedStageCount(run: IncidentRun): number {
  return stageOrder.length - (run.skippedStages?.length ?? 0);
}

// 重入产生的额外执行次数。不要用 attempts.length - completedStages.length：
// 审批挂起时 contact 已执行未完成，会被误算成一次重试。
export function retryCount(run: IncidentRun): number {
  return Object.values(run.stageAttempts ?? {}).reduce((sum, count) => sum + Math.max(0, (count ?? 0) - 1), 0);
}

// 即将开始的这一次是第几次尝试（1 起）。
export function nextAttempt(run: IncidentRun, stage: IncidentStage): number {
  return (run.stageAttempts?.[stage] ?? 0) + 1;
}
