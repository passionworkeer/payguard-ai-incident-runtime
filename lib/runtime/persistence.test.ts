import { beforeEach, describe, expect, it } from 'vitest';
import { MockIncidentRuntime } from './mock-runtime';
import { clearMockRun, loadMockRun, saveMockRun, STORAGE_KEY } from './persistence';
import type { IncidentRun } from './types';

async function runAtVerify(): Promise<IncidentRun> {
  const runtime = new MockIncidentRuntime();
  const created = await runtime.createIncident('gateway-timeout');
  const verified = await runtime.executeStage(created.id, 'verify');
  return verified.run;
}

describe('mock run persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a mock run through localStorage', async () => {
    const run = await runAtVerify();
    saveMockRun(localStorage, run);

    const restored = loadMockRun(localStorage);

    expect(restored).toMatchObject({ id: run.id, mode: 'mock', currentStage: 'locate', completedStages: ['verify'] });
  });

  it('rejects and clears invalid JSON, wrong version, and llm-mode runs', async () => {
    const run = await runAtVerify();
    const cases: Array<[string, string]> = [
      ['broken json', '{bad json'],
      ['wrong version', JSON.stringify({ version: 2, run })],
      ['llm mode run', JSON.stringify({ version: 1, run: { ...run, mode: 'llm' } })],
    ];
    for (const [, raw] of cases) {
      localStorage.setItem(STORAGE_KEY, raw);
      expect(loadMockRun(localStorage), raw).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    }
  });

  it('rejects structurally valid but corrupt execution payloads', async () => {
    const run = await runAtVerify();
    const corrupt: Array<[string, unknown]> = [
      ['metrics replaced by number', { ...run, executions: { verify: 42 } }],
      ['metrics missing fields', { ...run, executions: { verify: { ...run.executions.verify!, metrics: { latencyMs: 100 } } } }],
      ['events not an array', { ...run, executions: { verify: { ...run.executions.verify!, events: 'nope' } } }],
      ['unknown scenario id', { ...run, scenarioId: 'toString' }],
    ];
    for (const [label, payload] of corrupt) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, run: payload }));
      expect(loadMockRun(localStorage), label).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY), label).toBeNull();
    }
  });

  it('accepts runs without a mode field and normalizes it to mock', async () => {
    const run = await runAtVerify();
    const withoutMode: Record<string, unknown> = { ...run };
    delete withoutMode.mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, run: withoutMode }));

    const restored = loadMockRun(localStorage);

    expect(restored?.mode).toBe('mock');
  });

  it('accepts a completed run whose currentStage is the last completed stage', async () => {
    const runtime = new MockIncidentRuntime();
    const created = await runtime.createIncident('gateway-timeout');
    await runtime.executeStage(created.id, 'verify');
    await runtime.executeStage(created.id, 'locate');
    const contacted = await runtime.executeStage(created.id, 'contact');
    await runtime.approveAction(created.id, contacted.run.pendingApproval!.id);
    await runtime.executeStage(created.id, 'escalate');
    await runtime.executeStage(created.id, 'recover');
    const done = await runtime.executeStage(created.id, 'evaluate');
    saveMockRun(localStorage, done.run);

    expect(loadMockRun(localStorage)).toMatchObject({ status: 'completed', currentStage: 'evaluate' });
  });

  it('never throws on quota-exceeded or disabled storage', async () => {
    const run = await runAtVerify();
    const throwingStorage = {
      length: 0,
      clear() { throw new Error('SecurityError'); },
      getItem() { throw new Error('SecurityError'); },
      key() { return null; },
      removeItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); },
    } as unknown as Storage;

    expect(() => saveMockRun(throwingStorage, run)).not.toThrow();
    expect(() => clearMockRun(throwingStorage)).not.toThrow();
    expect(loadMockRun(throwingStorage)).toBeNull();
  });
});
