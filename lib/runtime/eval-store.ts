import type { EvaluationSample } from './evaluation';

export const EVAL_STORAGE_KEY = 'payguard.eval-samples.v1';
// 容量上限：演示场景产生样本速率低，20 条足够覆盖 4 场景 × 5 轮回放，FIFO 防止 storage 无限增长。
const MAX_SAMPLES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEvaluationSample(value: unknown): value is EvaluationSample {
  if (!isRecord(value)) return false;
  const requiredStrings = ['runId', 'scenarioId', 'mode', 'sampleId', 'dataset', 'provider', 'predictedRootCause', 'groundTruthRootCause', 'finishedAt'];
  for (const key of requiredStrings) {
    if (typeof value[key] !== 'string') return false;
  }
  if (value.mode !== 'mock' && value.mode !== 'llm') return false;
  if (value.provider !== 'mock' && value.provider !== 'real_llm' && value.provider !== 'mixed') return false;
  const verifyOutcome = value.verifyOutcome;
  if (verifyOutcome !== 'TP' && verifyOutcome !== 'FP' && verifyOutcome !== 'FN' && verifyOutcome !== 'TN') return false;
  const rootCauseHit = value.rootCauseHit;
  if (rootCauseHit !== 'top1' && rootCauseHit !== 'topk' && rootCauseHit !== 'miss' && rootCauseHit !== 'n/a') return false;
  if (typeof value.retryCount !== 'number' || !Number.isFinite(value.retryCount)) return false;
  if (typeof value.totalLatencyMs !== 'number' || !Number.isFinite(value.totalLatencyMs)) return false;
  if (typeof value.tokens !== 'number' || !Number.isFinite(value.tokens)) return false;
  if (typeof value.humanCorrected !== 'boolean') return false;
  if (value.severityHit !== null && typeof value.severityHit !== 'boolean') return false;
  return true;
}

function loadRaw(storage: Storage): EvaluationSample[] {
  let raw: string | null;
  try {
    raw = storage.getItem(EVAL_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid_payload');
    const valid = parsed.filter(isEvaluationSample);
    return valid;
  } catch {
    // 损坏 / 版本不匹配 → 整体丢弃，避免单条字段错位后整组丢失。
    try {
      storage.removeItem(EVAL_STORAGE_KEY);
    } catch {
      /* 忽略：存储不可用时无内容可清 */
    }
    return [];
  }
}

export function loadEvalSamples(storage: Storage): EvaluationSample[] {
  return loadRaw(storage);
}

// 追加样本：按 runId 去重；超过容量时 FIFO 丢弃最旧。
export function appendEvalSample(storage: Storage, sample: EvaluationSample): EvaluationSample[] {
  const current = loadRaw(storage);
  const withoutDup = current.filter((item) => item.runId !== sample.runId);
  const next = [...withoutDup, sample];
  const trimmed = next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
  try {
    storage.setItem(EVAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 忽略写入失败：演示场景 quota 满时降级为本次不持久化 */
  }
  return trimmed;
}

export function clearEvalSamples(storage: Storage) {
  try {
    storage.removeItem(EVAL_STORAGE_KEY);
  } catch {
    /* 忽略：存储不可用时无内容可清 */
  }
}