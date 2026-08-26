import { stageOrder, type IncidentRun, type IncidentStage } from '../../lib/runtime/types';

const stageNames: Record<IncidentStage, string> = {
  verify: '智能核验',
  locate: '定位分析',
  contact: '商户触达',
  escalate: '故障升级',
  recover: '恢复判断',
  evaluate: '评测回流',
};

export function StepRail({
  run,
  selectedStage,
  onSelect,
}: {
  run: IncidentRun;
  selectedStage: IncidentStage;
  onSelect: (stage: IncidentStage) => void;
}) {
  return (
    <nav className="demo-step-rail" aria-label="处置流程">
      <div className="step-rail-heading">
        <span>END-TO-END RUN</span>
        <strong>{run.completedStages.length} / 6 步已执行</strong>
      </div>
      <ol>
        {stageOrder.map((stage, index) => {
          const completed = run.completedStages.includes(stage);
          const executed = Boolean(run.executions[stage]);
          const approval = stage === 'contact' && run.status === 'awaiting_approval';
          const human = stage === 'contact' && run.status === 'needs_human';
          const current = run.currentStage === stage && !approval && !human;
          const status = approval ? '待审批' : human ? '已转人工' : completed ? '已完成' : current ? '当前步骤' : '待执行';
          const selectable = executed;
          return (
            <li key={stage} className={`${selectedStage === stage ? 'is-selected' : ''} ${completed ? 'is-complete' : ''}`}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => onSelect(stage)}
                aria-label={`${stageNames[stage]}，${status}`}
              >
                <span className="step-index">{completed ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <span className="step-copy">
                  <strong>{stageNames[stage]}</strong>
                  <small>{status}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { stageNames };
