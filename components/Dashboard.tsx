'use client';

import { BellRing, BrainCircuit, ChevronRight, FlaskConical, Menu, Network, PlayCircle, Sparkles, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { createEvaluationSample, type EvaluationSample } from '../lib/runtime/evaluation';
import { LlmIncidentRuntime } from '../lib/runtime/llm-runtime';
import type { IncidentRun } from '../lib/runtime/types';
import { EvaluationView, FlowAnalyticsView } from './AnalyticsViews';
import GuidedIncidentDemo from './demo/GuidedIncidentDemo';
import IncidentsView from './IncidentsView';

type ViewId = 'demo' | 'incidents' | 'flow' | 'evaluation';

const navItems = [
  { id: 'demo' as const, label: '处置演示', icon: PlayCircle },
  { id: 'incidents' as const, label: '事故中心', icon: BellRing, count: 7 },
  { id: 'flow' as const, label: '流程分析', icon: Network },
  { id: 'evaluation' as const, label: 'AI 评测', icon: FlaskConical },
];

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('demo');
  const [evaluationSample, setEvaluationSample] = useState<EvaluationSample | null>(null);
  const [llmRuntime] = useState(() => new LlmIncidentRuntime());

  const handleRunChange = useCallback((run: IncidentRun) => {
    if (run.status === 'completed') setEvaluationSample(createEvaluationSample(run));
  }, []);

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div><strong>PayGuard</strong><span>Merchant Reliability</span></div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={18} /></button>
        </div>

        <div className="environment-pill"><span className="live-dot" />Mock 可运行环境</div>
        <nav aria-label="主导航">
          <span className="nav-heading">AI 保障工作台</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setActiveView(item.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.count ? <small>{item.count}</small> : null}
              </button>
            );
          })}
        </nav>

        <div className="model-card">
          <div className="model-card-head"><span><BrainCircuit size={15} /> 当前编排</span><span className="status-dot success" /></div>
          <strong>Evidence Agent</strong>
          <p>RAG · Tool Calling · 人工审批</p>
          <div className="model-meta"><span>运行模式</span><b>DETERMINISTIC</b></div>
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航遮罩" /> : null}

      <section className="workspace">
        <header className="topbar">
          <div className="title-group">
            <button className="icon-button menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu size={19} /></button>
            <div>
              <div className="eyebrow"><span>支付宝事业群</span><ChevronRight size={13} /><span>商户保障</span></div>
              <h1>商户故障 AI 处置台</h1>
            </div>
          </div>
          <div className="runtime-mode"><span className="live-dot" /><div><strong>MOCK RUNTIME</strong><small>本地确定性执行</small></div></div>
        </header>

        <div className={`content-wrap ${activeView === 'demo' ? 'demo-content-wrap' : ''}`}>
          {activeView === 'demo' ? (
            <GuidedIncidentDemo llmRuntime={llmRuntime} onRunChange={handleRunChange} />
          ) : activeView === 'incidents' ? (
            <IncidentsView onStartDemo={() => setActiveView('demo')} />
          ) : activeView === 'flow' ? (
            <FlowAnalyticsView />
          ) : (
            <EvaluationView sample={evaluationSample} />
          )}
        </div>
      </section>
    </main>
  );
}
