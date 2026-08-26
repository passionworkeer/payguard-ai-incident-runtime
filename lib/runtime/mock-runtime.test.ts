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
});
