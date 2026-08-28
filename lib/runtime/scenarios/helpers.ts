import type { IncidentStage, RuntimeEvent, StageExecution, ToolCall } from '../types';

const clock = ['14:23:18', '14:23:19', '14:23:21', '14:23:24'];

// 工具调用 → RuntimeEvent 流水：保留事件序列用于 StepRail 动画与回放。
function events(stage: IncidentStage, tools: ToolCall[], decision: string): RuntimeEvent[] {
  const result: RuntimeEvent[] = [
    { id: `${stage}-start`, type: 'stage_started', at: clock[0], label: '阶段开始', detail: '载入本阶段上下文与策略约束' },
  ];
  tools.forEach((tool, index) => {
    result.push({
      id: `${stage}-tool-${index}`,
      type: tool.status === 'failed' ? 'tool_call_failed' : 'tool_call_completed',
      at: clock[Math.min(index + 1, clock.length - 1)],
      label: tool.displayName,
      detail: tool.flagged ? (tool.flagReason ?? '检出异常信号') : '无异常信号',
      durationMs: tool.latencyMs,
    });
  });
  result.push({ id: `${stage}-decision`, type: 'decision_ready', at: clock[clock.length - 1], label: '结构化决策完成', detail: decision });
  return result;
}

export function stage(
  value: Omit<StageExecution, 'events'> & { decision: string },
): StageExecution {
  const { decision, ...execution } = value;
  return { ...execution, events: events(value.stage, value.tools, decision) };
}