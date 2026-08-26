import { runtimeScenarios } from './scenario';
import {
  stageOrder,
  type IncidentRun,
  type IncidentRuntime,
  type IncidentStage,
  type StageExecution,
} from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MockIncidentRuntime implements IncidentRuntime {
  private runs = new Map<string, IncidentRun>();

  constructor(initialRuns: IncidentRun[] = []) {
    initialRuns.forEach((run) => this.runs.set(run.id, clone(run)));
  }

  restoreRun(run: IncidentRun): IncidentRun {
    this.runs.set(run.id, clone(run));
    return clone(run);
  }

  async createIncident(scenarioId: string): Promise<IncidentRun> {
    // Object.hasOwn 防止 'toString' 等原型链继承键绕过场景校验。
    if (!Object.hasOwn(runtimeScenarios, scenarioId)) throw new Error('scenario_not_found');
    const scenario = runtimeScenarios[scenarioId];
    const run: IncidentRun = {
      id: `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      scenarioId,
      mode: 'mock',
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
  ): Promise<{ run: IncidentRun; execution: StageExecution }> {
    const run = this.requireRun(runId);
    if (run.status === 'awaiting_approval') throw new Error('approval_required');
    if (run.status === 'needs_human') throw new Error('human_handling_required');
    if (run.status === 'completed') throw new Error('run_completed');
    if (run.currentStage !== stage) throw new Error('stage_out_of_order');
    if (!Object.hasOwn(runtimeScenarios, run.scenarioId)) throw new Error('scenario_not_found');

    const execution = clone(runtimeScenarios[run.scenarioId].stages[stage]);
    run.executions[stage] = execution;
    run.status = 'running';

    if (stage === 'contact') {
      run.status = 'awaiting_approval';
      run.pendingApproval = {
        id: `${run.id}-contact-approval`,
        stage: 'contact',
        label: '批准商户触达内容',
      };
    } else {
      this.completeStage(run, stage);
    }

    return { run: clone(run), execution };
  }

  async approveAction(runId: string, actionId: string): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    if (run.status !== 'awaiting_approval' || run.pendingApproval?.id !== actionId) {
      throw new Error('approval_not_found');
    }
    run.pendingApproval = undefined;
    this.completeStage(run, 'contact');
    return clone(run);
  }

  async rejectAction(
    runId: string,
    actionId: string,
    reason: string,
  ): Promise<IncidentRun> {
    const run = this.requireRun(runId);
    if (run.status !== 'awaiting_approval' || run.pendingApproval?.id !== actionId) {
      throw new Error('approval_not_found');
    }
    run.status = 'needs_human';
    run.humanReason = reason;
    run.pendingApproval = undefined;
    return clone(run);
  }

  async getRun(runId: string): Promise<IncidentRun> {
    return clone(this.requireRun(runId));
  }

  async resetRun(runId: string): Promise<IncidentRun> {
    const current = this.requireRun(runId);
    this.runs.delete(runId);
    return this.createIncident(current.scenarioId);
  }

  private requireRun(runId: string): IncidentRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error('run_not_found');
    return run;
  }

  private completeStage(run: IncidentRun, stage: IncidentStage) {
    if (!run.completedStages.includes(stage)) run.completedStages.push(stage);
    const index = stageOrder.indexOf(stage);
    const next = stageOrder[index + 1];
    if (!next) {
      run.status = 'completed';
      run.currentStage = 'evaluate';
      return;
    }
    run.status = 'running';
    run.currentStage = next;
  }
}
