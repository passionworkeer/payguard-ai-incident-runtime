import { describe, expect, it } from 'vitest';
import { MockIncidentRuntime } from './mock-runtime';

async function runtimeAtContact() {
  const runtime = new MockIncidentRuntime();
  const created = await runtime.createIncident('gateway-timeout');
  await runtime.executeStage(created.id, 'verify');
  await runtime.executeStage(created.id, 'locate');
  await runtime.executeStage(created.id, 'contact');
  return { runtime, runId: created.id };
}

describe('MockIncidentRuntime', () => {
  it('executes exactly one stage per call', async () => {
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('gateway-timeout');

    const verified = await runtime.executeStage(created.id, 'verify');

    expect(verified.run.currentStage).toBe('locate');
    expect(verified.run.completedStages).toEqual(['verify']);
    expect(verified.execution.stage).toBe('verify');
    expect(verified.run.executions.locate).toBeUndefined();
  });

  it('rejects skipped stages', async () => {
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('gateway-timeout');

    await expect(runtime.executeStage(created.id, 'locate')).rejects.toThrow(
      'stage_out_of_order',
    );
  });

  it('requires contact approval before escalation', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);

    expect(paused.status).toBe('awaiting_approval');
    expect(paused.currentStage).toBe('contact');
    await expect(runtime.executeStage(runId, 'escalate')).rejects.toThrow(
      'approval_required',
    );
  });

  it('advances to escalation after approval', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);

    const approved = await runtime.approveAction(
      runId,
      paused.pendingApproval!.id,
    );

    expect(approved.status).toBe('running');
    expect(approved.currentStage).toBe('escalate');
    expect(approved.completedStages).toContain('contact');
  });

  it('moves to human handling when contact is rejected', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);

    const rejected = await runtime.rejectAction(
      runId,
      paused.pendingApproval!.id,
      '商户要求电话沟通',
    );

    expect(rejected.status).toBe('needs_human');
    expect(rejected.humanReason).toBe('商户要求电话沟通');
  });

  it('blocks further execution and approval after a rejection', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);
    const rejected = await runtime.rejectAction(runId, paused.pendingApproval!.id, '转人工');

    await expect(runtime.executeStage(runId, 'contact')).rejects.toThrow('human_handling_required');
    await expect(runtime.executeStage(runId, 'escalate')).rejects.toThrow('human_handling_required');
    await expect(runtime.approveAction(runId, rejected.pendingApproval?.id ?? 'missing')).rejects.toThrow('approval_not_found');
  });

  it('resets to a fresh run from the verification stage', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);
    await runtime.approveAction(runId, paused.pendingApproval!.id);
    await runtime.executeStage(runId, 'escalate');

    const fresh = await runtime.resetRun(runId);

    expect(fresh).toMatchObject({ status: 'idle', currentStage: 'verify', completedStages: [], executions: {} });
    expect(fresh.id).not.toBe(runId);
    expect(fresh.humanReason).toBeUndefined();
    expect(fresh.pendingApproval).toBeUndefined();
    await expect(runtime.getRun(runId)).rejects.toThrow('run_not_found');
  });

  it('rejects prototype-chain scenario ids like toString', async () => {
    const runtime = new MockIncidentRuntime();

    await expect(runtime.createIncident('toString')).rejects.toThrow('scenario_not_found');
    await expect(runtime.createIncident('constructor')).rejects.toThrow('scenario_not_found');
  });

  it('rejects execution on runs restored with an unknown scenario', async () => {
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('gateway-timeout');
    const restored = await runtime.restoreRun({ ...created, scenarioId: 'valueOf' });

    await expect(runtime.executeStage(restored.id, 'verify')).rejects.toThrow('scenario_not_found');
  });

  it('completes only after evaluation is executed', async () => {
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);
    await runtime.approveAction(runId, paused.pendingApproval!.id);
    await runtime.executeStage(runId, 'escalate');
    await runtime.executeStage(runId, 'recover');
    const evaluated = await runtime.executeStage(runId, 'evaluate');

    expect(evaluated.run.status).toBe('completed');
    expect(evaluated.run.completedStages).toEqual([
      'verify',
      'locate',
      'contact',
      'escalate',
      'recover',
      'evaluate',
    ]);
  });

  it('short-circuits false alarms and skips the middle stages', async () => {
    // 误报路径：verify 判 false → 中间 4 阶段全部跳过 → 直接进 evaluate。
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('false-alarm');
    const verified = await runtime.executeStage(created.id, 'verify');
    const evaluated = await runtime.executeStage(created.id, 'evaluate');

    expect(verified.execution.output.isIncident).toBe(false);
    expect(evaluated.run.status).toBe('completed');
    expect(evaluated.run.currentStage).toBe('evaluate');
    expect(evaluated.run.completedStages).toEqual(['verify', 'evaluate']);
    expect(evaluated.run.skippedStages).toEqual(['locate', 'contact', 'escalate', 'recover']);
    // 跳过的阶段不计入 completedStages 也不在 executions 里；attempts 流水仍包含跳过的尝试（如有）。
    expect(evaluated.run.executions.locate).toBeUndefined();
  });

  it('re-enters recover with a fresh window when the first attempt is unstable', async () => {
    // 渠道恢复：recover 第 1 次 recovered=false → 停留 recover，第二次取 retryStages 新窗口 → 通过。
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('channel-rebound');
    await runtime.executeStage(created.id, 'verify');
    await runtime.executeStage(created.id, 'locate');
    await runtime.executeStage(created.id, 'contact');
    await runtime.approveAction(created.id, (await runtime.getRun(created.id)).pendingApproval!.id);
    await runtime.executeStage(created.id, 'escalate');

    const first = await runtime.executeStage(created.id, 'recover');
    expect(first.run.currentStage).toBe('recover');
    expect(first.run.completedStages).toEqual(['verify', 'locate', 'contact', 'escalate']);
    expect(first.run.status).toBe('running');
    expect(first.execution.output.recovered).toBe(false);
    expect(first.run.stageAttempts).toEqual({ verify: 1, locate: 1, contact: 1, escalate: 1, recover: 1 });
    expect(first.run.attempts?.filter((exec) => exec.stage === 'recover')).toHaveLength(1);

    const second = await runtime.executeStage(created.id, 'recover');
    // 第 2 次输入是 retryStages[0]（新窗口、recovered=true）→ 推进到 evaluate。
    expect(second.execution.output.recovered).toBe(true);
    expect(second.run.currentStage).toBe('evaluate');
    expect(second.run.stageAttempts?.recover).toBe(2);
    // 流水追加：累计 2 次 recover；executions 仍指向最新一次（UI 不重复渲染）。
    expect(second.run.attempts?.filter((exec) => exec.stage === 'recover')).toHaveLength(2);
    expect(second.run.executions.recover).toStrictEqual(second.execution);
  });

  it('cannot reach needs_human in mock mode once retryStages converges to recovered=true', async () => {
    // mock fixture 的设计意图是「演示闭环」：retryStages[0] 提供 recovered=true，
    // 因此第 2 次就推进 evaluate；触顶 needs_human 仅在真实模型持续判未稳定时出现。
    // 这里断言 mock 模式的稳定语义，避免未来无意把 retryStages 改坏。
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('channel-rebound');
    await runtime.executeStage(created.id, 'verify');
    await runtime.executeStage(created.id, 'locate');
    await runtime.executeStage(created.id, 'contact');
    await runtime.approveAction(created.id, (await runtime.getRun(created.id)).pendingApproval!.id);
    await runtime.executeStage(created.id, 'escalate');

    await runtime.executeStage(created.id, 'recover');
    const converged = await runtime.executeStage(created.id, 'recover');
    expect(converged.run.status).toBe('running');
    expect(converged.run.currentStage).toBe('evaluate');
    expect(converged.run.stageAttempts?.recover).toBe(2);
  });

  it('does not count an executed-but-unapproved contact as a retry', async () => {
    // 反向防回归：contact 即使执行了，若未审批通过就不算重试。
    const { runtime, runId } = await runtimeAtContact();
    const paused = await runtime.getRun(runId);
    expect(paused.completedStages).not.toContain('contact');
    // 重试定义 = 每个阶段执行次数 - 1；contact 执行了 1 次 → 0 次重试。
    const expectedRetries = Object.values(paused.stageAttempts ?? {}).reduce(
      (sum, n) => sum + Math.max(0, (n ?? 0) - 1),
      0,
    );
    expect(expectedRetries).toBe(0);
  });
});
