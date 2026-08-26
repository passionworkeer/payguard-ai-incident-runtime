import { RuntimeRequestError } from './http-runtime';
import type { PublicLlmConfig } from './llm-config';
import type { StageImage } from './llm-client';
import type { IncidentRun, IncidentRuntime, IncidentStage, StageExecution } from './types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class LlmIncidentRuntime implements IncidentRuntime {
  private verifyImage?: StageImage;

  constructor(
    private readonly baseUrl = '/api/runtime',
    // 箭头包装避免把本实例当作 fetch 的 receiver（浏览器会抛 Illegal invocation）。
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  setVerifyImage(image: StageImage) {
    this.verifyImage = image;
  }

  getPublicConfig() {
    return this.request<PublicLlmConfig>(`${this.baseUrl}/config`);
  }

  createIncident(scenarioId: string) {
    return this.command<IncidentRun>({ action: 'create', scenarioId });
  }

  executeStage(runId: string, stage: IncidentStage) {
    return this.command<{ run: IncidentRun; execution: StageExecution }>({
      action: 'execute',
      runId,
      stage,
      image: stage === 'verify' ? this.verifyImage : undefined,
    });
  }

  approveAction(runId: string, actionId: string) {
    return this.command<IncidentRun>({ action: 'approve', runId, actionId });
  }

  rejectAction(runId: string, actionId: string, reason: string) {
    return this.command<IncidentRun>({ action: 'reject', runId, actionId, reason });
  }

  getRun(runId: string) {
    return this.command<IncidentRun>({ action: 'get', runId });
  }

  resetRun(runId: string) {
    return this.command<IncidentRun>({ action: 'reset', runId });
  }

  private command<T>(body: Record<string, unknown>) {
    return this.request<T>(`${this.baseUrl}/command`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new RuntimeRequestError('真实 Runtime 网络请求失败。', 0, 'network_error', true);
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new RuntimeRequestError(
        typeof payload.message === 'string' ? payload.message : '真实 Runtime 请求失败。',
        response.status,
        typeof payload.code === 'string' ? payload.code : 'runtime_error',
        Boolean(payload.retryable),
      );
    }
    return payload as T;
  }
}
