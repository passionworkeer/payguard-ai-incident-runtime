import type { IncidentStage, RuntimeEvent, StageExecution } from '../types';

const clock = ['14:23:18', '14:23:19', '14:23:21', '14:23:24'];

export function events(
  stage: IncidentStage,
  tools: Array<[string, string, number]>,
  decision: string,
): RuntimeEvent[] {
  const result: RuntimeEvent[] = [
    {
      id: `${stage}-start`,
      type: 'stage_started',
      at: clock[0],
      label: '阶段开始',
      detail: '载入本阶段输入与策略约束',
    },
  ];
  tools.forEach(([label, detail, durationMs], index) => {
    result.push({
      id: `${stage}-tool-${index}`,
      type: 'tool_call_completed',
      at: clock[Math.min(index + 1, clock.length - 1)],
      label,
      detail,
      durationMs,
    });
  });
  result.push({
    id: `${stage}-decision`,
    type: 'decision_ready',
    at: clock[clock.length - 1],
    label: '结构化决策完成',
    detail: decision,
  });
  return result;
}

export function stage(
  value: Omit<StageExecution, 'events'> & {
    tools: Array<[string, string, number]>;
    decision: string;
  },
): StageExecution {
  const { tools, decision, ...execution } = value;
  return { ...execution, events: events(value.stage, tools, decision) };
}
