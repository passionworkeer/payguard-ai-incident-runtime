import { describe, expect, it, vi } from 'vitest';
import type { StageLlmResult } from './llm-client';
import { LlmRuntimeError, ServerIncidentOrchestrator } from './server-orchestrator';

function llmResult(stage: string): StageLlmResult {
  const outputs: Record<string, Record<string, unknown>> = {
    verify: { isIncident: true, severity: 'P0', confidence: 96, impactScope: '核心支付', evidenceHighlights: ['成功率下降'], signalSummary: '4 类工具中 3 类 flag' },
    locate: { topCause: '连接池耗尽', alternatives: ['网络抖动'], evidenceRefs: ['log://1'], recommendedAction: '扩容', causeOwner: 'platform' },
    contact: { subject: '故障通知', message: '连接池异常，正在处理。', actionLinkLabel: '查看详情', channels: ['站内信'] },
    escalate: { ticketTitle: 'P0 支付超时', teams: ['网关平台'], sla: '15 分钟', escalationReason: 'P0', simulated: true, escalationLevel: 'L2' },
    recover: { recovered: true, stableWindows: 3, residualRisk: '低', observationAdvice: '观察 15 分钟' },
    evaluate: { sampleId: 'EVAL-REAL-001', verifyLabel: 'TP', predictedRootCause: '连接池耗尽', finalRootCause: '连接池耗尽', humanCorrected: false, dataset: 'real-demo-v1', qualityChecks: ['完整'] },
  };
  return {
    ok: true,
    output: outputs[stage],
    decisionFactors: [{ label: '证据', value: '命中', evidence: `trace://${stage}` }],
    confidence: 95,
    summary: `${stage} 完成`,
    usage: { inputTokens: 100, outputTokens: 40 },
    durationMs: 680,
    model: 'evidence-model',
  };
}

describe('ServerIncidentOrchestrator', () => {
  it('creates an isolated real LLM run', async () => {
    const orchestrator = new ServerIncidentOrchestrator(vi.fn());
    const run = await orchestrator.createIncident('gateway-timeout');

    expect(run).toMatchObject({ mode: 'llm', currentStage: 'verify', status: 'idle' });
    expect(run.executions.verify).toBeUndefined();
  });

  it('executes one real stage with provider metadata', async () => {
    const caller = vi.fn().mockResolvedValue(llmResult('verify'));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const result = await orchestrator.executeStage(run.id, 'verify');

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ stage: 'verify' }));
    expect(caller.mock.calls[0][0]).not.toHaveProperty('image');
    expect(result.run.currentStage).toBe('locate');
    expect(result.execution).toMatchObject({
      provider: 'real_llm',
      model: 'evidence-model',
      metrics: { inputTokens: 100, outputTokens: 40, latencyMs: 680, confidence: 95 },
    });
  });

  it('keeps the approval gate in the real path', async () => {
    const caller = vi.fn().mockImplementation(({ stage }: { stage: string }) => Promise.resolve(llmResult(stage)));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');
    await orchestrator.executeStage(run.id, 'verify');
    await orchestrator.executeStage(run.id, 'locate');
    const contacted = await orchestrator.executeStage(run.id, 'contact');

    expect(contacted.run.status).toBe('awaiting_approval');
    await expect(orchestrator.executeStage(run.id, 'escalate')).rejects.toThrow('approval_required');
    const approved = await orchestrator.approveAction(run.id, contacted.run.pendingApproval!.id);
    expect(approved.currentStage).toBe('escalate');
  });

  it('does not advance the run when the LLM fails', async () => {
    const caller = vi.fn().mockResolvedValue({ ok: false, code: 'LLM_TIMEOUT', message: '调用超时', retryable: true });
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const error = await orchestrator.executeStage(run.id, 'verify').catch((caught) => caught);

    expect(error).toBeInstanceOf(LlmRuntimeError);
    expect(error).toMatchObject({ code: 'LLM_TIMEOUT', retryable: true });
    expect(await orchestrator.getRun(run.id)).toMatchObject({ currentStage: 'verify', completedStages: [] });
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it('retries once on parse-variance failures before succeeding', async () => {
    const caller = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'LLM_INVALID_OUTPUT', message: '模型结果未通过阶段 Schema 校验。', retryable: true })
      .mockResolvedValueOnce(llmResult('verify'));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const result = await orchestrator.executeStage(run.id, 'verify');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(result.run.currentStage).toBe('locate');
  });

  it('surfaces the parse error when a single retry still fails', async () => {
    const caller = vi.fn().mockResolvedValue({ ok: false, code: 'LLM_NO_TOOL', message: '模型未返回预期结构化工具结果。', retryable: true });
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const error = await orchestrator.executeStage(run.id, 'verify').catch((caught) => caught);

    expect(error).toBeInstanceOf(LlmRuntimeError);
    expect(error).toMatchObject({ code: 'LLM_NO_TOOL' });
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it('rejects prototype-chain scenario ids like toString', async () => {
    const orchestrator = new ServerIncidentOrchestrator(vi.fn());

    await expect(orchestrator.createIncident('toString')).rejects.toThrow('scenario_not_found');
    await expect(orchestrator.createIncident('hasOwnProperty')).rejects.toThrow('scenario_not_found');
  });

  it('serializes concurrent commands so late responses cannot rewind the run', async () => {
    const caller = vi.fn().mockImplementation(({ stage }: { stage: string }) => Promise.resolve(llmResult(stage)));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const [first, second] = await Promise.allSettled([
      orchestrator.executeStage(run.id, 'verify'),
      orchestrator.executeStage(run.id, 'verify'),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(['fulfilled', 'rejected']);
    if (second.status === 'rejected') expect(second.reason).toBeInstanceOf(Error);
    // 只有一次真实调用被计费，run 状态只前进了一格。
    expect(caller).toHaveBeenCalledTimes(1);
    expect(await orchestrator.getRun(run.id)).toMatchObject({ currentStage: 'locate', completedStages: ['verify'] });
  });

  it('accumulates token usage across a parse-variance retry', async () => {
    const caller = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'LLM_INVALID_OUTPUT', message: '模型结果未通过阶段 Schema 校验。', retryable: true, usage: { inputTokens: 80, outputTokens: 30 } })
      .mockResolvedValueOnce(llmResult('verify'));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');

    const result = await orchestrator.executeStage(run.id, 'verify');

    expect(result.execution.metrics).toMatchObject({ inputTokens: 180, outputTokens: 70 });
  });

  it('resets to a fresh run and forgets the old one', async () => {
    const caller = vi.fn().mockImplementation(({ stage }: { stage: string }) => Promise.resolve(llmResult(stage)));
    const orchestrator = new ServerIncidentOrchestrator(caller);
    const run = await orchestrator.createIncident('gateway-timeout');
    await orchestrator.executeStage(run.id, 'verify');

    const fresh = await orchestrator.resetRun(run.id);

    expect(fresh).toMatchObject({ mode: 'llm', status: 'idle', currentStage: 'verify', completedStages: [] });
    expect(fresh.id).not.toBe(run.id);
    await expect(orchestrator.getRun(run.id)).rejects.toThrow('run_not_found');
  });
});
