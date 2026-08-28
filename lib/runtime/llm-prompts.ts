import type { IncidentStage } from './types';

const stageInstructions: Record<IncidentStage, string> = {
  // 多源信号聚合：模型消费 4 个内部接口的结构化返回（Metrics / Alerts / Logs / Change Records），
  // 而不是看截图。任一异常即触发复核，全部正常才标 isIncident=false。
  verify: '基于 4 类内部接口工具（metrics.query / alerts.context_fetch / logs.search / change_records.list）的结构化返回做多源信号聚合，判断是否为真实故障、严重度和影响范围。不得只凭单一信号下结论；至少 3/4 异常才能判定 isIncident=true，全部正常或仅容量类弱 flag 时判定 isIncident=false。',
  locate: '基于核验结果、logs.search / change_records.list / case_rag.retrieve 的返回选择 Top-1 根因。证据引用必须来自输入，禁止虚构。',
  contact: '基于已确认事实与 merchant.profile 返回的画像生成准确、分级且可操作的商户触达内容。message.composer 工具的输入 facts 字段只允许引用已确认事实，不得加入未确认推测。',
  escalate: '基于事故等级、影响金额和已批准触达匹配升级策略与责任团队。必须在 output 中显式输出 "simulated": true 声明仅为模拟方案，不执行真实外部动作。',
  recover: '基于 metrics.query + channel.health（新窗口数据）的返回判断是否稳定恢复；不得用单点回弹直接闭环。未达稳定标准就如实输出 recovered=false，系统会带新的观测窗口再次调用你，不要为了闭环放宽判据。',
  evaluate: '综合整个 Trace、审批与恢复事实生成评测样本，预测与最终事实必须分开记录。',
};

export function buildStageSystemPrompt(stage: IncidentStage) {
  return [
    '你是支付商户可靠性保障系统中的 AI 处置 Agent。',
    stageInstructions[stage],
    '必须调用指定工具返回结构化结果；不要在普通 content 中输出答案。',
    'decisionFactors 只记录可公开审计的证据与判断因子，不得输出隐藏思维链。',
    '所有内容均为合成演示数据。',
    stage === 'escalate'
      ? '再次确认：JSON Boolean true（小写、不带引号），不要写成字符串 "true" 或数字 1。'
      : '',
  ].filter(Boolean).join('\n');
}

export function buildStageContext(stage: IncidentStage, context: Record<string, unknown>) {
  return `当前阶段：${stage}\n请严格基于以下 JSON 上下文完成任务：\n${JSON.stringify(context, null, 2)}`;
}
