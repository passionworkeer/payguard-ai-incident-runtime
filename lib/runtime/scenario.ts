import type {
  IncidentStage,
  RuntimeEvent,
  RuntimeScenario,
  StageExecution,
} from './types';

const clock = ['14:23:18', '14:23:19', '14:23:21', '14:23:24'];

function events(
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

function stage(
  value: Omit<StageExecution, 'events'> & {
    tools: Array<[string, string, number]>;
    decision: string;
  },
): StageExecution {
  const { tools, decision, ...execution } = value;
  return { ...execution, events: events(value.stage, tools, decision) };
}

export const gatewayTimeoutScenario: RuntimeScenario = {
  id: 'gateway-timeout',
  incident: {
    merchant: '星海出行',
    severity: 'P0',
    impact: '¥286.4万',
    title: '支付接口超时率突增',
    detectedAt: '2026-08-26 14:23:18',
  },
  stages: {
    verify: stage({
      stage: 'verify',
      title: '智能核验结果',
      goal: '确认告警是否为真实故障，并识别影响等级。',
      input: {
        paymentSuccessRate: '99.72% → 71.36%',
        p95Latency: '126ms → 4,620ms',
        timeoutGrowth: '23.4×',
        observationWindow: '连续 5 分钟',
      },
      tools: [
        ['Metrics', '拉取支付成功率、RT 与流量基线', 486],
        ['Alert Context', '合并重复告警并检查异常窗口', 318],
      ],
      decision: '真实 P0 故障，进入根因定位。',
      decisionFactors: [
        { label: '成功率跌幅', value: '-28.36pp', evidence: 'metric://pay.success_rate' },
        { label: '延迟倍率', value: '36.7×', evidence: 'metric://merchant.p95_rt' },
        { label: '异常持续', value: '5 分钟', evidence: 'alert://window/1423' },
      ],
      output: {
        isIncident: true,
        severity: 'P0',
        affectedScope: '星海出行支付接口',
        evidenceGrounded: true,
      },
      metrics: { latencyMs: 1240, inputTokens: 612, outputTokens: 230, costYuan: 0.06, confidence: 96, toolCalls: 2, evidenceCount: 3 },
      gate: '真实故障且置信度 ≥ 90%',
      successMetric: 'P0 Recall ≥ 99%',
      risk: '单指标尖峰可能造成误报。',
      fallback: '置信度不足时转人工核验，不自动升级。',
    }),
    locate: stage({
      stage: 'locate',
      title: '根因定位结果',
      goal: '关联指标、日志、变更与历史案例，输出可审计根因。',
      input: { incident: 'P0', service: 'merchant-api-gateway', window: '14:18–14:27' },
      tools: [
        ['Metrics', '确认连接数与排队时长同步升高', 612],
        ['Logs', '检索到 pool acquire timeout 18,432 条', 1320],
        ['Change Records', '发现 14:19 连接池参数变更', 584],
        ['Case RAG', '召回 2026-07-18 相似案例', 1486],
      ],
      decision: 'Top-1 根因为商户 API 网关连接池耗尽。',
      decisionFactors: [
        { label: '日志命中', value: '18,432 条', evidence: 'log://gateway/pool-timeout' },
        { label: '变更相关', value: '异常前 4 分钟', evidence: 'change://chg-0826-1419' },
        { label: '案例相似度', value: '91.4%', evidence: 'case://2026-07-18-044' },
      ],
      output: {
        topCause: '商户 API 网关连接池耗尽',
        alternatives: ['下游网络抖动', '单机房流量倾斜'],
        recommendedAction: '回滚连接池参数并扩容实例',
      },
      metrics: { latencyMs: 4380, inputTokens: 1482, outputTokens: 482, costYuan: 0.18, confidence: 93, toolCalls: 4, evidenceCount: 4 },
      gate: 'Top-1 置信度 ≥ 85%，Evidence Grounding 达标',
      successMetric: 'Root Cause Top-1 Accuracy ≥ 85%',
      risk: '历史案例相似不代表根因必然相同。',
      fallback: '展示 Top-3 和反证，交由值班工程师确认。',
    }),
    contact: stage({
      stage: 'contact',
      title: '商户触达方案',
      goal: '生成准确、分级且可操作的商户沟通内容。',
      input: { merchantTier: '战略商户', channel: '站内信 + 短信', confirmedCause: '连接池耗尽' },
      tools: [
        ['Merchant Profile', '读取商户等级、联系人与渠道偏好', 286],
        ['Message Composer', '生成 P0 通知与排查建议', 504],
      ],
      decision: '内容已生成，等待人工批准后发送。',
      decisionFactors: [
        { label: '事实边界', value: '仅引用已确认根因', evidence: 'trace://locate/output' },
        { label: '触达策略', value: '站内信 + 短信', evidence: 'merchant://profile/channel' },
      ],
      output: {
        subject: '支付接口异常处置通知',
        message: '检测到支付接口连接池耗尽。建议回滚 14:19 参数变更并扩容实例，我们将持续同步恢复进展。',
        actionLink: '查看排查步骤',
      },
      metrics: { latencyMs: 980, inputTokens: 448, outputTokens: 164, costYuan: 0.05, confidence: 95, toolCalls: 2, evidenceCount: 2 },
      gate: '高影响外部动作必须人工批准',
      successMetric: '送达率、点击率与回复率',
      risk: '未经确认的信息可能造成商户误解。',
      fallback: '拒绝后转人工电话沟通并记录原因。',
      requiresApproval: true,
    }),
    escalate: stage({
      stage: 'escalate',
      title: '故障升级结果',
      goal: '依据影响面和持续时间匹配升级策略与责任团队。',
      input: { severity: 'P0', impact: '¥286.4万', duration: '11m 06s', recoveryProgress: '未恢复' },
      tools: [
        ['Policy Engine', '命中 P0 战略商户升级策略', 164],
        ['On-call Directory', '定位商户保障与网关值班团队', 142],
        ['Ticket', '创建仿真工单 MOCK-INC-031', 154],
      ],
      decision: '升级至双团队联合处置，SLA 15 分钟。',
      decisionFactors: [
        { label: '事故等级', value: 'P0', evidence: 'trace://verify/severity' },
        { label: '影响金额', value: '¥286.4万', evidence: 'impact://estimate/031' },
      ],
      output: { ticketId: 'MOCK-INC-031', teams: ['商户保障', '网关平台'], sla: '15 分钟', simulated: true },
      metrics: { latencyMs: 460, inputTokens: 184, outputTokens: 102, costYuan: 0.03, confidence: 98, toolCalls: 3, evidenceCount: 2 },
      gate: 'P0 或影响金额 ≥ ¥100万',
      successMetric: '升级策略命中率与 SLA 达成率',
      risk: '过度升级会增加值班噪声。',
      fallback: '策略冲突时选择更高等级并提示人工确认。',
    }),
    recover: stage({
      stage: 'recover',
      title: '恢复判断结果',
      goal: '用连续观测窗口确认真实恢复，防止指标短暂回弹。',
      input: { windows: ['14:37–14:39', '14:39–14:41', '14:41–14:43'], baseline: '近 7 日同小时' },
      tools: [
        ['Metrics', '对比三个连续窗口与历史基线', 1040],
        ['Logs', '确认 pool timeout 已降至正常范围', 486],
      ],
      decision: '连续三个窗口稳定，事故可以关闭。',
      decisionFactors: [
        { label: '支付成功率', value: '99.68%', evidence: 'metric://pay.success_rate/recovery' },
        { label: 'P95 RT', value: '139ms', evidence: 'metric://merchant.p95_rt/recovery' },
        { label: '稳定窗口', value: '3/3', evidence: 'metric://recovery/windows' },
      ],
      output: { recovered: true, stableWindows: 3, residualRisk: '低', observationAdvice: '继续观察 15 分钟' },
      metrics: { latencyMs: 1860, inputTokens: 542, outputTokens: 192, costYuan: 0.1, confidence: 94, toolCalls: 2, evidenceCount: 3 },
      gate: '连续三个窗口均回到基线范围',
      successMetric: '恢复误判率与 MTTR',
      risk: '单窗口恢复可能只是短暂回弹。',
      fallback: '任一窗口不达标则保持事故打开。',
    }),
    evaluate: stage({
      stage: 'evaluate',
      title: '评测回流结果',
      goal: '把最终处置事实沉淀为可复用评测样本。',
      input: { labelSource: '最终工单 + 人工审批 + 恢复窗口', promptVersion: 'v3.4' },
      tools: [
        ['Eval Store', '写入核验、根因与工具选择标签', 284],
        ['Metric Calculator', '刷新离线与线上效果指标', 362],
      ],
      decision: '样本通过质量检查并进入常态化评测集。',
      decisionFactors: [
        { label: '核验结果', value: 'TP', evidence: 'eval://verify/031' },
        { label: 'Top-1 根因', value: '命中', evidence: 'eval://root-cause/031' },
        { label: '人工修正', value: '无', evidence: 'eval://human/031' },
      ],
      output: { sampleId: 'EVAL-20260826-031', finalRootCause: '商户 API 网关连接池耗尽', humanCorrected: false, dataset: 'merchant-incident-v12' },
      metrics: { latencyMs: 646, inputTokens: 324, outputTokens: 126, costYuan: 0.04, confidence: 99, toolCalls: 2, evidenceCount: 3 },
      gate: '最终事实、人工反馈和恢复结果齐全',
      successMetric: 'Recall、F1、Top-K、Grounding 与人工接管率',
      risk: '错误标签会放大后续评测偏差。',
      fallback: '证据不完整的样本进入待标注队列。',
    }),
  },
};

export const runtimeScenarios: Record<string, RuntimeScenario> = {
  [gatewayTimeoutScenario.id]: gatewayTimeoutScenario,
};
