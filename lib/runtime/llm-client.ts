import { buildStageContext, buildStageSystemPrompt } from './llm-prompts';
import { stageToolDefinitions, validateStageToolInput } from './llm-schemas';
import type { IncidentStage } from './types';

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface StageImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: string;
  source: 'built_in' | 'uploaded';
}

export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_UNAUTHORIZED'
  | 'LLM_RATE_LIMITED'
  | 'LLM_TIMEOUT'
  | 'LLM_UPSTREAM_ERROR'
  | 'LLM_NO_TOOL'
  | 'LLM_INVALID_OUTPUT'
  | 'IMAGE_INVALID';

export type StageLlmResult = {
  ok: true;
  output: Record<string, unknown>;
  decisionFactors: Array<{ label: string; value: string; evidence: string }>;
  summary: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  model: string;
  imageSource?: StageImage['source'];
} | {
  ok: false;
  code: LlmErrorCode;
  message: string;
  retryable: boolean;
};

interface CallStageRequest {
  config: LlmConfig;
  stage: IncidentStage;
  context: Record<string, unknown>;
  image?: StageImage;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function validateConfig(config: LlmConfig): LlmErrorCode | null {
  if (!config.apiKey || !config.model || !config.baseUrl) return 'LLM_NOT_CONFIGURED';
  try {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:') return 'LLM_NOT_CONFIGURED';
  } catch {
    return 'LLM_NOT_CONFIGURED';
  }
  return null;
}

function validImage(image: StageImage | undefined) {
  if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType)) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return false;
  return Buffer.byteLength(image.data, 'base64') <= 4 * 1024 * 1024;
}

export async function callStageLlm(request: CallStageRequest): Promise<StageLlmResult> {
  if (validateConfig(request.config)) {
    return { ok: false, code: 'LLM_NOT_CONFIGURED', message: '真实 LLM 尚未配置。', retryable: false };
  }
  if (request.stage === 'verify' && !validImage(request.image)) {
    return { ok: false, code: 'IMAGE_INVALID', message: '核验图片无效或超过 4 MB。', retryable: false };
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = request.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const tool = stageToolDefinitions[request.stage];
  const text = { type: 'text', text: buildStageContext(request.stage, request.context) };
  const content = request.stage === 'verify'
    ? [{ type: 'image', source: { type: 'base64', media_type: request.image!.mediaType, data: request.image!.data } }, text]
    : [text];

  try {
    const response = await fetchImpl(`${request.config.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': request.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.config.model,
        max_tokens: 1600,
        system: buildStageSystemPrompt(request.stage),
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const code: LlmErrorCode = response.status === 401 || response.status === 403
        ? 'LLM_UNAUTHORIZED'
        : response.status === 429
          ? 'LLM_RATE_LIMITED'
          : 'LLM_UPSTREAM_ERROR';
      return {
        ok: false,
        code,
        message: code === 'LLM_UNAUTHORIZED' ? '真实 LLM 鉴权失败。' : code === 'LLM_RATE_LIMITED' ? '真实 LLM 当前限流。' : '真实 LLM 上游暂不可用。',
        retryable: code !== 'LLM_UNAUTHORIZED',
      };
    }

    const payload = await response.json() as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const toolUse = payload.content?.find((item) => item.type === 'tool_use' && item.name === tool.name);
    if (!toolUse) return { ok: false, code: 'LLM_NO_TOOL', message: '模型未返回预期结构化工具结果。', retryable: true };
    const validated = validateStageToolInput(request.stage, toolUse.input);
    if (!validated) return { ok: false, code: 'LLM_INVALID_OUTPUT', message: '模型结果未通过阶段 Schema 校验。', retryable: true };
    return {
      ok: true,
      ...validated,
      usage: { inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0 },
      durationMs: Math.max(1, Math.round(performance.now() - started)),
      model: request.config.model,
      imageSource: request.stage === 'verify' ? request.image?.source : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, code: 'LLM_TIMEOUT', message: `真实 LLM 调用超过 ${Math.round(timeoutMs / 1000)} 秒。`, retryable: true };
    }
    return { ok: false, code: 'LLM_UPSTREAM_ERROR', message: '真实 LLM 网络请求失败。', retryable: true };
  } finally {
    clearTimeout(timer);
  }
}
