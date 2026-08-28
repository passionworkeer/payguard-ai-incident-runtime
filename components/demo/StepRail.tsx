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

// 进度条上每段的状态：决定圆点配色 + 文案。空状态/审批/转人工/跳过 各自独立，便于一眼定位当前卡点。
type StepIndicatorState = 'pending' | 'current' | 'complete' | 'pending_approval' | 'needs_human' | 'skipped';

function statusForStage(run: IncidentRun, stage: IncidentStage): StepIndicatorState {
  // 跳过优先于其他状态：误报短路后中间 4 步虽然没执行也不应被错误归为「待执行」。
  if (run.skippedStages?.includes(stage)) return 'skipped';
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
        const executed = state === 'complete' || state === 'current' || state === 'pending_approval' || state === 'needs_human';
        const isCurrent = selectedStage === stage;
        const labelClass = `demo-progress-step ${state !== 'pending' && isCurrent ? 'is-current' : ''} is-${state.replace('_', '-')}`;
        // 状态字符全部用纯文本/ASCII：避免在演示截图、打印与 a11y 阅读器里出现方框字。
        const dotSymbol = state === 'complete' ? 'v' : state === 'pending_approval' ? '!' : state === 'needs_human' ? '||' : state === 'skipped' ? '-' : String(index + 1);
        const statusText = state === 'complete' ? '已完成' : state === 'current' ? '当前步骤' : state === 'pending_approval' ? '待审批' : state === 'needs_human' ? '已转人工' : state === 'skipped' ? '已跳过' : '待执行';
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