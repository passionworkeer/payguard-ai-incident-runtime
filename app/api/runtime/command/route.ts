import { LlmRuntimeError, ServerIncidentOrchestrator } from '../../../../lib/runtime/server-orchestrator';
import { stageOrder, type IncidentStage } from '../../../../lib/runtime/types';

const orchestrator = new ServerIncidentOrchestrator();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStage(value: unknown): IncidentStage | null {
  return stageOrder.includes(value as IncidentStage) ? value as IncidentStage : null;
}

function safeError(error: unknown) {
  if (error instanceof LlmRuntimeError) {
    const status = error.code === 'LLM_UNAUTHORIZED' ? 401
      : error.code === 'LLM_RATE_LIMITED' ? 429
        : 502;
    return Response.json({ code: error.code, message: error.message, retryable: error.retryable }, { status });
  }
  const code = error instanceof Error ? error.message : 'runtime_error';
  const safeCodes = ['scenario_not_found', 'run_not_found', 'stage_out_of_order', 'approval_required', 'approval_not_found', 'human_handling_required', 'run_completed'];
  return Response.json({ code: safeCodes.includes(code) ? code : 'runtime_error', message: safeCodes.includes(code) ? code : '真实 Runtime 请求失败。', retryable: false }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.action !== 'string') throw new Error('invalid_command');
    switch (body.action) {
      case 'create':
        return Response.json(await orchestrator.createIncident(String(body.scenarioId ?? '')));
      case 'execute': {
        const stage = asStage(body.stage);
        if (!stage) throw new Error('stage_out_of_order');
        return Response.json(await orchestrator.executeStage(String(body.runId ?? ''), stage));
      }
      case 'approve':
        return Response.json(await orchestrator.approveAction(String(body.runId ?? ''), String(body.actionId ?? '')));
      case 'reject':
        return Response.json(await orchestrator.rejectAction(String(body.runId ?? ''), String(body.actionId ?? ''), String(body.reason ?? '转人工处理')));
      case 'get':
        return Response.json(await orchestrator.getRun(String(body.runId ?? '')));
      case 'reset':
        return Response.json(await orchestrator.resetRun(String(body.runId ?? '')));
      default:
        throw new Error('invalid_command');
    }
  } catch (error) {
    return safeError(error);
  }
}