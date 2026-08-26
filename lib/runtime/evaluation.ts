import type { IncidentRun } from './types';

export interface EvaluationSample {
  runId: string;
  sampleId: string;
  predictedIncident: boolean;
  predictedRootCause: string;
  finalRootCause: string;
  humanCorrected: boolean;
  dataset: string;
}

export function createEvaluationSample(run: IncidentRun): EvaluationSample {
  if (run.status !== 'completed') throw new Error('run_not_completed');
  return {
    runId: run.id,
    sampleId: String(run.executions.evaluate?.output.sampleId ?? ''),
    predictedIncident: Boolean(run.executions.verify?.output.isIncident),
    predictedRootCause: String(run.executions.locate?.output.topCause ?? ''),
    finalRootCause: String(run.executions.evaluate?.output.finalRootCause ?? ''),
    humanCorrected: Boolean(run.executions.evaluate?.output.humanCorrected),
    dataset: String(run.executions.evaluate?.output.dataset ?? ''),
  };
}
