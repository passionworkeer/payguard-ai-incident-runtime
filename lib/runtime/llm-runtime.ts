import type { PublicLlmConfig } from './llm-config';
import type { IncidentRun, IncidentRuntime, IncidentStage, StageExecution } from './types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class RuntimeRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'RuntimeRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Node 环境下 fetch 中止抛出的 DOMException 不继承 Error，须按 name 判定。
function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

// 服务端最坏情况 ≈ 30s LLM 超时 × 2 次调用 + 编排开销；浏览器侧兜底超时须高于它，
// 否则慢调用会在服务端完成前被浏览器误判为失败。
const DEFAULT_TIMEOUT_MS = 90_000;

export class LlmIncidentRuntime implements IncidentRuntime {
  constructor(
    private readonly baseUrl = '/api/runtime',
    // 箭头包装避免把本实例当作 fetch 的 receiver（浏览器会抛 Illegal invocation）。
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  getPublicConfig() {
    return this.request<PublicLlmConfig>(`${this.baseUrl}/config`, { validate: (payload) => isRecord(payload) && typeof payload.configured === 'boolean' });
  }

  createIncident(scenarioId: string) {
    return this.command<IncidentRun>({ action: 'create', scenarioId }, isRunPayload);
  }

  executeStage(runId: string, stage: IncidentStage) {
    return this.command<{ run: IncidentRun; execution: StageExecution }>({
      action: 'execute',
      runId,
      stage,
    }, (payload) => isRecord(payload) && isRunPayload(payload.run));
  }

  approveAction(runId: string, actionId: string) {
    return this.command<IncidentRun>({ action: 'approve', runId, actionId }, isRunPayload);
  }

  rejectAction(runId: string, actionId: string, reason: string) {
    return this.command<IncidentRun>({ action: 'reject', runId, actionId, reason }, isRunPayload);
  }

  getRun(runId: string) {
    return this.command<IncidentRun>({ action: 'get', runId }, isRunPayload);
  }

  resetRun(runId: string) {
    return this.command<IncidentRun>({ action: 'reset', runId }, isRunPayload);
  }

  private command<T>(body: Record<string, unknown>, validate: (payload: unknown) => boolean) {
    return this.request<T>(`${this.baseUrl}/command`, {
      method: 'POST',
      body: JSON.stringify(body),
      validate,
    });
  }

  private async request<T>(
    url: string,
    init: RequestInit & { validate?: (payload: unknown) => boolean } = {},
  ): Promise<T> {
    const { validate, ...requestInit } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...requestInit,
        headers: { 'Content-Type': 'application/json', ...requestInit.headers },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (isAbortError(error)) {
        throw new RuntimeRequestError(`真实 Runtime 请求超过 ${Math.round(this.timeoutMs / 1000)} 秒。`, 0, 'timeout', true);
      }
      throw new RuntimeRequestError('真实 Runtime 网络请求失败。', 0, 'network_error', true);
    }
    clearTimeout(timer);
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const body = isRecord(payload) ? payload : {};
      throw new RuntimeRequestError(
        typeof body.message === 'string' ? body.message : '真实 Runtime 请求失败。',
        response.status,
        typeof body.code === 'string' ? body.code : 'runtime_error',
        Boolean(body.retryable),
      );
    }
    // 200 但结构不符（代理健康页、缓存错误页等）不再静默吞成 {} 卡死加载态。
    if (!isRecord(payload) || (validate ? !validate(payload) : false)) {
      throw new RuntimeRequestError('真实 Runtime 返回了无效数据。', response.status, 'invalid_response', false);
    }
    return payload as T;
  }
}

function isRunPayload(payload: unknown): boolean {
  return isRecord(payload) && typeof payload.id === 'string' && typeof payload.status === 'string';
}