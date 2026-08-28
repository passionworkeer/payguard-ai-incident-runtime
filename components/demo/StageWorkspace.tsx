'use client';

import { useState } from 'react';
import { stageOrder, type IncidentRun, type IncidentStage, type StageExecution, type ToolCall } from '../../lib/runtime/types';
import { stageNames } from './StepRail';

// ToolCategory → 左侧 SVG 图标组件（运行时已确认 lucide 输出 SVG，与设计系统规则一致）。
import { Activity, AlertTriangle, BellRing, BookOpen, Calendar, Calculator, CheckCircle2, ClipboardList, FileText, FlaskConical, GitBranch, Inbox, MessageSquare, Phone, Plug, ShieldAlert, Store } from 'lucide-react';

const iconByCategory: Record<ToolCall['category'], typeof Activity> = {
  metrics: Activity,
  alert: BellRing,
  log: FileText,
  change: GitBranch,
  case: BookOpen,
  cert: ShieldAlert,
  channel: Plug,
  error: AlertTriangle,
  calendar: Calendar,
  merchant: Store,
  message: MessageSquare,
  policy: ClipboardList,
  oncall: Phone,
  ticket: Inbox,
  eval: FlaskConical,
  metric: Calculator,
};

// Tool 输入键 → 中文标签：保持密集单行规则。
const inputLabels: Record<string, string> = {
  incidentId: '事故 ID',
  window: '时间窗口',
  granularity: '粒度',
  metrics: '指标集合',
  services: '服务集合',
  errorCode: '错误码',
  keyword: '关键词',
  topK: '召回数量',
  query: '查询语句',
  merchantId: '商户 ID',
  fields: '画像字段',
  severity: '等级',
  impact: '影响',
  merchantTier: '商户等级',
  channel: '触达渠道',
  confirmedCause: '已确认根因',
  techLevel: '技术等级',
  causeOwner: '根因归属',
  metricStatus: '指标状态',
  duration: '持续时长',
  recoveryProgress: '恢复进展',
  windows: '观测窗口',
  baseline: '对比基线',
  channelStatus: '渠道方通报',
  merchantAction: '商户动作',
  labelSource: '标注来源',
  promptVersion: 'Prompt 版本',
  sampleType: '样本类型',
  recoveryAttempts: '恢复尝试次数',
  attemptNote: '本轮备注',
  facts: '已确认事实',
  tone: '语气',
  channel_target: '触达渠道',
  audience: '读者',
  teams: '升级对象',
  title: '工单标题',
  runId: 'Run ID',
  tags: '样本标签',
  period: '周期',
  fingerprint: '证书指纹',
  channel_target_split: '渠道拆分',
  splitKey: '拆分维度',
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' || typeof item === 'number') ? String(item) : JSON.stringify(item)).join(' / ');
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return '—';
  return String(value);
}

// 数字专用：mock fixture 中 stableWindows 是 number。
function formatStableWindows(value: unknown): string {
  if (typeof value === 'number') return `${value} 个`;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(' / ');
  return String(value);
}

// 输出字段行：同时兼容 mock 与 llm 两种 output 形状。
function outputRows(stage: IncidentStage, output: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const str = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
  const list = (value: unknown) =>
    Array.isArray(value) && value.length > 0 ? value.filter((item) => (typeof item === 'string' || typeof item === 'number') && String(item) !== '').map(String).join(' · ') : undefined;
  const push = (label: string, value: string | undefined) => {
    if (value !== undefined) rows.push({ label, value });
  };
  switch (stage) {
    case 'verify':
      push('故障判定', output.isIncident === true ? '真实故障' : output.isIncident === false ? '非真实故障' : undefined);
      push('误报原因', str(output.falseAlarmReason));
      push('影响范围', str(output.impactScope) ?? str(output.affectedScope));
      push('信号摘要', str(output.signalSummary));
      push('证据引用', list(output.evidenceHighlights));
      break;
    case 'locate':
      push('Top-1 根因', str(output.topCause));
      push('候选根因', list(output.alternatives));
      push('根因归属', str(output.causeOwner) === 'merchant' ? '商户侧' : str(output.causeOwner) === 'channel' ? '渠道侧' : str(output.causeOwner) === 'platform' ? '平台侧' : str(output.causeOwner));
      push('证据引用', list(output.evidenceRefs));
      push('建议动作', str(output.recommendedAction) ?? list(output.recommendedActions));
      break;
    case 'contact':
      push('触达渠道', list(output.channels) ?? str(output.channel));
      push('沟通语气', str(output.tone) === 'reassurance' ? '安抚型' : str(output.tone) === 'guidance' ? '指导型' : str(output.tone) === 'incident_brief' ? '事故简报' : str(output.tone) === 'informational' ? '信息提示' : str(output.tone));
      push('商户行动', str(output.actionLinkLabel) ?? str(output.actionLink));
      break;
    case 'escalate':
      push('工单', str(output.ticketTitle) ?? str(output.ticketId));
      push('升级对象', list(output.teams));
      push('升级级别', str(output.escalationLevel));
      push('SLA', str(output.sla));
      push('升级原因', str(output.escalationReason));
      break;
    case 'recover':
      push('恢复判定', output.recovered === true ? '已稳定恢复' : output.recovered === false ? '未稳定' : undefined);
      push('稳定窗口', formatStableWindows(output.stableWindows));
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

function headlineFor(stage: IncidentStage, execution: StageExecution): string {
  const out = execution.output as Record<string, unknown>;
  switch (stage) {
    case 'verify': {
      const confirmed = out.isIncident === true;
      const severity = String(out.severity ?? '');
      return confirmed ? `真实 ${severity} 故障` : '未识别为真实故障';
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

// 工具调用卡片：单条 ToolCall 的结构化渲染。input/output 默认可折叠；flagged 时整卡换边色 + 状态徽标。
function ToolCard({ tool }: { tool: ToolCall }) {
  const Icon = iconByCategory[tool.category];
  const flagClass = tool.flagged ? 'is-flagged' : 'is-normal';
  const statusClass = `is-${tool.status}`;
  const [open, setOpen] = useState(false);
  const inputRows = Object.entries(tool.input).map(([key, value]) => ({ label: inputLabels[key] ?? key, value: formatValue(value) }));
  const outputRowsList = Object.entries(tool.output).map(([key, value]) => ({ label: key, value: formatValue(value) }));
  return (
    <article className={`demo-tool-card ${flagClass} ${statusClass}`}>
      <header className="demo-tool-card-head">
        <span className="demo-tool-card-icon" aria-hidden="true"><Icon size={14} /></span>
        <div className="demo-tool-card-meta">
          <strong>{tool.displayName}</strong>
          <code>{tool.name}</code>
        </div>
        <span className={`demo-tool-card-flag tone-${tool.flagged ? 'danger' : 'info'}`}>
          {tool.flagged ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {tool.flagged ? '已 flag' : '未 flag'}
        </span>
        <span className="demo-tool-card-latency">{formatDuration(tool.latencyMs)}</span>
        <button type="button" className="demo-tool-card-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : '展开'}
        </button>
      </header>
      {tool.flagReason ? <p className={`demo-tool-card-reason ${flagClass}`}>{tool.flagReason}</p> : null}
      {open ? (
        <div className="demo-tool-card-body">
          <section>
            <h5>输入 input</h5>
            {inputRows.length > 0 ? <KvRows rows={inputRows} /> : <p className="demo-zone-empty">无参数</p>}
          </section>
          <section>
            <h5>输出 output</h5>
            {outputRowsList.length > 0 ? <KvRows rows={outputRowsList} /> : <p className="demo-zone-empty">无返回</p>}
          </section>
          {tool.chartHint === 'metric_trend' && Array.isArray(tool.output.successRate) ? <MetricTrendPreview series={tool.output.successRate as Array<{ t: string; v: number }>} /> : null}
          {tool.chartHint === 'channel_breakdown' && tool.output.byChannel ? <ChannelBreakdownPreview data={tool.output.byChannel as Record<string, { successRate: number }>} /> : null}
          {tool.chartHint === 'log_excerpt' && Array.isArray(tool.output.sample) ? <LogExcerptPreview lines={tool.output.sample as string[]} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function MetricTrendPreview({ series }: { series: Array<{ t: string; v: number }> }) {
  if (series.length === 0) return null;
  const min = Math.min(...series.map((p) => p.v));
  const max = Math.max(...series.map((p) => p.v));
  return (
    <div className="demo-tool-mini-chart" aria-label="指标趋势缩略图">
      {series.map((point, index) => {
        const ratio = max === min ? 0.5 : (point.v - min) / (max - min);
        return <span key={`${point.t}-${index}`} className="demo-tool-mini-bar" style={{ height: `${Math.max(8, ratio * 56)}px` }} title={`${point.t} ${point.v}`} />;
      })}
    </div>
  );
}

function ChannelBreakdownPreview({ data }: { data: Record<string, { successRate: number }> }) {
  const entries = Object.entries(data);
  return (
    <div className="demo-tool-mini-chart demo-tool-mini-bars">
      {entries.map(([name, info]) => (
        <span key={name} className="demo-tool-mini-row">
          <b>{name}</b>
          <span className="demo-tool-mini-track"><span style={{ width: `${info.successRate * 100}%` }} /></span>
          <em>{(info.successRate * 100).toFixed(1)}%</em>
        </span>
      ))}
    </div>
  );
}

function LogExcerptPreview({ lines }: { lines: string[] }) {
  return (
    <pre className="demo-tool-mini-log">{
      lines.slice(0, 4).map((line) => <span key={line}>{line}{'\n'}</span>)
    }</pre>
  );
}

// 商户证书场景 contact 的 guidanceSteps 渲染为有序步骤。
function renderGuidanceSteps(out: Record<string, unknown>): string[] | null {
  const steps = out.guidanceSteps;
  if (!Array.isArray(steps)) return null;
  const valid = steps.filter((step) => typeof step === 'string' && step.trim() !== '');
  return valid.length > 0 ? valid : null;
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
        ? { lead: '准备调用 4 个内部接口工具', sub: 'Metrics / Alerts / Logs / Change Records 共同核验异常' }
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
  const outputs = outputRows(stage, out);
  const tokens = execution.metrics.inputTokens + execution.metrics.outputTokens;
  const contactMessage = typeof out.message === 'string' ? out.message : null;
  const guidanceSteps = renderGuidanceSteps(out);
  const designNotes = (
    [
      ['放行', execution.gate],
      ['指标', execution.successMetric],
      ['风险', execution.risk],
      ['降级', execution.fallback],
    ] as const
  ).filter(([, text]) => typeof text === 'string' && text.trim() !== '');

  const flaggedCount = execution.tools.filter((tool) => tool.flagged).length;
  const toolTotal = execution.tools.length;
  const signalSummary = `${flaggedCount}/${toolTotal} 工具异常`;

  return (
    <article className={`demo-step-card ${stage === 'contact' && run.status === 'awaiting_approval' ? 'is-pending-approval' : ''}`}>
      <div className="demo-step-meta">
        STEP {stageOrderIndex(stage)} · {stageNames[stage]}
        <h2 className="demo-step-result">{stageNames[stage]}结果</h2>
        <span className="demo-step-provider">
          {execution.provider === 'mock' ? <span className="provider-badge mock">MOCK</span> : null}
          {execution.provider === 'real_llm' ? (
            <>
              <span className="provider-badge real">REAL LLM</span>
              {execution.model ? <span className="demo-step-model">{execution.model}</span> : null}
            </>
          ) : null}
          <span className="demo-step-metrics">
            耗时 {formatDuration(execution.metrics.latencyMs)}
            {tokens > 0 ? ` · ${tokens.toLocaleString('zh-CN')} tok` : ''}
            {execution.metrics.costYuan > 0 ? ` · ¥${execution.metrics.costYuan.toFixed(2)}${execution.costEstimated ? '（估）' : ''}` : ''}
          </span>
        </span>
      </div>
      <h3 className="demo-headline">
        {lead}
        {execution.metrics.confidence !== undefined ? <span className="demo-confidence">置信度 {execution.metrics.confidence}%</span> : null}
      </h3>
      <p className="demo-why">{execution.goal}</p>

      {stage === 'recover' && typeof out.attemptNote === 'string' && out.attemptNote.trim() !== '' ? (
        <p className="demo-why demo-why-rebound">{out.attemptNote}</p>
      ) : null}

      <div className="demo-zone-grid">
        <section className="demo-zone demo-zone-context" aria-label={`${stageNames[stage]}上下文`}>
          <h4 className="demo-zone-title">上下文 CONTEXT</h4>
          {Object.keys(execution.context).length > 0 ? (
            <KvRows rows={Object.entries(execution.context).map(([k, v]) => ({ label: inputLabels[k] ?? k, value: formatValue(v) }))} />
          ) : <p className="demo-zone-empty">无显式上下文</p>}
          <p className="demo-tool-signal">多源信号聚合：<b>{signalSummary}</b></p>
        </section>
        <section className="demo-zone demo-zone-tools" aria-label={`${stageNames[stage]}工具调用`}>
          <h4 className="demo-zone-title">工具调用 TOOLS</h4>
          <div className="demo-tool-card-list">
            {execution.tools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
          </div>
          <h4 className="demo-zone-title">判断因子 DECISION FACTORS</h4>
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
            {guidanceSteps ? (
              <ol className="demo-contact-steps">
                {guidanceSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : null}
            {typeof out.actionLinkLabel === 'string' ? <p className="demo-contact-action">· {out.actionLinkLabel}</p> : null}
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
      {showJson ? <pre className="demo-json">{JSON.stringify({ context: execution.context, tools: execution.tools, output: execution.output }, null, 2)}</pre> : null}
    </article>
  );
}

function stageOrderIndex(stage: IncidentStage): number {
  return stageOrder.indexOf(stage) + 1;
}