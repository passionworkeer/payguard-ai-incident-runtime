'use client';

import { useEffect, useState } from 'react';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import type { IncidentRun, IncidentRuntime, IncidentStage } from '../../lib/runtime/types';
import { DesignPanel } from './DesignPanel';
import { StageWorkspace } from './StageWorkspace';
import { StepRail } from './StepRail';
import { useIncidentDemo } from './useIncidentDemo';

const actionLabels: Record<IncidentStage, string> = {
  verify: '开始演示：执行智能核验',
  locate: '下一步：进入定位分析',
  contact: '下一步：生成商户触达方案',
  escalate: '下一步：执行故障升级',
  recover: '下一步：判断是否恢复',
  evaluate: '最后一步：回流评测样本',
};

export default function GuidedIncidentDemo({
  runtime,
  persist = true,
  onRunChange,
}: {
  runtime?: IncidentRuntime;
  persist?: boolean;
  onRunChange?: (run: IncidentRun) => void;
}) {
  const [ownedRuntime] = useState<IncidentRuntime>(() => runtime ?? new MockIncidentRuntime());
  const demo = useIncidentDemo(ownedRuntime, persist);
  const run = demo.run;

  useEffect(() => {
    if (run) onRunChange?.(run);
  }, [onRunChange, run]);

  if (!run) {
    return <div className="demo-loading" aria-live="polite">正在装载演示场景…</div>;
  }
  const execution = run.executions[demo.selectedStage];
  const awaitingApproval = run.status === 'awaiting_approval';
  const completed = run.status === 'completed';

  return (
    <div className="guided-demo" aria-busy={demo.busy}>
      <header className="incident-hero">
        <div className="incident-identity">
          <span className="severity-mark">{run.incident.severity}</span>
          <div><span>INCIDENT · {run.id.split('-').slice(0, 2).join('-')}</span><h1>{run.incident.title}</h1></div>
        </div>
        <dl className="incident-facts">
          <div><dt>商户</dt><dd>{run.incident.merchant}</dd></div>
          <div><dt>影响金额</dt><dd>{run.incident.impact}</dd></div>
          <div><dt>发现时间</dt><dd>{run.incident.detectedAt}</dd></div>
        </dl>
        <span className="synthetic-label">全量合成演示数据</span>
      </header>

      <div className="cumulative-trace" aria-label="累计运行指标">
        <span><b>{run.completedStages.length} / 6</b>步骤</span>
        <span><b>{demo.totals.latencyMs.toLocaleString()} ms</b>AI 总耗时</span>
        <span><b>{demo.totals.tokens.toLocaleString()}</b>Token</span>
        <span><b>¥{demo.totals.costYuan.toFixed(2)}</b>推理成本</span>
        <span><b>{demo.totals.toolCalls}</b>工具调用</span>
        <span><b>{demo.totals.evidence}</b>证据项</span>
      </div>

      <div className="guided-layout">
        <StepRail run={run} selectedStage={demo.selectedStage} onSelect={demo.selectHistory} />
        <StageWorkspace run={run} stage={demo.selectedStage} execution={execution} />
        <DesignPanel execution={execution} />
      </div>

      <footer className="demo-action-bar">
        <div>
          <span>{completed ? '演示完成' : awaitingApproval ? '人工审批点' : `待执行：${actionLabels[run.currentStage].replace(/^.*：/, '')}`}</span>
          <small>{demo.error ? `执行异常：${demo.error}` : '一次点击只推进一个业务步骤，历史结果不会被覆盖。'}</small>
        </div>
        <div className="demo-actions">
          <button type="button" className="secondary-button" onClick={demo.reset} disabled={demo.busy}>重置演示</button>
          {awaitingApproval ? (
            <>
              <button type="button" className="secondary-button danger-button" onClick={demo.reject} disabled={demo.busy}>转人工处理</button>
              <button type="button" className="demo-primary-action" onClick={demo.approve} disabled={demo.busy}>批准并发送</button>
            </>
          ) : completed ? (
            <span className="complete-chip">✓ 全链路处置完成</span>
          ) : (
            <button type="button" className="demo-primary-action" onClick={demo.execute} disabled={demo.busy}>
              {demo.busy ? 'AI 正在执行…' : actionLabels[run.currentStage]}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
