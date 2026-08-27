'use client';

import { Fragment, useState, type ReactElement } from 'react';
import type { IncidentRun, IncidentStage, StageExecution } from '../../lib/runtime/types';
import { stageNames } from './StepRail';

type DetailSection = 'tools' | 'json';

function evidenceLine(execution: StageExecution): { label: string; value: string }[] {
  return execution.decisionFactors.map((factor) => ({ label: factor.label, value: factor.value }));
}

// 把每个阶段的 output 折叠成「一句话结论」：让招聘方一眼抓住结果，证据 / 工具 / JSON 收进折叠区。
function headlineFor(stage: IncidentStage, execution: StageExecution): { lead: string; sub?: string } {
  const out = execution.output as Record<string, unknown>;
  switch (stage) {
    case 'verify': {
      const confirmed = out.isIncident === true;
      const severity = String(out.severity ?? '');
      return {
        lead: confirmed ? `真实 ${severity} 故障，置信度 ${execution.metrics.confidence}%` : '未识别为真实故障',
        sub: typeof out.affectedScope === 'string' ? out.affectedScope : undefined,
      };
    }
    case 'locate':
      return { lead: typeof out.topCause === 'string' ? `Top-1 根因：${out.topCause}` : '根因待定', sub: typeof out.recommendedAction === 'string' ? out.recommendedAction : undefined };
    case 'contact':
      return { lead: '商户触达内容已生成', sub: typeof out.subject === 'string' ? out.subject : undefined };
    case 'escalate': {
      const teams = Array.isArray(out.teams) ? out.teams.join(' + ') : '';
      return { lead: teams ? `升级至 ${teams}` : '升级方案已生成', sub: typeof out.sla === 'string' ? `SLA ${out.sla}` : undefined };
    }
    case 'recover': {
      const recovered = out.recovered === true;
      return { lead: recovered ? '已稳定恢复，可以关闭事故' : '暂未稳定，继续观察', sub: typeof out.observationAdvice === 'string' ? out.observationAdvice : undefined };
    }
    case 'evaluate':
      return { lead: '评测样本已沉淀', sub: typeof out.sampleId === 'string' ? `样本 ${out.sampleId}` : undefined };
  }
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
  const [openSection, setOpenSection] = useState<DetailSection | null>(null);

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

  const { lead, sub } = headlineFor(stage, execution);
  const chips = evidenceLine(execution);
  const contactMessage = typeof (execution.output as Record<string, unknown>).message === 'string' ? String((execution.output as Record<string, unknown>).message) : null;
  const contactActions = Array.isArray((execution.output as Record<string, unknown>).actionLink) ? (execution.output as Record<string, unknown>).actionLink as string[] : null;
  const toolEvents = execution.events.filter((event) => event.type !== 'stage_started');
  const showJson = openSection === 'json';
  const showTools = openSection === 'tools';

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
        </span>
      </div>
      <h3 className="demo-headline">{lead}{execution.metrics.confidence !== undefined ? <span className="demo-confidence">置信度 {execution.metrics.confidence}%</span> : null}</h3>
      <p className="demo-why">{execution.goal}</p>
      {sub ? <p className="demo-step-sub">{sub}</p> : null}

      {chips.length > 0 ? (
        <div className="demo-evidence">
          <span className="demo-evidence-label">证据</span>
          {chips.map((chip, i) => (
            <span key={i} className="demo-evidence-chip"><span>{chip.label}</span><b>{chip.value}</b></span>
          ))}
        </div>
      ) : null}

      {stage === 'contact' && contactMessage ? (
        <div className="demo-contact-preview">
          <strong className="demo-contact-subject">{typeof (execution.output as Record<string, unknown>).subject === 'string' ? String((execution.output as Record<string, unknown>).subject) : '触达预览'}</strong>
          <p className="demo-contact-message">{contactMessage}</p>
          {contactActions ? (
            <div className="demo-contact-actions">{contactActions.map((action, i) => <span key={i} className="demo-contact-action">· {action}</span>)}</div>
          ) : null}
        </div>
      ) : null}

      <div className="demo-tools-inline">
        <button type="button" className="demo-tools-inline-toggle" aria-expanded={showTools} onClick={() => setOpenSection(showTools ? null : 'tools')}>
          工具轨迹（{toolEvents.length}）
        </button>
        {showTools ? (
          <span className="demo-tools-inline-stream">
            {toolEvents.reduce<ReactElement[]>((acc, event, i) => acc.concat(
              i === 0
                ? [<span key={event.id}><b>{event.label}</b>{event.durationMs !== undefined ? `${event.durationMs}ms` : ''}</span>]
                : [<Fragment key={`sep-${event.id}`}> · </Fragment>, <span key={event.id}><b>{event.label}</b>{event.durationMs !== undefined ? `${event.durationMs}ms` : ''}</span>],
            ), [])}
          </span>
        ) : null}
        <button type="button" className="demo-tools-inline-toggle" aria-expanded={showJson} onClick={() => setOpenSection(showJson ? null : 'json')}>
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