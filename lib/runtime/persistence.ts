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

function isIncidentRun(value: unknown): value is IncidentRun {
  if (!isRecord(value) || !isRecord(value.incident) || !isRecord(value.executions)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    value.scenarioId === 'gateway-timeout' &&
    statuses.includes(value.status as RunStatus) &&
    stageOrder.includes(value.currentStage as (typeof stageOrder)[number]) &&
    Array.isArray(value.completedStages) &&
    value.completedStages.every((stage) => stageOrder.includes(stage)) &&
    typeof value.incident.merchant === 'string' &&
    typeof value.incident.title === 'string'
  );
}

export function saveMockRun(storage: Storage, run: IncidentRun) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, run }));
}

export function loadMockRun(storage: Storage): IncidentRun | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== 1 || !isIncidentRun(stored.run)) {
      throw new Error('invalid_mock_run');
    }
    return structuredClone(stored.run);
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearMockRun(storage: Storage) {
  storage.removeItem(STORAGE_KEY);
}
