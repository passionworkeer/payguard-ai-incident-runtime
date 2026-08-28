import type { LlmConfig } from './llm-client';

export interface PublicLlmConfig {
  configured: boolean;
  provider: 'anthropic-compatible';
  model: string;
}

function clean(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, '') ?? '';
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  return {
    apiKey: clean(env.key ?? env.LLM_API_KEY),
    baseUrl: clean(env.url ?? env.LLM_BASE_URL),
    model: clean(env.model ?? env.LLM_MODEL),
  };
}

export function publicLlmConfig(config = readLlmConfig()): PublicLlmConfig {
  let configured = Boolean(config.apiKey && config.model && config.baseUrl);
  try {
    configured = configured && new URL(config.baseUrl).protocol === 'https:';
  } catch {
    configured = false;
  }
  return {
    configured,
    provider: 'anthropic-compatible',
    model: configured ? config.model : '未配置',
  };
}
