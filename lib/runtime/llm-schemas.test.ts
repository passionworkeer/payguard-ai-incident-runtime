import { describe, expect, it } from 'vitest';
import { validateStageToolInput } from './llm-schemas';

describe('validateStageToolInput 数量收敛', () => {
  it('clamps excess decision factors instead of rejecting the whole result', () => {
    const factors = Array.from({ length: 10 }, (_, index) => ({
      label: `因素${index}`,
      value: `结论${index}`,
      evidence: `evidence://${index}`,
    }));

    const validated = validateStageToolInput('verify', {
      output: {
        isIncident: true,
        severity: 'P0',
        confidence: 96,
        impactScope: '支付成功率下降 28.36pp',
        visualFindings: ['成功率断崖下降'],
      },
      decisionFactors: factors,
      confidence: 96,
      summary: '监控截图与结构化指标相互印证。',
    });

    expect(validated).not.toBeNull();
    expect(validated!.decisionFactors).toHaveLength(8);
    expect(validated!.decisionFactors[0].label).toBe('因素0');
  });

  it('clamps string-array length and over-long strings instead of rejecting', () => {
    const validated = validateStageToolInput('contact', {
      output: {
        subject: '支付异常通知',
        message: 'x'.repeat(2500),
        actionLinkLabel: '查看进展',
        channels: ['站内信', '短信', '邮件', '电话', '推送', '传真', '钉钉', '企微', '微博', '知乎'],
      },
      decisionFactors: [{ label: '定级', value: 'P0', evidence: 'verify.severity' }],
      confidence: 95,
      summary: '已生成商户触达方案。',
    });

    expect(validated).not.toBeNull();
    expect(validated!.output.message).toHaveLength(1200);
    expect(validated!.output.channels).toHaveLength(8);
  });

  it('still rejects type-level violations after clamping', () => {
    expect(validateStageToolInput('verify', {
      output: {
        isIncident: 'true',
        severity: 'P0',
        confidence: 96,
        impactScope: '影响说明',
        visualFindings: ['成功率下降'],
      },
      decisionFactors: [{ label: '定级', value: 'P0', evidence: 'verify.severity' }],
      confidence: 96,
      summary: '摘要',
    })).toBeNull();

    expect(validateStageToolInput('verify', {
      output: {
        isIncident: true,
        severity: 'S0',
        confidence: 96,
        impactScope: '影响说明',
        visualFindings: ['成功率下降'],
      },
      decisionFactors: [{ label: '定级', value: 'P0', evidence: 'verify.severity' }],
      confidence: '96',
      summary: '摘要',
    })).toBeNull();
  });
});
