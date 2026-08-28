import { buildStageContext, buildStageSystemPrompt } from './llm-prompts';
import { stageToolDefinitions, validateStageToolInput } from './llm-schemas';
import type { IncidentStage } from './types';

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_UNAUTHORIZED'
  | 'LLM_RATE_LIMITED'
  | 'LLM_TIMEOUT'
  | 'LLM_UPSTREAM_ERROR'
  | 'LLM_NO_TOOL'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_TRUNCATED';

export type StageLlmResult = {
  ok: true;
  output: Record<string, unknown>;
  decisionFactors: Array<{ label: string; value: string; evidence: string }>;
  confidence: number;
  summary: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  model: string;
} | {
  ok: false;
  code: LlmErrorCode;
  message: string;
  retryable: boolean;
  // 已产生计费但结构未过校验的调用（如 Schema 失败、max_tokens 截断）会带上实际用量，
  // 供编排器累计，避免观测面板系统性低估。
  usage?: { inputTokens: number; outputTokens: number };
};

interface CallStageRequest {
  config: LlmConfig;
  stage: IncidentStage;
  context: Record<string, unknown>;
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

export async function callStageLlm(request: CallStageRequest): Promise<StageLlmResult> {
  if (validateConfig(request.config)) {
    return { ok: false, code: 'LLM_NOT_CONFIGURED', message: '真实 LLM 尚未配置。', retryable: false };
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = request.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const tool = stageToolDefinitions[request.stage];
  const text = { type: 'text', text: buildStageContext(request.stage, request.context) };

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
        // 预留充足输出空间：决策依据 + 结构化输出接近 1600 token 时会截断 tool JSON，
        // 导致 Schema 校验随机失败。
        max_tokens: 4096,
        system: buildStageSystemPrompt(request.stage),
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: [text] }],
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
        // 仅瞬态类错误可重试；确定性失败（鉴权、参数等）重试必然再失败。
        retryable: code === 'LLM_RATE_LIMITED' || code === 'LLM_UPSTREAM_ERROR',
      };
    }

    const payload = await response.json() as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const usedTokens = { inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0 };
    if (payload.stop_reason === 'max_tokens') {
      // 截断时 tool JSON 必然不完整，重试同样长度的请求只会再次截断。
      return { ok: false, code: 'LLM_TRUNCATED', message: '真实 LLM 输出被 max_tokens 截断，需调大输出上限。', retryable: false, usage: usedTokens };
    }
    const toolUse = payload.content?.find((item) => item.type === 'tool_use' && item.name === tool.name);
    if (!toolUse) return { ok: false, code: 'LLM_NO_TOOL', message: '模型未返回预期结构化工具结果。', retryable: true, usage: usedTokens };
    const validated = validateStageToolInput(request.stage, toolUse.input);
    if (!validated) return { ok: false, code: 'LLM_INVALID_OUTPUT', message: '模型结果未通过阶段 Schema 校验。', retryable: true, usage: usedTokens };
    return {
      ok: true,
      ...validated,
      usage: usedTokens,
      durationMs: Math.max(1, Math.round(performance.now() - started)),
      model: request.config.model,
    };
  } catch (error) {
    // Node 环境下 fetch 中止抛出的 DOMException 不继承 Error，须按 name 判定。
    if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') {
      return { ok: false, code: 'LLM_TIMEOUT', message: `真实 LLM 调用超过 ${Math.round(timeoutMs / 1000)} 秒。`, retryable: true };
    }
    return { ok: false, code: 'LLM_UPSTREAM_ERROR', message: '真实 LLM 网络请求失败。', retryable: true };
  } finally {
    clearTimeout(timer);
  }
}