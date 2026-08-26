import { callStageLlm, type LlmErrorCode, type StageImage, type StageLlmResult } from './llm-client';
import { readLlmConfig } from './llm-config';
import { runtimeScenarios } from './scenario';
import { stageOrder, type IncidentRun, type IncidentRuntime, type IncidentStage, type StageExecution } from './types';

type LlmCaller = (request: Parameters<typeof callStageLlm>[0]) => Promise<StageLlmResult>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class LlmRuntimeError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmRuntimeError';
  }
}

export class ServerIncidentOrchestrator implements IncidentRuntime {
  private runs = new Map<string, IncidentRun>();

  constructor(private readonly caller: LlmCaller = callStageLlm) {}

  async createIncident(scenarioId: string): Promise<IncidentRun> {
    const scenario = runtimeScenarios[scenarioId];
    if (!scenario) throw new Error('scenario_not_found');
    const run: IncidentRun = {
      id: `LLM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      scenarioId,
      mode: 'llm',
      incident: clone(scenario.incident),
      status: 'idle',
      currentStage: 'verify',
      completedStages: [],
      executions: {},
    };
    this.runs.set(run.id, run);
    return clone(run);
  }

  async executeStage(
    runId: string,
    stage: IncidentStage,
    image?: StageImage,
  ): Promise<{ run: IncidentRun; execution: StageExecution }> {
    const run = this.requireRun(runId);
    if (run.status === 'awaiting_approval') throw new Error('approval_required');
    if (run.status === 'needs_human') throw new Error('human_handling_required');
    if (run.status === 'completed') throw new Error('run_completed');
    if (run.currentStage !== stage) throw new Error('stage_out_of_order');

    const fixture = runtimeScenarios[run.scenarioId].stages[stage];
    const priorOutputs = Object.fromEntries(
      run.completedStages.map((completed) => [completed, run.executions[completed]?.output]),
    );
    const result = await this.caller({
      config: readLlmConfig(),
      stage,
      context: {
        incident: run.incident,
        stageInput: fixture.input,
        priorOutputs,
        approval: stageOrder.indexOf(stage) > stageOrder.indexOf('contact') ? 'approved' : undefined,
      },
      image,
    });
    if (!result.ok) throw new LlmRuntimeError(result.code, result.message, result.retryable);

    const now = new Date().toISOString();
    const execution: StageExecution = {
      ...clone(fixture),
      output: result.output,
      decisionFactors: result.decisionFactors,
      events: [
        { id: `${run.id}-${stage}-start`, type: 'stage_started', at: now, label: `${fixture.title}开始`, detail: '服务端已构建最小阶段上下文。' },
        { id: `${run.id}-${stage}-llm-start`, type: 'tool_call_started', at: now, label: stage === 'verify' ? 'Multimodal LLM' : 'Evidence LLM', detail: `调用 ${result.model}` },
        { id: `${run.id}-${stage}-llm-done`, type: 'tool_call_completed', at: now, label: '真实模型返回', detail: result.summary, durationMs: result.durationMs },
        { id: `${run.id}-${stage}-decision`, type: stage === 'contact' ? 'approval_required' : 'decision_ready', at: now, label: stage === 'contact' ? '等待人工审批' : '结构化决策完成', detail: result.summary },
      ],
      metrics: {
        latencyMs: result.durationMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costYuan: 0,
        confidence: result.confidence,
        toolCalls: 1,
        evidenceCount: result.decisionFactors.length,
      },
      provider: 'real_llm',
      model: result.model,
      imageSource: result.imageSource,
      costEstimated: false,
    };
    run.executions[stage] = execution;
    run.status = 'running';

    if (stage === 'contact') {
      run.status = 'awaiting_approval';
      run.pendingApproval = { id: `${run.id}-contact-approval`, stage: 'contact', label: '批准真实 LLM 商户触达内容' };
    } else {
      this.completeStage(run, stage);
    }
    return { run: clone(run), execution: clone(execution) };
  }

  async approveAction(runId: string, actionId: string): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    if (run.status !== 'awaiting_approval' || run.pendingApproval?.id !== actionId) throw new Error('approval_not_found');
    run.pendingApproval = undefined;
    this.completeStage(run, 'contact');
    return clone(run);
  }

  async rejectAction(runId: string, actionId: string, reason: string): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    if (run.status !== 'awaiting_approval' || run.pendingApproval?.id !== actionId) throw new Error('approval_not_found');
    run.status = 'needs_human';
    run.humanReason = reason;
    run.pendingApproval = undefined;
    return clone(run);
  }

  async getRun(runId: string): Promise<IncidentRun> {
    return clone(this.requireRun(runId));
  }

  async resetRun(runId: string): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    this.runs.delete(runId);
    return this.createIncident(run.scenarioId);
  }

  private requireRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new Error('run_not_found');
    return run;
  }

  private completeStage(run: IncidentRun, stage: IncidentStage) {
    if (!run.completedStages.includes(stage)) run.completedStages.push(stage);
    const next = stageOrder[stageOrder.indexOf(stage) + 1];
    if (!next) {
      run.status = 'completed';
      run.currentStage = 'evaluate';
      return;
    }
    run.status = 'running';
    run.currentStage = next;
  }
}
