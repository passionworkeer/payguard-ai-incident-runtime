import { describe, expect, it, vi } from 'vitest';
import { callStageLlm, type LlmConfig } from './llm-client';
import { stageToolDefinitions } from './llm-schemas';
import { stageOrder } from './types';

const config: LlmConfig = {
  apiKey: 'secret-never-log',
  baseUrl: 'https://llm.example.test',
  model: 'multimodal-model',
};

const verifyToolInput = {
  output: {
    isIncident: true,
    severity: 'P0',
    confidence: 96,
    impactScope: '支付成功率下降 28.36pp',
    visualFindings: ['成功率断崖下降', 'P95 延迟快速抬升'],
  },
  decisionFactors: [
    { label: '成功率', value: '71.36%', evidence: 'metrics://success-rate' },
  ],
  summary: '监控截图与结构化指标相互印证，确认为 P0 真实故障。',
};

function responseWithTool(input: unknown, usage = { input_tokens: 321, output_tokens: 123 }) {
  return new Response(JSON.stringify({
    content: [{ type: 'tool_use', name: 'submit_verify_result', input }],
    usage,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('multimodal LLM client', () => {
  it('sends the verify image and forces the stage tool call', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseWithTool(verifyToolInput));

    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: { merchant: '星海出行', alert: '支付接口超时率突增' },
      image: { mediaType: 'image/png', data: 'iVBORw0KGgo=', source: 'built_in' },
      fetchImpl: fetcher,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_verify_result' });
    expect(body.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    });
    expect(init.headers['x-api-key']).toBe(config.apiKey);
  });

  it('returns validated output and token usage', async () => {
    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: { merchant: '星海出行' },
      image: { mediaType: 'image/png', data: 'iVBORw0KGgo=', source: 'uploaded' },
      fetchImpl: vi.fn().mockResolvedValue(responseWithTool(verifyToolInput)),
    });

    expect(result).toMatchObject({
      ok: true,
      output: verifyToolInput.output,
      usage: { inputTokens: 321, outputTokens: 123 },
      imageSource: 'uploaded',
    });
  });

  it('rejects stage output that does not match the schema', async () => {
    const result = await callStageLlm({
      config,
      stage: 'verify',
      context: {},
      image: { mediaType: 'image/png', data: 'iVBORw0KGgo=', source: 'built_in' },
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

  it('defines one strict tool for every incident stage', () => {
    expect(Object.keys(stageToolDefinitions)).toEqual(stageOrder);
    for (const stage of stageOrder) {
      expect(stageToolDefinitions[stage].name).toBe(`submit_${stage}_result`);
      expect(stageToolDefinitions[stage].input_schema.additionalProperties).toBe(false);
    }
  });
});
