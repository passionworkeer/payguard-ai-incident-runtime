'use client';

import { useState } from 'react';
import type { IncidentRun, IncidentStage, StageExecution } from '../../lib/runtime/types';
import { stageNames } from './StepRail';

// 输入键 → 中文标签。mock fixture 与 llm 模式共用同一份 fixture.input（服务端 ...clone(fixture) 保留），
// 键集合稳定；未知键原样展示兜底，避免真实模式未来加字段时丢信息。
const inputLabels: Record<string, string> = {
  paymentSuccessRate: '支付成功率',
  p95Latency: 'P95 延迟',
  timeoutGrowth: '超时增长',
  observationWindow: '观测窗口',
  incident: '事故等级',
  service: '服务',
  window: '时间窗口',
  merchantTier: '商户等级',
  channel: '触达渠道',
  confirmedCause: '已确认根因',
  severity: '事故等级',
  impact: '影响金额',
  duration: '持续时长',
  recoveryProgress: '恢复进展',
  windows: '观测窗口',
  baseline: '对比基线',
  labelSource: '标注来源',
  promptVersion: 'Prompt 版本',
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(' / ');
  return String(value);
}

function inputRows(execution: StageExecution): { label: string; value: string }[] {
  return Object.entries(execution.input).map(([key, value]) => ({ label: inputLabels[key] ?? key, value: formatValue(value) }));
}

// 输出字段行：同时兼容 mock 与 llm 两种 output 形状（llm-schemas vs scenario fixture），缺字段跳过该行。
function outputRows(stage: IncidentStage, output: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const str = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
  const list = (value: unknown) =>
    Array.isArray(value) && value.length > 0 ? value.filter((item) => typeof item === 'string' && item !== '').join(' · ') : undefined;
  const push = (label: string, value: string | undefined) => {
    if (value !== undefined) rows.push({ label, value });
  };
  switch (stage) {
    case 'verify':
      push('故障判定', output.isIncident === true ? '真实故障' : output.isIncident === false ? '非真实故障' : undefined);
      push('影响范围', str(output.impactScope) ?? str(output.affectedScope));
      push('监控图表发现', list(output.visualFindings));
      break;
    case 'locate':
      push('Top-1 根因', str(output.topCause));
      push('候选根因', list(output.alternatives));
      push('证据引用', list(output.evidenceRefs));
      push('建议动作', str(output.recommendedAction) ?? list(output.recommendedActions));
      break;
    case 'contact':
      push('触达渠道', list(output.channels) ?? str(output.channel));
      break;
    case 'escalate':
      push('工单', str(output.ticketTitle) ?? str(output.ticketId));
      push('升级对象', list(output.teams));
      push('SLA', str(output.sla));
      push('升级原因', str(output.escalationReason));
      break;
    case 'recover':
      push('恢复判定', output.recovered === true ? '已稳定恢复' : output.recovered === false ? '未稳定' : undefined);
      push('稳定窗口', list(output.stableWindows));
      push('残余风险', str(output.residualRisk));
      push('观察建议', str(output.observationAdvice));
      break;
    case 'evaluate':
      push('评测样本', str(output.sampleId));
      push('数据集', str(output.dataset));
      push('最终根因', str(output.finalRootCause));
      push('人工修正', output.humanCorrected === true ? '是' : output.humanCorrected === false ? '否' : undefined);
      push('质量检查', list(output.qualityChecks));
      break;
  }
  return rows;
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// 把每个阶段的 output 折叠成「一句话结论」：让招聘方一眼抓住结果，细节在三区里展开。
function headlineFor(stage: IncidentStage, execution: StageExecution): string {
  const out = execution.output as Record<string, unknown>;
  switch (stage) {
    case 'verify': {
      const confirmed = out.isIncident === true;
      const severity = String(out.severity ?? '');
      return confirmed ? `真实 ${severity} 故障，置信度 ${execution.metrics.confidence}%` : '未识别为真实故障';
    }
    case 'locate':
      return typeof out.topCause === 'string' ? `Top-1 根因：${out.topCause}` : '根因待定';
    case 'contact':
      return '商户触达内容已生成';
    case 'escalate': {
      const teams = Array.isArray(out.teams) ? out.teams.join(' + ') : '';
      return teams ? `升级至 ${teams}` : '升级方案已生成';
    }
    case 'recover':
      return out.recovered === true ? '已稳定恢复，可以关闭事故' : '暂未稳定，继续观察';
    case 'evaluate':
      return '评测样本已沉淀';
  }
}

function KvRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="demo-kv-list">
      {rows.map((row) => (
        <div className="demo-kv" key={row.label}>
          <span>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}

export function StageWorkspace({
  run,
  stage,
  execution,
}: {
  run: IncidentRun;
  stage: IncidentStage;
  execution?: StageExecution;
}) {
  const [showJson, setShowJson] = useState(false);

  if (!execution) {
    const pendingHeadline: { lead: string; sub?: string } =
      stage === 'verify'
        ? { lead: '准备核验告警与监控截图', sub: '判断是否为真实故障并识别影响等级' }
        : { lead: `准备进入${stageNames[stage]}`, sub: '执行当前步骤前不会输出结论。' };
    return (
      <article className="demo-step-card">
        <div className="demo-step-meta">STEP {stageOrderIndex(stage)} · {stageNames[stage]}<h2 className="demo-step-result">{stageNames[stage]}结果</h2></div>
        <h3 className="demo-headline">{pendingHeadline.lead}</h3>
        {pendingHeadline.sub ? <p className="demo-why">{pendingHeadline.sub}</p> : null}
        <div className="demo-evidence"><span className="demo-evidence-label">商户</span><span className="demo-evidence-chip">{run.incident.merchant}</span><span className="demo-evidence-chip">{run.incident.impact}</span><span className="demo-evidence-chip">{run.incident.detectedAt}</span></div>
      </article>
    );
  }

  const out = execution.output as Record<string, unknown>;
  const lead = headlineFor(stage, execution);
  const inputs = inputRows(execution);
  const outputs = outputRows(stage, out);
  const toolEvents = execution.events.filter((event) => event.type !== 'stage_started');
  const tokens = execution.metrics.inputTokens + execution.metrics.outputTokens;
  const contactMessage = typeof out.message === 'string' ? out.message : null;
  const contactActions = Array.isArray(out.actionLink) ? (out.actionLink as string[]) : null;
  const designNotes = (
    [
      ['放行', execution.gate],
      ['指标', execution.successMetric],
      ['风险', execution.risk],
      ['降级', execution.fallback],
    ] as const
  ).filter(([, text]) => typeof text === 'string' && text.trim() !== '');

  return (
    <article className={`demo-step-card ${stage === 'contact' && run.status === 'awaiting_approval' ? 'is-pending-approval' : ''}`}>
      <div className="demo-step-meta">
        STEP {stageOrderIndex(stage)} · {stageNames[stage]}
        <h2 className="demo-step-result">{stageNames[stage]}结果</h2>
        <span className="demo-step-provider">
          {execution.provider === 'real_llm' ? (
            <>
              <span className="provider-badge real">REAL LLM</span>
              {execution.model ? <span className="demo-step-model">{execution.model}</span> : null}
              {execution.imageSource ? <span className="demo-step-image">图片来源：{execution.imageSource === 'uploaded' ? '上传图片' : '内置截图'}</span> : null}
            </>
          ) : null}
          <span className="demo-step-metrics">
            耗时 {formatDuration(execution.metrics.latencyMs)}
            {tokens > 0 ? ` · ${tokens.toLocaleString('zh-CN')} tok` : ''}
            {execution.metrics.costYuan > 0 ? ` · ¥${execution.metrics.costYuan.toFixed(2)}${execution.costEstimated ? '（估）' : ''}` : ''}
          </span>
        </span>
      </div>
      <h3 className="demo-headline">{lead}{execution.metrics.confidence !== undefined ? <span className="demo-confidence">置信度 {execution.metrics.confidence}%</span> : null}</h3>
      <p className="demo-why">{execution.goal}</p>

      <div className="demo-zone-grid">
        <section className="demo-zone" aria-label={`${stageNames[stage]}输入`}>
          <h4 className="demo-zone-title">输入 INPUT</h4>
          {inputs.length > 0 ? <KvRows rows={inputs} /> : <p className="demo-zone-empty">无显式输入</p>}
        </section>
        <section className="demo-zone" aria-label={`${stageNames[stage]}分析过程`}>
          <h4 className="demo-zone-title">分析过程 ANALYSIS</h4>
          <div className="demo-tool-list">
            {toolEvents.map((event) => (
              <div className="demo-tool-row" key={event.id} data-failed={event.type === 'tool_call_failed'}>
                <span className="demo-tool-dot" aria-hidden="true" />
                <div className="demo-tool-body">
                  <div className="demo-tool-head">
                    <b>{event.label}</b>
                    {event.durationMs !== undefined ? <span>{event.durationMs}ms</span> : null}
                  </div>
                  {typeof event.detail === 'string' && event.detail !== '' ? <p className="demo-tool-detail">{event.detail}</p> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="demo-factor-list">
            {execution.decisionFactors.map((factor, index) => (
              <div className="demo-factor" key={`${factor.label}-${index}`}>
                <span>{factor.label}</span>
                <b>{factor.value}</b>
                {typeof factor.evidence === 'string' && factor.evidence !== '' ? <code>{factor.evidence}</code> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="demo-zone demo-zone-output" aria-label={`${stageNames[stage]}输出`}>
        <h4 className="demo-zone-title">输出 OUTPUT</h4>
        {stage === 'contact' && contactMessage ? (
          <div className="demo-contact-preview">
            <strong className="demo-contact-subject">{typeof out.subject === 'string' ? out.subject : '触达预览'}</strong>
            <p className="demo-contact-message">{contactMessage}</p>
            {contactActions ? (
              <div className="demo-contact-actions">{contactActions.map((action, i) => <span key={i} className="demo-contact-action">· {action}</span>)}</div>
            ) : null}
          </div>
        ) : null}
        {outputs.length > 0 ? <KvRows rows={outputs} /> : null}
        {designNotes.length > 0 ? (
          <div className="demo-design-strip">
            {designNotes.map(([label, text]) => (
              <span key={label}>{label} · {text}</span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="demo-tools-inline">
        <button type="button" className="demo-tools-inline-toggle" aria-expanded={showJson} onClick={() => setShowJson((open) => !open)}>
          原始 JSON
        </button>
      </div>
      {showJson ? <pre className="demo-json">{JSON.stringify(execution.output, null, 2)}</pre> : null}
    </article>
  );
}

function stageOrderIndex(stage: IncidentStage): number {
  return ['verify', 'locate', 'contact', 'escalate', 'recover', 'evaluate'].indexOf(stage) + 1;
}
