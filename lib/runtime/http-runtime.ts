import type {
  IncidentRun,
  IncidentRuntime,
  IncidentStage,
  StageExecution,
} from './types';

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

export class HttpIncidentRuntime implements IncidentRuntime {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  createIncident(scenarioId: string) {
    return this.request<IncidentRun>('', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    });
  }

  executeStage(runId: string, stage: IncidentStage) {
    return this.request<{ run: IncidentRun; execution: StageExecution }>(
      `/${encodeURIComponent(runId)}/stages/${stage}`,
      { method: 'POST' },
    );
  }

  approveAction(runId: string, actionId: string) {
    return this.request<IncidentRun>(`/${encodeURIComponent(runId)}/actions/${encodeURIComponent(actionId)}/approve`, {
      method: 'POST',
    });
  }

  rejectAction(runId: string, actionId: string, reason: string) {
    return this.request<IncidentRun>(`/${encodeURIComponent(runId)}/actions/${encodeURIComponent(actionId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  getRun(runId: string) {
    return this.request<IncidentRun>(`/${encodeURIComponent(runId)}`);
  }

  resetRun(runId: string) {
    return this.request<IncidentRun>(`/${encodeURIComponent(runId)}/reset`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
    } catch (error) {
      throw new RuntimeRequestError(
        error instanceof Error ? error.message : 'network_error',
        0,
        'network_error',
        true,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new RuntimeRequestError(
        typeof payload.message === 'string' ? payload.message : `request_failed_${response.status}`,
        response.status,
        typeof payload.code === 'string' ? payload.code : 'request_failed',
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }
    return payload as T;
  }
}
