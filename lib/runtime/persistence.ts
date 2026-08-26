import { runtimeScenarios } from './scenario';
import { stageOrder, type IncidentRun, type RunStatus } from './types';

export const STORAGE_KEY = 'payguard.mock-run.v1';

const statuses: RunStatus[] = [
  'idle',
  'running',
  'awaiting_approval',
  'needs_human',
  'failed',
  'completed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const metricFields = ['latencyMs', 'inputTokens', 'outputTokens', 'costYuan', 'confidence', 'toolCalls', 'evidenceCount'] as const;

function isStageExecution(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { stage, title, events, decisionFactors, output, metrics } = value;
  if (typeof stage !== 'string' || !stageOrder.includes(stage as IncidentRun['currentStage'])) return false;
  if (typeof title !== 'string') return false;
  if (!Array.isArray(events) || !events.every((event) => isRecord(event) && typeof event.label === 'string')) return false;
  if (!Array.isArray(decisionFactors) || !decisionFactors.every(isRecord)) return false;
  if (!isRecord(output)) return false;
  if (!isRecord(metrics)) return false;
  if (!metricFields.every((field) => typeof metrics[field] === 'number' && Number.isFinite(metrics[field]))) return false;
  return true;
}

function isIncidentRun(value: unknown): value is IncidentRun {
  if (!isRecord(value) || !isRecord(value.incident) || !isRecord(value.executions)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.scenarioId !== 'string' || !Object.hasOwn(runtimeScenarios, value.scenarioId)) return false;
  if (value.mode !== 'mock' && value.mode !== undefined) return false;
  if (!statuses.includes(value.status as RunStatus)) return false;
  if (!stageOrder.includes(value.currentStage as IncidentRun['currentStage'])) return false;
  if (!Array.isArray(value.completedStages) || !value.completedStages.every((stage) => stageOrder.includes(stage as IncidentRun['currentStage']))) return false;
  // 完成态时 currentStage 指向最后一步（本就包含在 completedStages），其余状态不允许重叠。
  if (value.status !== 'completed' && value.completedStages.includes(value.currentStage)) return false;
  const incident = value.incident;
  if (typeof incident.merchant !== 'string' || typeof incident.title !== 'string') return false;
  if (incident.severity !== 'P0' && incident.severity !== 'P1' && incident.severity !== 'P2') return false;
  if (typeof incident.impact !== 'string' || typeof incident.detectedAt !== 'string') return false;
  if (!Object.values(value.executions).every(isStageExecution)) return false;
  if (value.pendingApproval !== undefined && !(isRecord(value.pendingApproval) && typeof value.pendingApproval.id === 'string')) return false;
  if (value.humanReason !== undefined && typeof value.humanReason !== 'string') return false;
  return true;
}

// 存储“尽力而为”：配额满 / 存储被禁用时不抛错，避免打断演示主流程。
export function saveMockRun(storage: Storage, run: IncidentRun) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, run }));
  } catch {
    /* 忽略写入失败：刷新后会回到上一个成功持久化的阶段 */
  }
}

export function loadMockRun(storage: Storage): IncidentRun | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== 1 || !isIncidentRun(stored.run)) {
      throw new Error('invalid_mock_run');
    }
    // 归一化 mode：历史数据可能缺省该字段，统一补齐为 mock。
    return structuredClone({ ...stored.run, mode: 'mock' as const });
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* 存储不可用时忽略清理失败 */
    }
    return null;
  }
}

export function clearMockRun(storage: Storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略：存储不可用时无内容可清 */
  }
}
