import { describe, expect, it } from 'vitest';
import {
  advanceRun,
  MAX_RECOVER_ATTEMPTS,
  nextAttempt,
  plannedStageCount,
  recordExecution,
  resolveNextStep,
  retryCount,
} from './state-machine';
import type { IncidentRun, IncidentStage, StageExecution } from './types';

function makeExecution(stage: IncidentStage, output: Record<string, unknown>): StageExecution {
  return {
    stage,
    title: `${stage} 测试`,
    goal: '测试',
    input: {},
    events: [],
    decisionFactors: [],
    output,
    metrics: { latencyMs: 100, inputTokens: 10, outputTokens: 10, costYuan: 0.01, confidence: 90, toolCalls: 1, evidenceCount: 1 },
    gate: '',
    successMetric: '',
    risk: '',
    fallback: '',
  };
}

function makeRun(): IncidentRun {
  return {
    id: 'RUN-test',
    scenarioId: 'gateway-timeout',
    mode: 'mock',
    incident: { merchant: '测试商户', severity: 'P0', impact: '¥1万', title: '测试', detectedAt: '2026-08-26 14:00:00' },
    status: 'idle',
    currentStage: 'verify',
    completedStages: [],
    executions: {},
  };
}

function executeAndAdvance(run: IncidentRun, stage: IncidentStage, output: Record<string, unknown>) {
  recordExecution(run, stage, makeExecution(stage, output));
  advanceRun(run, stage);
}

describe('resolveNextStep', () => {
  it('advances linearly for confirmed incidents', () => {
    expect(resolveNextStep('verify', { isIncident: true }, 1)).toMatchObject({ kind: 'advance', nextStage: 'locate', completes: true });
    expect(resolveNextStep('locate', {}, 1)).toMatchObject({ kind: 'advance', nextStage: 'contact', completes: true });
    expect(resolveNextStep('recover', { recovered: true }, 1)).toMatchObject({ kind: 'advance', nextStage: 'evaluate', completes: true });
  });

  it('short-circuits to evaluate on false alarm and marks the middle stages skipped', () => {
    const step = resolveNextStep('verify', { isIncident: false }, 1);
    expect(step).toMatchObject({ kind: 'advance', nextStage: 'evaluate', completes: true });
    expect(step.skipped).toEqual(['locate', 'contact', 'escalate', 'recover']);
  });

  it('stays on recover for a rebound below the attempt cap without completing it', () => {
    expect(resolveNextStep('recover', { recovered: false }, 1)).toMatchObject({ kind: 'stay', nextStage: 'recover', completes: false });
    expect(resolveNextStep('recover', { recovered: false }, MAX_RECOVER_ATTEMPTS - 1)).toMatchObject({ kind: 'stay' });
  });

  it('hands over to human with a reason once recover attempts hit the cap', () => {
    const step = resolveNextStep('recover', { recovered: false }, MAX_RECOVER_ATTEMPTS);
    expect(step.kind).toBe('needs_human');
    expect(step.completes).toBe(false);
    expect(step.humanReason).toContain(String(MAX_RECOVER_ATTEMPTS));
  });

  it('completes the run after evaluate', () => {
    expect(resolveNextStep('evaluate', {}, 1)).toMatchObject({ kind: 'completed', completes: true });
  });
});

describe('advanceRun + recordExecution', () => {
  it('walks the full linear path to completed', () => {
    const run = makeRun();
    executeAndAdvance(run, 'verify', { isIncident: true });
    executeAndAdvance(run, 'locate', {});
    executeAndAdvance(run, 'contact', {});
    executeAndAdvance(run, 'escalate', {});
    executeAndAdvance(run, 'recover', { recovered: true });
    executeAndAdvance(run, 'evaluate', {});

    expect(run.status).toBe('completed');
    expect(run.completedStages).toEqual(['verify', 'locate', 'contact', 'escalate', 'recover', 'evaluate']);
    expect(run.skippedStages).toBeUndefined();
    expect(retryCount(run)).toBe(0);
    expect(plannedStageCount(run)).toBe(6);
  });

  it('completes a false-alarm run in two stages with four skipped', () => {
    const run = makeRun();
    executeAndAdvance(run, 'verify', { isIncident: false });

    expect(run.currentStage).toBe('evaluate');
    expect(run.completedStages).toEqual(['verify']);
    expect(run.skippedStages).toEqual(['locate', 'contact', 'escalate', 'recover']);
    expect(plannedStageCount(run)).toBe(2);

    executeAndAdvance(run, 'evaluate', {});
    expect(run.status).toBe('completed');
    // 跳过的阶段永不进 completedStages：持久化层的重叠不变量依赖这一点。
    expect(run.completedStages).toEqual(['verify', 'evaluate']);
  });

  it('re-enters recover on rebound and completes on a later stable attempt', () => {
    const run = makeRun();
    run.currentStage = 'recover';
    run.completedStages = ['verify', 'locate', 'contact', 'escalate'];

    executeAndAdvance(run, 'recover', { recovered: false, stableWindows: 1 });
    expect(run.status).toBe('running');
    expect(run.currentStage).toBe('recover');
    expect(run.completedStages).not.toContain('recover');
    expect(nextAttempt(run, 'recover')).toBe(2);

    executeAndAdvance(run, 'recover', { recovered: true, stableWindows: 3 });
    expect(run.currentStage).toBe('evaluate');
    expect(run.completedStages).toContain('recover');
    expect(retryCount(run)).toBe(1);
    // executions 只留最新，attempts 保留两次历史。
    expect(run.executions.recover?.output.recovered).toBe(true);
    expect(run.attempts?.filter((item) => item.stage === 'recover')).toHaveLength(2);
  });

  it('turns needs_human with a visible reason after the recover cap', () => {
    const run = makeRun();
    run.currentStage = 'recover';
    run.completedStages = ['verify', 'locate', 'contact', 'escalate'];
    for (let attempt = 1; attempt <= MAX_RECOVER_ATTEMPTS; attempt += 1) {
      executeAndAdvance(run, 'recover', { recovered: false });
    }

    expect(run.status).toBe('needs_human');
    expect(run.currentStage).toBe('recover');
    expect(run.humanReason).toContain('转人工');
    expect(retryCount(run)).toBe(MAX_RECOVER_ATTEMPTS - 1);
  });

  it('does not count an executed-but-unapproved contact as a retry', () => {
    const run = makeRun();
    executeAndAdvance(run, 'verify', { isIncident: true });
    executeAndAdvance(run, 'locate', {});
    // contact 已执行但审批挂起：不调用 advanceRun，模拟 awaiting_approval。
    recordExecution(run, 'contact', makeExecution('contact', {}));

    expect(retryCount(run)).toBe(0);
  });
});
