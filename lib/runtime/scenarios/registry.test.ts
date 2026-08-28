import { describe, expect, it } from 'vitest';
import { incidentSummaries } from '../../mock-data';
import { runtimeScenarios, resolveStageFixture, scenarioOrder } from './index';
import { gatewayTimeoutScenario } from './gateway-timeout';
import { channelReboundScenario } from './channel-rebound';
import { falseAlarmScenario } from './false-alarm';
import { merchantCertScenario } from './merchant-cert';

const REQUIRED_STAGES = ['verify', 'locate', 'contact', 'escalate', 'recover', 'evaluate'] as const;

describe('scenarios/registry', () => {
  it('exposes exactly the four expected scenarios in display order', () => {
    expect(Object.keys(runtimeScenarios).sort()).toEqual([
      'channel-rebound',
      'false-alarm',
      'gateway-timeout',
      'merchant-cert',
    ]);
    // 展示顺序固定为「黄金路径 → 误报短路 → 策略差异化 → 恢复重入」，
    // 不要让字典序意外改动 selector UI。
    expect([...scenarioOrder]).toEqual([
      'gateway-timeout',
      'false-alarm',
      'merchant-cert',
      'channel-rebound',
    ]);
  });

  it('declares a fixture for every required stage in every scenario', () => {
    for (const [id, scenario] of Object.entries(runtimeScenarios)) {
      for (const stage of REQUIRED_STAGES) {
        expect(scenario.stages[stage], `${id} missing ${stage}`).toBeDefined();
        expect(scenario.stages[stage].stage, `${id}.${stage}.stage`).toBe(stage);
        expect(typeof scenario.stages[stage].input, `${id}.${stage}.input`).toBe('object');
        expect(scenario.stages[stage].output, `${id}.${stage}.output`).toBeDefined();
        expect(typeof scenario.stages[stage].title, `${id}.${stage}.title`).toBe('string');
      }
    }
  });

  it('marks contact as a human-gate in every scenario (requiresApproval)', () => {
    for (const [id, scenario] of Object.entries(runtimeScenarios)) {
      // contact 必须显式声明 requiresApproval，否则审批门会被意外跳过。
      const contact = scenario.stages.contact;
      expect(contact.requiresApproval, `${id}.contact.requiresApproval`).toBe(true);
    }
  });

  it('requires groundTruth fields on every scenario', () => {
    for (const [id, scenario] of Object.entries(runtimeScenarios)) {
      expect(scenario.groundTruth, `${id}.groundTruth`).toBeDefined();
      expect(typeof scenario.groundTruth.isIncident).toBe('boolean');
      expect(['P0', 'P1', 'P2']).toContain(scenario.groundTruth.severity);
      expect(typeof scenario.groundTruth.rootCause).toBe('string');
      expect(Array.isArray(scenario.groundTruth.acceptableCauses)).toBe(true);
      expect(scenario.groundTruth.acceptableCauses.length).toBeGreaterThan(0);
      expect(Array.isArray(scenario.groundTruth.rootCauseKeywords)).toBe(true);
      expect(scenario.groundTruth.rootCauseKeywords.length).toBeGreaterThan(0);
      expect(typeof scenario.groundTruth.recovered).toBe('boolean');
      expect(scenario.expectedPath.length, `${id}.expectedPath`).toBeGreaterThan(0);
      // groundTruth.rootCause 必须在自己的关键词里（防止误把空字符串当作答案）。
      const kt = scenario.groundTruth.rootCauseKeywords.join(' ');
      for (const keyword of scenario.groundTruth.rootCauseKeywords) {
        expect(kt).toContain(keyword);
      }
    }
  });

  it('keeps the gateway scenario untouched by the multi-scenario refactor', () => {
    // 反向防回归：黄金路径是产品演示的参照点，行为变化要靠 review 而不是悄悄修改。
    expect(gatewayTimeoutScenario.id).toBe('gateway-timeout');
    expect(gatewayTimeoutScenario.label).toBe('网关超时 P0');
    expect(gatewayTimeoutScenario.expectedPath).toEqual([
      'verify',
      'locate',
      'contact',
      'escalate',
      'recover',
      'evaluate',
    ]);
    expect(gatewayTimeoutScenario.groundTruth.isIncident).toBe(true);
    expect(gatewayTimeoutScenario.retryStages).toBeUndefined();
  });

  it('binds scenarios bidirectionally to incident summaries', () => {
    // 事故中心行 ↔ 演示场景必须一一对应，少一/多一/错配都会让「进入处置演示」跳错链路。
    const byScenario = Object.values(runtimeScenarios).map((s) => s.incidentId);
    const bySummary = incidentSummaries.map((s) => s.id);
    expect([...byScenario].sort()).toEqual([...bySummary].sort());

    const summaryIds = new Set(bySummary);
    for (const id of byScenario) {
      expect(summaryIds.has(id), `场景 incidentId ${id} 未在 incidentSummaries 出现`).toBe(true);
    }

    for (const summary of incidentSummaries) {
      const scenario = runtimeScenarios[summary.scenarioId];
      expect(scenario, `${summary.id} scenarioId=${summary.scenarioId} 未注册`).toBeDefined();
      expect(scenario.incidentId).toBe(summary.id);
      // 演示链路必须能跳转：场景 monitorImage 必须可用，merchant/title 也要对得上事故摘要。
      expect(scenario.monitorImage.startsWith('/mock/'), `${summary.id} monitorImage`).toBe(true);
      expect(scenario.incident.merchant).toBe(summary.merchant);
    }
  });

  it('resolveStageFixture returns first attempt fixture and clamps retry attempts', () => {
    const scenario = channelReboundScenario;
    const recoverRetries = scenario.retryStages?.recover;
    expect(recoverRetries, 'channel-rebound 应声明 recover 的 retryStages').toBeDefined();
    expect(recoverRetries!.length).toBeGreaterThan(0);
    // 首轮：attempts=1 → 走 stages[stage]。
    expect(resolveStageFixture(scenario, 'recover', 1)).toBe(scenario.stages.recover);
    // attempt=2 → 走 retryStages[0]，必须给「新窗口」数据，否则真实模式会原地打转。
    const attempt2 = resolveStageFixture(scenario, 'recover', 2);
    expect(attempt2).toBe(recoverRetries![0]);
    expect(attempt2).not.toBe(scenario.stages.recover);
    // 超出已有 retry 数量：钳制到最后一条 fixture（不抛错、不循环回首条）。
    const attempt99 = resolveStageFixture(scenario, 'recover', 99);
    expect(attempt99).toBe(recoverRetries![recoverRetries!.length - 1]);
    // 没有 retryStages 的场景：attempt>1 仍然回退到首轮 fixture（线性场景不会重入）。
    const linear = resolveStageFixture(gatewayTimeoutScenario, 'recover', 5);
    expect(linear).toBe(gatewayTimeoutScenario.stages.recover);
  });
});