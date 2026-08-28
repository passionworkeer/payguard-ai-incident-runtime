'use client';

import { BarChart3, BellRing, BrainCircuit, ChevronRight, FlaskConical, LayoutDashboard, Menu, Network, PlayCircle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { aggregateClassification, aggregateRootCause, createEvaluationSample, type EvaluationSample } from '../lib/runtime/evaluation';
import { appendEvalSample, clearEvalSamples } from '../lib/runtime/eval-store';
import { LlmIncidentRuntime } from '../lib/runtime/llm-runtime';
import type { IncidentRun } from '../lib/runtime/types';
import { incidentSummaries } from '../lib/mock-data';
import { EvaluationView, FlowAnalyticsView } from './AnalyticsViews';
import GuidedIncidentDemo from './demo/GuidedIncidentDemo';
import IncidentsView from './IncidentsView';
import OverviewView from './OverviewView';

type ViewId = 'demo' | 'overview' | 'incidents' | 'flow' | 'evaluation';

const navItems = [
  { id: 'demo' as const, label: '处置演示', icon: PlayCircle },
  // 运营总览：北极星/一级/护栏三层指标 + MTTR 分解 + 原始告警流，定位全链路质量大盘。
  { id: 'overview' as const, label: '运营总览', icon: LayoutDashboard },
  { id: 'incidents' as const, label: '事故中心', icon: BellRing, count: incidentSummaries.length },
  { id: 'flow' as const, label: '流程分析', icon: Network },
  { id: 'evaluation' as const, label: 'AI 评测', icon: FlaskConical },
];

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('demo');
  // 本次会话实时评测样本：useEffect 读取 localStorage（不能用 useState initializer，
  // SSR hydration 不一致会导致服务端 / 客户端首屏 mismatch）。
  const [evalSamples, setEvalSamples] = useState<EvaluationSample[]>([]);
  const [runtimeMode, setRuntimeMode] = useState<'mock' | 'llm'>('mock');
  // 演示场景：事故中心「进入处置演示」按行跳转；切回 demo 视图时 GuidedIncidentDemo 用此初始值。
  const [demoScenario, setDemoScenario] = useState<string>('gateway-timeout');
  const [llmRuntime] = useState(() => new LlmIncidentRuntime());

  useEffect(() => {
    // 仅在浏览器侧读 localStorage；CSR 阶段执行一次即可。
    if (typeof window === 'undefined') return;
    try {
      // 动态导入避免 SSR 时加载 fs/localStorage（虽然这里不会发生，但仍是好习惯）。
      void import('../lib/runtime/eval-store').then(({ loadEvalSamples }) => {
        setEvalSamples(loadEvalSamples(window.localStorage));
      });
    } catch {
      setEvalSamples([]);
    }
  }, []);

  const handleRunChange = useCallback((run: IncidentRun) => {
    setRuntimeMode(run.mode);
    // 全链路刚跑完 → 用本次 Run 生成的样本；其余状态保留上一个样本，避免重置/继续操作把已展示的样本突然清空。
    if (run.status === 'completed') {
      try {
        const sample = createEvaluationSample(run);
        setEvaluationSample(sample);
        if (typeof window !== 'undefined') {
          // append 走 storage，再以 storage 为准同步到 state（处理 FIFO 截断 + 去重）。
          const next = appendEvalSample(window.localStorage, sample);
          setEvalSamples(next);
        }
      } catch {
        // 样本生成失败（极少见，比如 evaluate 缺失字段）→ 不阻塞 UI。
      }
    } else if (run.status === 'idle' && run.completedStages.length === 0) {
      setEvaluationSample(null);
    }
  }, []);

  // 实时聚合指标：评测页 EvaluationView 拿到 samples 后再算；这里只负责存储。
  const setEvaluationSample = useCallback((sample: EvaluationSample | null) => {
    if (!sample) return;
    setEvalSamples((current) => {
      const withoutDup = current.filter((item) => item.runId !== sample.runId);
      return [...withoutDup, sample];
    });
  }, []);

  const handleClearSamples = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearEvalSamples(window.localStorage);
    setEvalSamples([]);
  }, []);

  const liveMetrics = (() => {
    const classification = aggregateClassification(evalSamples);
    const rootCause = aggregateRootCause(evalSamples);
    return { classification, rootCause };
  })();

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div><strong>PayGuard</strong><span>Merchant Reliability</span></div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={18} /></button>
        </div>

        <div className="environment-pill"><span className="live-dot" />示例数据环境</div>
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
          <div className="model-card-head"><span><BrainCircuit size={15} /> 当前编排</span><span className={`status-dot ${runtimeMode === 'llm' ? 'warning' : 'success'}`} /></div>
          <strong>Evidence Agent</strong>
          <p>RAG · Tool Calling · 人工审批</p>
          <div className="model-meta"><span>运行模式</span><b>{runtimeMode === 'llm' ? '真实模型' : '示例数据'}</b></div>
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
          <div className={runtimeMode === 'llm' ? 'runtime-mode runtime-mode-real' : 'runtime-mode'}><span className="live-dot" /><div><strong>{runtimeMode === 'llm' ? '真实模型调用' : '示例数据演示'}</strong><small>{runtimeMode === 'llm' ? '真实模型执行' : '本地确定性执行'}</small></div></div>
        </header>

        <div className={`content-wrap ${activeView === 'demo' ? 'demo-content-wrap' : ''}`}>
          {/* 处置演示保持挂载、仅按标签页隐藏：切换标签不再丢失 Mock/真实 LLM 的演示进度。 */}
          <div className={activeView === 'demo' ? '' : 'is-hidden'} hidden={activeView !== 'demo'}>
            <GuidedIncidentDemo llmRuntime={llmRuntime} onRunChange={handleRunChange} initialScenarioId={demoScenario} key={demoScenario} />
          </div>
          {activeView === 'incidents' ? (
            <IncidentsView onStartDemo={(scenarioId) => { setDemoScenario(scenarioId); setActiveView('demo'); }} />
          ) : activeView === 'overview' ? (
            <OverviewView />
          ) : activeView === 'flow' ? (
            <FlowAnalyticsView />
          ) : activeView === 'evaluation' ? (
            <EvaluationView samples={evalSamples} liveMetrics={liveMetrics} onClear={handleClearSamples} />
          ) : null}
        </div>
      </section>
    </main>
  );
}
