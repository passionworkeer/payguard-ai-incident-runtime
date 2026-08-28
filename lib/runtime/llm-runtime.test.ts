import { describe, expect, it, vi } from 'vitest';
import { LlmIncidentRuntime, RuntimeRequestError } from './llm-runtime';
import type { IncidentRun, StageExecution } from './types';

const run = {
  id: 'LLM-1',
  scenarioId: 'gateway-timeout',
  mode: 'llm',
  incident: { merchant: '星海出行', severity: 'P0', impact: '¥286.4万', title: '支付接口超时率突增', detectedAt: '2026-08-26' },
  status: 'idle',
  currentStage: 'verify',
  completedStages: [],
  executions: {},
} satisfies IncidentRun;

const execution = { stage: 'verify', provider: 'real_llm' } as StageExecution;

describe('LlmIncidentRuntime', () => {
  it('posts the execute command without sending any image payload', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run, execution }), { status: 200 }));
    const runtime = new LlmIncidentRuntime('/api/runtime', fetcher);

    await runtime.createIncident('gateway-timeout');
    await runtime.executeStage('LLM-1', 'verify');

    const [, init] = fetcher.mock.calls[1];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      action: 'execute',
      runId: 'LLM-1',
      stage: 'verify',
    });
    // 核验图片字段已下线：请求体不应再出现 image/mediaType/source。
    expect(body).not.toHaveProperty('image');
    expect(JSON.stringify(body)).not.toContain('mediaType');
  });

  it('loads the public configuration without exposing a key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      provider: 'anthropic-compatible',
      model: 'evidence-model',
    }), { status: 200 }));
    const runtime = new LlmIncidentRuntime('/api/runtime', fetcher);

    const config = await runtime.getPublicConfig();

    expect(config).toMatchObject({ configured: true, model: 'evidence-model' });
    expect(JSON.stringify(config)).not.toContain('key');
  });

  it('uses the default fetcher safely in browsers where fetch rejects wrong receivers', async () => {
    const originalFetch = global.fetch;
    // 模拟浏览器 fetch：this 为非法 receiver 时抛 Illegal invocation。
    global.fetch = function (this: unknown) {
      if (this != null && this !== globalThis) {
        return Promise.reject(new TypeError("Failed to execute 'fetch': Illegal invocation"));
      }
      return Promise.resolve(new Response(JSON.stringify({
        configured: true,
        provider: 'anthropic-compatible',
        model: 'evidence-model',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    } as typeof fetch;
    try {
      const runtime = new LlmIncidentRuntime('/api/runtime');

      const config = await runtime.getPublicConfig();

      expect(config.configured).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects 200 responses whose payload is not a run instead of swallowing them', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>gateway health page</html>', { status: 200 }));
    const runtime = new LlmIncidentRuntime('/api/runtime', fetcher);

    const error = await runtime.createIncident('gateway-timeout').catch((caught) => caught);

    expect(error).toBeInstanceOf(RuntimeRequestError);
    expect(error).toMatchObject({ code: 'invalid_response', retryable: false });
  });

  it('times out hung requests instead of locking the UI forever', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const runtime = new LlmIncidentRuntime('/api/runtime', fetcher as never, 20);

    const error = await runtime.createIncident('gateway-timeout').catch((caught) => caught);

    expect(error).toBeInstanceOf(RuntimeRequestError);
    expect(error).toMatchObject({ code: 'timeout', retryable: true });
  });
});
