import type { IncidentStage, RuntimeScenario, StageExecution } from '../types';
import { channelReboundScenario } from './channel-rebound';
import { falseAlarmScenario } from './false-alarm';
import { gatewayTimeoutScenario } from './gateway-timeout';
import { merchantCertScenario } from './merchant-cert';

export { channelReboundScenario, falseAlarmScenario, gatewayTimeoutScenario, merchantCertScenario };

export const runtimeScenarios: Record<string, RuntimeScenario> = {
  [gatewayTimeoutScenario.id]: gatewayTimeoutScenario,
  [falseAlarmScenario.id]: falseAlarmScenario,
  [merchantCertScenario.id]: merchantCertScenario,
  [channelReboundScenario.id]: channelReboundScenario,
};

// 场景选择器的展示顺序：黄金路径在前，其余按讲解递进（误报短路 → 策略差异化 → 恢复重入）。
export const scenarioOrder = [
  gatewayTimeoutScenario.id,
  falseAlarmScenario.id,
  merchantCertScenario.id,
  channelReboundScenario.id,
] as const;

// 取本次 attempt 对应的阶段 fixture：首轮用 stages，重入按 retryStages 顺序取，超界复用最后一个。
export function resolveStageFixture(
  scenario: RuntimeScenario,
  stage: IncidentStage,
  attempt: number,
): StageExecution {
  if (attempt <= 1) return scenario.stages[stage];
  const retries = scenario.retryStages?.[stage];
  if (!retries || retries.length === 0) return scenario.stages[stage];
  return retries[Math.min(attempt - 2, retries.length - 1)];
}
