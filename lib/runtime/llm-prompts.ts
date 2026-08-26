import type { IncidentStage } from './types';

const stageInstructions: Record<IncidentStage, string> = {
  verify: '交叉核对监控截图与结构化指标，判断是否为真实故障、严重度和影响范围。visualFindings 只能描述图片中可见趋势。',
  locate: '基于核验结果、日志、变更和历史 Case 选择 Top-1 根因。证据引用必须来自输入，禁止虚构。',
  contact: '基于已确认事实生成准确、分级且可操作的商户触达内容，不得加入未确认推测。',
  escalate: '基于事故等级、影响金额和已批准触达生成内部升级方案。只生成模拟方案，不执行真实外部动作。',
  recover: '比较三个连续窗口与事故前基线，判断是否稳定恢复；不得用单点回弹直接闭环。',
  evaluate: '综合整个 Trace、审批与恢复事实生成评测样本，预测与最终事实必须分开记录。',
};

export function buildStageSystemPrompt(stage: IncidentStage) {
  return [
    '你是支付商户可靠性保障系统中的 AI 处置 Agent。',
    stageInstructions[stage],
    '必须调用指定工具返回结构化结果；不要在普通 content 中输出答案。',
    'decisionFactors 只记录可公开审计的证据与判断因子，不得输出隐藏思维链。',
    '所有内容均为合成演示数据。',
  ].join('\n');
}

export function buildStageContext(stage: IncidentStage, context: Record<string, unknown>) {
  return `当前阶段：${stage}\n请严格基于以下 JSON 上下文完成任务：\n${JSON.stringify(context, null, 2)}`;
}
