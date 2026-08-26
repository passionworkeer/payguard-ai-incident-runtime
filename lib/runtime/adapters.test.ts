import { describe, expect, it, vi } from 'vitest';
import { createEvaluationSample } from './evaluation';
import { HttpIncidentRuntime, RuntimeRequestError } from './http-runtime';
import { MockIncidentRuntime } from './mock-runtime';
import { loadMockRun, saveMockRun, STORAGE_KEY } from './persistence';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

async function completedRun() {
  const runtime = new MockIncidentRuntime();
  const created = await runtime.createIncident('gateway-timeout');
  await runtime.executeStage(created.id, 'verify');
  await runtime.executeStage(created.id, 'locate');
  const contacted = await runtime.executeStage(created.id, 'contact');
  await runtime.approveAction(created.id, contacted.run.pendingApproval!.id);
  await runtime.executeStage(created.id, 'escalate');
  await runtime.executeStage(created.id, 'recover');
  return (await runtime.executeStage(created.id, 'evaluate')).run;
}

describe('runtime adapters', () => {
  it('restores a valid mock run and removes corrupt storage', async () => {
    const storage = memoryStorage();
    const run = await completedRun();

    saveMockRun(storage, run);
    expect(loadMockRun(storage)?.id).toBe(run.id);

    storage.setItem(STORAGE_KEY, '{bad json');
    expect(loadMockRun(storage)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('maps an HTTP stage response to the runtime contract', async () => {
    const run = await completedRun();
    const execution = run.executions.verify!;
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run, execution }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const runtime = new HttpIncidentRuntime('/api/incidents', fetcher);

    const result = await runtime.executeStage('run-1', 'verify');

    expect(fetcher).toHaveBeenCalledWith(
      '/api/incidents/run-1/stages/verify',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.execution.stage).toBe('verify');
  });

  it('exposes retryable HTTP failures without losing the error code', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'upstream_timeout', message: '工具超时' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const runtime = new HttpIncidentRuntime('/api/incidents', fetcher);

    const error = await runtime.getRun('run-1').catch((caught) => caught);

    expect(error).toBeInstanceOf(RuntimeRequestError);
    expect(error).toMatchObject({ status: 503, code: 'upstream_timeout', retryable: true });
  });

  it('derives an evaluation sample only from a completed run', async () => {
    const runtime = new MockIncidentRuntime();
    const active = await runtime.createIncident('gateway-timeout');
    expect(() => createEvaluationSample(active)).toThrow('run_not_completed');

    const sample = createEvaluationSample(await completedRun());
    expect(sample).toMatchObject({
      predictedIncident: true,
      predictedRootCause: '商户 API 网关连接池耗尽',
      finalRootCause: '商户 API 网关连接池耗尽',
      humanCorrected: false,
    });
  });
});
