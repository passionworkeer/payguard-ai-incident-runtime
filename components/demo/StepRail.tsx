import { stageOrder, type IncidentRun, type IncidentStage } from '../../lib/runtime/types';

const stageNames: Record<IncidentStage, string> = {
  verify: '智能核验',
  locate: '定位分析',
  contact: '商户触达',
  escalate: '故障升级',
  recover: '恢复判断',
  evaluate: '评测回流',
};

export { stageNames };

// 进度条上每段的状态：决定圆点配色 + 文案。空状态/审批/转人工 各自独立，便于一眼定位当前卡点。
type StepIndicatorState = 'pending' | 'current' | 'complete' | 'pending_approval' | 'needs_human';

function statusForStage(run: IncidentRun, stage: IncidentStage): StepIndicatorState {
  const executed = Boolean(run.executions[stage]);
  const completed = run.completedStages.includes(stage);
  if (run.status === 'awaiting_approval' && run.currentStage === stage) return 'pending_approval';
  if (run.status === 'needs_human' && run.currentStage === stage) return 'needs_human';
  if (completed) return 'complete';
  if (run.currentStage === stage && run.status === 'running') return 'current';
  if (executed) return 'complete';
  return 'pending';
}

export function StepProgress({
  run,
  selectedStage,
  onSelect,
}: {
  run: IncidentRun;
  selectedStage: IncidentStage;
  onSelect: (stage: IncidentStage) => void;
}) {
  return (
    <nav className="demo-progress" aria-label="处置进度">
      {stageOrder.map((stage, index) => {
        const state = statusForStage(run, stage);
        const executed = state !== 'pending';
        const isCurrent = selectedStage === stage;
        const labelClass = `demo-progress-step ${state !== 'pending' && isCurrent ? 'is-current' : ''} is-${state.replace('_', '-')}`;
        const dotSymbol = state === 'complete' ? '✓' : state === 'pending_approval' ? '!' : state === 'needs_human' ? '⏸' : String(index + 1);
        const statusText = state === 'complete' ? '已完成' : state === 'current' ? '当前步骤' : state === 'pending_approval' ? '待审批' : state === 'needs_human' ? '已转人工' : '待执行';
        return (
          <span key={stage} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              type="button"
              className={labelClass}
              disabled={!executed}
              onClick={() => onSelect(stage)}
              aria-label={`${stageNames[stage]}，${statusText}`}
              aria-pressed={isCurrent}
            >
              <span className="demo-progress-dot" aria-hidden="true">{dotSymbol}</span>
              <span>{stageNames[stage]}</span>
            </button>
            {index < stageOrder.length - 1 ? <span className="demo-progress-divider" aria-hidden="true">→</span> : null}
          </span>
        );
      })}
    </nav>
  );
}