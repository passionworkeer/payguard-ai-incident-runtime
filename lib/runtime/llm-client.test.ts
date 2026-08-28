import { describe, expect, it, vi } from 'vitest';
import { callStageLlm, type LlmConfig } from './llm-client';
import { stageToolDefinitions } from './llm-schemas';
import { stageOrder } from './types';

const config: LlmConfig = {
  apiKey: 'secret-never-log',
  baseUrl: 'https://llm.example.test',
  model: 'evidence-model',
};

const verifyToolInput = {
  output: {
    isIncident: true,
    severity: 'P0',
    confidence: 96,
    impactScope: '支付成功率下降 28.36pp',
    evidenceHighlights: ['成功率断崖下降', 'P95 延迟快速抬升'],
    signalSummary: '4 个内部接口工具中 3 个 flag，与历史 case 相似度 0.78',
  },
  decisionFactors: [
    { label: '成功率', value: '71.36%', evidence: 'metrics://success-rate' },
  ],
  confidence: 96,
  summary: '多源工具信号聚合后确认 P0 真实故障。',
};

function responseWithTool(input: unknown, usage = { input_tokens: 321, output_tokens: 123 }) {
  return new Response(JSON.stringify({
    content: [{ type: 'tool_use', name: 'submit_verify_result', input }],
    usage,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('LLM client (evidence-driven)', () => {
  it('forces the stage tool call and serializes the structured context as text', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseWithTool(verifyToolInput));

    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: { merchant: '星海出行', alert: '支付接口超时率突增' },
      fetchImpl: fetcher,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_verify_result' });
    // 多模态截图已下线：messages[0].content 仅含文本上下文，不再有 image block。
    expect(body.messages[0].content).toHaveLength(1);
    expect(body.messages[0].content[0].type).toBe('text');
    expect(init.headers['x-api-key']).toBe(config.apiKey);
  });

  it('reserves enough output tokens to avoid truncating the tool JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseWithTool(verifyToolInput));

    await callStageLlm({
      config,
      stage: 'verify',
      context: { merchant: '星海出行', alert: '支付接口超时率突增' },
      fetchImpl: fetcher,
    });

    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it('returns validated output and token usage', async () => {
    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: { merchant: '星海出行' },
      fetchImpl: vi.fn().mockResolvedValue(responseWithTool(verifyToolInput)),
    });

    expect(result).toMatchObject({
      ok: true,
      output: verifyToolInput.output,
      usage: { inputTokens: 321, outputTokens: 123 },
      confidence: 96,
    });
  });

  it('rejects stage output that does not match the schema', async () => {
    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: {},
      fetchImpl: vi.fn().mockResolvedValue(responseWithTool({ output: { isIncident: 'yes' } })),
    });

    expect(result).toMatchObject({ ok: false, code: 'LLM_INVALID_OUTPUT', retryable: true });
  });

  it('sanitizes upstream errors and never returns the key or response body', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      `upstream leaked ${config.apiKey}`,
      { status: 503, statusText: 'Unavailable' },
    ));

    const result = await callStageLlm({
      config,
      stage: 'locate',
      context: {},
      fetchImpl: fetcher,
    });

    expect(result).toMatchObject({ ok: false, code: 'LLM_UPSTREAM_ERROR', retryable: true });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(JSON.stringify(result)).not.toContain('upstream leaked');
  });

  it('marks deterministic failures as non-retryable', async () => {
    const unauthorized = await callStageLlm({
      config,
      stage: 'locate',
      context: {},
      fetchImpl: vi.fn().mockResolvedValue(new Response('denied', { status: 401 })),
    });
    expect(unauthorized).toMatchObject({ ok: false, code: 'LLM_UNAUTHORIZED', retryable: false });
  });

  it('reports max_tokens truncation as a distinct non-retryable error with usage', async () => {
    const truncated = new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'submit_verify_result', input: verifyToolInput }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 400, output_tokens: 4096 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: {},
      fetchImpl: vi.fn().mockResolvedValue(truncated),
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'LLM_TRUNCATED',
      retryable: false,
      usage: { inputTokens: 400, outputTokens: 4096 },
    });
  });

  it('carries token usage on schema-validation failures', async () => {
    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: {},
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        content: [{ type: 'tool_use', name: 'submit_verify_result', input: { output: { isIncident: 'yes' } } }],
        usage: { input_tokens: 250, output_tokens: 90 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    });

    expect(result).toMatchObject({ ok: false, code: 'LLM_INVALID_OUTPUT', usage: { inputTokens: 250, outputTokens: 90 } });
  });

  it('defines one strict tool for every incident stage', () => {
    expect(Object.keys(stageToolDefinitions)).toEqual(stageOrder);
    for (const stage of stageOrder) {
      expect(stageToolDefinitions[stage].name).toBe(`submit_${stage}_result`);
      expect(stageToolDefinitions[stage].input_schema.additionalProperties).toBe(false);
    }
  });
});
