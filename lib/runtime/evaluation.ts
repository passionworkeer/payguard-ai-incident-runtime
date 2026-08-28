import { calculateClassification, type ConfusionMatrix } from '../analytics';
import { retryCount } from './state-machine';
import { runtimeScenarios } from './scenarios';
import type { GroundTruth } from './types';
import type { IncidentRun } from './types';

export type VerifyOutcome = 'TP' | 'FP' | 'FN' | 'TN';
export type RootCauseHit = 'top1' | 'topk' | 'miss' | 'n/a';

export interface EvaluationSample {
  runId: string;
  scenarioId: string;
  mode: 'mock' | 'llm';
  sampleId: string;
  dataset: string;
  // 核验判分：TP/FP/FN/TN。
  verifyOutcome: VerifyOutcome;
  // 根因命中：top1 = 主根因匹配；topk = 在候选根因里；miss = 没命中；n/a = 误报场景无需判根因。
  rootCauseHit: RootCauseHit;
  severityHit: boolean | null;
  retryCount: number;
  totalLatencyMs: number;
  tokens: number;
  provider: 'mock' | 'real_llm' | 'mixed';
  // 仅展示用：模型给的 Top-1 根因与 ground truth 根因，方便评测表渲染。
  predictedRootCause: string;
  groundTruthRootCause: string;
  humanCorrected: boolean;
  finishedAt: string;
}

// 根因容错匹配（确定性、无分词库）：
// 1) normalize = lowercase + 去空白 + 去连接词（中英标点 + and/or 的）；
// 2) top1 = 双向包含 ∥ rootCauseKeywords 全命中 ∥ acceptableCauses 命中；
// 3) topk = alternatives 命中；
// 4) 否则 miss；
// 5) 误报场景（groundTruth.isIncident === false）→ n/a。
export function normalizeCause(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\s\-_/.,，。、:：;；'"'"'()（）\[\]【】{}·]+/g, '')
    .replace(/[a]nd|[o]r|[a]nd\/[o]r/g, '')
    .trim();
}

export function judgeVerify(run: IncidentRun): VerifyOutcome {
  const scenario = runtimeScenarios[run.scenarioId];
  if (!scenario) return 'FP'; // 无场景 = 视作误报兜底
  const truth = scenario.groundTruth;
  const predicted = Boolean(run.executions.verify?.output.isIncident);
  if (truth.isIncident && predicted) return 'TP';
  if (!truth.isIncident && predicted) return 'FP';
  if (truth.isIncident && !predicted) return 'FN';
  return 'TN';
}

export function matchRootCause(run: IncidentRun): RootCauseHit {
  const scenario = runtimeScenarios[run.scenarioId];
  if (!scenario) return 'miss';
  const truth = scenario.groundTruth;
  if (!truth.isIncident) return 'n/a';
  const predicted = String(run.executions.locate?.output.topCause ?? '');
  const alternatives = Array.isArray(run.executions.locate?.output.alternatives)
    ? (run.executions.locate!.output.alternatives as unknown[]).map(String)
    : [];
  // normalize 后双向包含：等价表述（如「连接池耗尽」 vs 「连接池配置错误」）必须判对。
  const pred = normalizeCause(predicted);
  const truthNorm = normalizeCause(truth.rootCause);
  if (pred && truthNorm && (pred.includes(truthNorm) || truthNorm.includes(pred))) return 'top1';
  // 关键词全命中：「证书过期」类短语即使顺序不同也能匹配。
  if (truth.rootCauseKeywords.length > 0 && truth.rootCauseKeywords.every((kw) => predicted.includes(kw))) return 'top1';
  // acceptableCauses：明确写在 groundTruth 里的等价表述。
  if (truth.acceptableCauses.some((cause) => {
    const cn = normalizeCause(cause);
    return cn && pred && (pred.includes(cn) || cn.includes(pred));
  })) return 'top1';
  if (alternatives.some((alt) => alt === predicted || normalizeCause(alt) === pred)) return 'topk';
  return 'miss';
}

export function judgeSeverity(run: IncidentRun): boolean | null {
  const scenario = runtimeScenarios[run.scenarioId];
  if (!scenario) return null;
  const truth = scenario.groundTruth;
  if (!truth.isIncident) return null;
  const predicted = String(run.executions.verify?.output.severity ?? '');
  return truth.severity === predicted;
}

export function createEvaluationSample(run: IncidentRun): EvaluationSample {
  if (run.status !== 'completed') throw new Error('run_not_completed');
  const scenario = runtimeScenarios[run.scenarioId];
  const truth = scenario?.groundTruth;
  const attempts = run.attempts && run.attempts.length > 0 ? run.attempts : Object.values(run.executions);
  const totalLatencyMs = attempts.reduce((sum, exec) => sum + exec.metrics.latencyMs, 0);
  const tokens = attempts.reduce((sum, exec) => sum + exec.metrics.inputTokens + exec.metrics.outputTokens, 0);
  // 模式：mock 链全是 mock；llm 链至少一条 real_llm 就算 llm；混合属混合。
  const distinctProviders = new Set(attempts.map((exec) => exec.provider));
  const provider: 'mock' | 'real_llm' | 'mixed' =
    distinctProviders.size === 1
      ? distinctProviders.has('real_llm')
        ? 'real_llm'
        : 'mock'
      : 'mixed';
  return {
    runId: run.id,
    scenarioId: run.scenarioId,
    mode: run.mode,
    sampleId: String(run.executions.evaluate?.output.sampleId ?? ''),
    dataset: String(run.executions.evaluate?.output.dataset ?? ''),
    verifyOutcome: judgeVerify(run),
    rootCauseHit: matchRootCause(run),
    severityHit: judgeSeverity(run),
    retryCount: retryCount(run),
    totalLatencyMs,
    tokens,
    provider,
    predictedRootCause: String(run.executions.locate?.output.topCause ?? ''),
    groundTruthRootCause: truth?.rootCause ?? '',
    humanCorrected: Boolean(run.executions.evaluate?.output.humanCorrected),
    finishedAt: new Date().toISOString(),
  };
}

// 给一组样本聚合分类指标：用样本的 verifyOutcome 投到混淆矩阵。
export function aggregateClassification(samples: EvaluationSample[]): ConfusionMatrix & { totals: number; accuracy: number; precision: number; recall: number; f1: number } {
  const counts: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const sample of samples) {
    counts[sample.verifyOutcome.toLowerCase() as keyof ConfusionMatrix] += 1;
  }
  const metrics = calculateClassification(counts);
  return { ...counts, totals: samples.length, ...metrics };
}

// 根因命中率 = (top1 + topk) / 总样本（仅计真实故障；误报场景算 n/a 不参与）。
export function aggregateRootCause(samples: EvaluationSample[]): { total: number; top1: number; topk: number; miss: number; hitRate: number } {
  let top1 = 0;
  let topk = 0;
  let miss = 0;
  let total = 0;
  for (const sample of samples) {
    if (sample.rootCauseHit === 'n/a') continue;
    total += 1;
    if (sample.rootCauseHit === 'top1') top1 += 1;
    else if (sample.rootCauseHit === 'topk') topk += 1;
    else miss += 1;
  }
  const hitRate = total === 0 ? 0 : (top1 + topk) / total;
  return { total, top1, topk, miss, hitRate };
}