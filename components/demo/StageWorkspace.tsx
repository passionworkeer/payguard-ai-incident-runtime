'use client';

import { useState } from 'react';
import type { IncidentRun, IncidentStage, StageExecution } from '../../lib/runtime/types';
import { stageNames } from './StepRail';

function renderValue(value: unknown) {
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function DataGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="structured-grid">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{renderValue(value)}</dd>
        </div>
      ))}
    </dl>
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
  const [mode, setMode] = useState<'summary' | 'json'>('summary');
  const heading = execution ? `${stageNames[stage]}结果` : `${stageNames[stage]}准备`;

  return (
    <section className="stage-workspace" aria-live="polite">
      <header className="workspace-heading">
        <div>
          <span>STEP WORKSPACE · {stage.toUpperCase()}</span>
          <h2>{heading}</h2>
          <p>{execution?.goal ?? '点击主操作后，系统仅执行当前步骤，并保留完整可审计记录。'}</p>
        </div>
        {execution && <strong className="confidence-chip">置信度 {execution.metrics.confidence}%</strong>}
      </header>

      <section className="workspace-block">
        <div className="block-title"><span>01</span><h3>业务输入与证据</h3></div>
        {execution ? <DataGrid data={execution.input} /> : (
          <DataGrid data={{ 商户: run.incident.merchant, 告警: run.incident.title, 等级: run.incident.severity, 影响: run.incident.impact, 发现时间: run.incident.detectedAt }} />
        )}
      </section>

      <section className="workspace-block">
        <div className="block-title"><span>02</span><h3>Agent 工具轨迹</h3></div>
        {execution ? (
          <ol className="tool-timeline">
            {execution.events.filter((event) => event.type !== 'stage_started').map((event) => (
              <li key={event.id}>
                <span className="timeline-state">{event.type === 'approval_required' ? '!' : '✓'}</span>
                <div><strong>{event.label}</strong><p>{event.detail}</p></div>
                {event.durationMs !== undefined && <time>{event.durationMs} ms</time>}
              </li>
            ))}
          </ol>
        ) : <p className="empty-copy">尚未调用工具。执行后将逐项显示工具、耗时和返回摘要。</p>}
      </section>

      {execution && (
        <>
          <section className="workspace-block">
            <div className="block-title"><span>03</span><h3>可审计决策依据</h3></div>
            <div className="decision-factor-list">
              {execution.decisionFactors.map((factor) => (
                <article key={factor.label}>
                  <span>{factor.label}</span><strong>{factor.value}</strong><small>{factor.evidence}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="workspace-block output-block">
            <div className="block-title block-title-with-tabs">
              <div><span>04</span><h3>结构化输出</h3></div>
              <div className="output-tabs" role="group" aria-label="输出格式">
                <button type="button" className={mode === 'summary' ? 'active' : ''} onClick={() => setMode('summary')}>摘要</button>
                <button type="button" className={mode === 'json' ? 'active' : ''} onClick={() => setMode('json')}>JSON</button>
              </div>
            </div>
            {mode === 'summary' ? <DataGrid data={execution.output} /> : <pre>{JSON.stringify(execution.output, null, 2)}</pre>}
          </section>
        </>
      )}
    </section>
  );
}
