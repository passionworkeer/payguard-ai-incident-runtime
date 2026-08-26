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
  // 同一 run 的命令串行执行：execute 的守卫检查与状态变更之间隔着真实 LLM 调用，
  // 并发命令若不排队，迟到响应会把 run 状态打回早期阶段（状态机倒退 + 重复计费）。
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly caller: LlmCaller = callStageLlm) {}

  private serialized<T>(runId: string, action: () => Promise<T>): Promise<T> {
    const queued = (this.inflight.get(runId) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.inflight.set(runId, queued);
    return queued.finally(() => {
      if (this.inflight.get(runId) === queued) this.inflight.delete(runId);
    });
  }

  async createIncident(scenarioId: string): Promise<IncidentRun> {
    // Object.hasOwn 防止 'toString' 等原型链继承键绕过场景校验。
    if (!Object.hasOwn(runtimeScenarios, scenarioId)) throw new Error('scenario_not_found');
    this.evictStaleRuns();
    const scenario = runtimeScenarios[scenarioId];
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
    return this.serialized(runId, () => this.executeStageLocked(runId, stage, image));
  }

  private async executeStageLocked(
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
    // 模型对 Schema 的「条数/长度」类约束遵循不稳定：解析方差（NO_TOOL / INVALID_OUTPUT）
    // 属偶发，先原样重试一次真实调用；持续失败仍按错误上抛，不用 Mock 结果替代。
    const request = {
      config: readLlmConfig(),
      stage,
      context: {
        incident: run.incident,
        stageInput: fixture.input,
        priorOutputs,
        approval: stageOrder.indexOf(stage) > stageOrder.indexOf('contact') ? 'approved' : undefined,
      },
      image,
    } as const;
    let result = await this.caller(request);
    // 重试与首调都计费：累计所有调用的 token，观测面板才不会系统性低估。
    const usage = { inputTokens: 0, outputTokens: 0 };
    const addUsage = (used: { inputTokens: number; outputTokens: number } | undefined) => {
      if (!used) return;
      usage.inputTokens += used.inputTokens;
      usage.outputTokens += used.outputTokens;
    };
    addUsage(result.usage);
    if (!result.ok && (result.code === 'LLM_NO_TOOL' || result.code === 'LLM_INVALID_OUTPUT')) {
      result = await this.caller(request);
      addUsage(result.usage);
    }
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
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
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
    return this.serialized(runId, () => this.approveActionLocked(runId, actionId));
  }

  private async approveActionLocked(runId: string, actionId: string): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    if (run.status !== 'awaiting_approval' || run.pendingApproval?.id !== actionId) throw new Error('approval_not_found');
    run.pendingApproval = undefined;
    this.completeStage(run, 'contact');
    return clone(run);
  }

  async rejectAction(runId: string, actionId: string, reason: string): Promise<IncidentRun> {
    return this.serialized(runId, () => this.rejectActionLocked(runId, actionId, reason));
  }

  private async rejectActionLocked(runId: string, actionId: string, reason: string): Promise<IncidentRun> {
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
    return this.serialized(runId, async () => {
      const run = this.requireRun(runId);
      this.runs.delete(runId);
      return this.createIncident(run.scenarioId);
    });
  }

  // runs 只增不减会随长时间运行的 dev server 累积；超过上限时淘汰最早且不在执行中的 run。
  private evictStaleRuns() {
    const MAX_RUNS = 50;
    if (this.runs.size < MAX_RUNS) return;
    for (const runId of this.runs.keys()) {
      if (this.runs.size < MAX_RUNS) break;
      if (this.inflight.has(runId)) continue;
      this.runs.delete(runId);
    }
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
