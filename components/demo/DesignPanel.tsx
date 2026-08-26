import type { StageExecution } from '../../lib/runtime/types';

export function DesignPanel({ execution }: { execution?: StageExecution }) {
  return (
    <aside className="design-panel">
      <div className="design-panel-heading">
        <span>PRODUCT LOGIC</span>
        <h2>这一步为什么这样设计</h2>
      </div>
      {execution ? (
        <dl className="design-notes">
          <div><dt>进入门槛</dt><dd>{execution.gate}</dd></div>
          <div><dt>成功指标</dt><dd>{execution.successMetric}</dd></div>
          <div><dt>核心风险</dt><dd>{execution.risk}</dd></div>
          <div><dt>降级策略</dt><dd>{execution.fallback}</dd></div>
        </dl>
      ) : (
        <p className="empty-copy">执行当前步骤后，这里会解释门槛、指标、风险与降级方案，方便逐步讲解产品判断。</p>
      )}
    </aside>
  );
}
