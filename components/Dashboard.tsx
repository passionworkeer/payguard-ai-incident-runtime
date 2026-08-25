'use client';

import {
  Activity,
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  DatabaseZap,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Network,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Wrench,
  X,
} from 'lucide-react';
import { useMemo, useReducer, useState } from 'react';
import { incidentSummaries, kpiMetrics, stageMetrics, volumeSeries } from '../lib/mock-data';
import { createSimulationState, simulationReducer } from '../lib/simulation';
import type { Tone } from '../lib/types';
import { EvaluationView, FlowAnalyticsView } from './AnalyticsViews';
import IncidentDrawer from './IncidentDrawer';
import IncidentsView from './IncidentsView';

type ViewId = 'overview' | 'flow' | 'evaluation' | 'incidents';

const navItems = [
  { id: 'overview' as const, label: '运营总览', icon: LayoutDashboard },
  { id: 'flow' as const, label: '流程分析', icon: Network },
  { id: 'evaluation' as const, label: 'AI 评测', icon: FlaskConical },
  { id: 'incidents' as const, label: '事故中心', icon: BellRing, count: 7 },
];

const secondaryNav = [
  { label: '数据集', icon: DatabaseZap },
  { label: 'Prompt 版本', icon: Command },
  { label: '系统设置', icon: Settings },
];

const stageIcons = {
  verify: ShieldCheck,
  locate: BrainCircuit,
  contact: MessageSquareText,
  escalate: Target,
  recover: TimerReset,
};

const severityTone = { P0: 'danger', P1: 'warning', P2: 'info' } as const;

function SparkBars({ values, tone }: { values: number[]; tone: Tone }) {
  const max = Math.max(...values);
  return (
    <div className={`spark-bars spark-${tone}`} aria-hidden="true">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{ height: `${(value / max) * 100}%` }} />
      ))}
    </div>
  );
}

function MetricIcon({ id }: { id: string }) {
  const icons = {
    active: BellRing,
    automation: Bot,
    recall: ShieldCheck,
    mttr: AlarmClock,
    ctr: MessageSquareText,
    cost: CircleDollarSign,
  };
  const Icon = icons[id as keyof typeof icons] ?? Activity;
  return <Icon size={17} strokeWidth={1.8} />;
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [overviewDrawerOpen, setOverviewDrawerOpen] = useState(false);
  const [simulation, dispatch] = useReducer(
    simulationReducer,
    undefined,
    createSimulationState,
  );

  const currentStage = useMemo(
    () => stageMetrics.find((stage) => stage.key === simulation.activeStage),
    [simulation.activeStage],
  );

  const startOrAdvance = () => {
    if (simulation.mode === 'idle' || simulation.mode === 'completed') {
      dispatch({ type: 'START' });
      return;
    }
    dispatch({ type: 'ADVANCE' });
  };

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div>
            <strong>PayGuard</strong>
            <span>Merchant Reliability</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="关闭导航">
            <X size={18} />
          </button>
        </div>

        <div className="environment-pill"><span className="live-dot" />生产仿真环境</div>

        <nav aria-label="主导航">
          <span className="nav-heading">工作台</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
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
          <span className="nav-heading nav-heading-spaced">管理</span>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="nav-item" type="button">
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="model-card">
          <div className="model-card-head">
            <span><BrainCircuit size={15} /> 当前策略</span>
            <span className="status-dot success" />
          </div>
          <strong>Evidence Agent</strong>
          <p>Qwen3-235B · Prompt v3.4</p>
          <div className="model-meta"><span>Grounding</span><b>96.8%</b></div>
        </div>

        <div className="sidebar-footer">
          <div className="avatar">王</div>
          <div><strong>王健俊</strong><span>AI Solution Engineer</span></div>
          <ChevronRight size={16} />
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="关闭导航遮罩" /> : null}

      <section className="workspace">
        <header className="topbar">
          <div className="title-group">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu size={19} /></button>
            <div>
              <div className="eyebrow"><span>支付宝事业群</span><ChevronRight size={13} /><span>商户保障</span></div>
              <h1>商户故障 AI 处置台</h1>
            </div>
            <span className="demo-badge">演示数据</span>
          </div>
          <div className="topbar-actions">
            <label className="search-field">
              <Search size={16} />
              <input aria-label="搜索事故或商户" placeholder="搜索事故 / 商户" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="filter-button" type="button"><Clock3 size={15} />近 24 小时<ChevronRight size={14} /></button>
            <button className="icon-button" type="button" aria-label="刷新数据"><RefreshCw size={17} /></button>
            <button className="primary-button" type="button" onClick={startOrAdvance}>
              {simulation.mode === 'running' ? <Play size={16} /> : <Sparkles size={16} />}
              {simulation.mode === 'idle' || simulation.mode === 'completed' ? '注入模拟故障' : '推进处置阶段'}
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {activeView === 'overview' ? (
          <>
          <section className="status-strip" aria-label="系统状态">
            <div><span className="pulse-ring"><span /></span><strong>系统运行稳定</strong><em>99.99% 可用性</em></div>
            <div className="status-strip-meta">
              <span>最后更新 14:32:08</span>
              <span>今日处理 <strong>2,194</strong> 起</span>
              <span>节省人工 <strong>326h</strong></span>
            </div>
          </section>

          <section className="kpi-grid" aria-label="核心指标">
            {kpiMetrics.map((metric) => {
              const downIsGood = metric.id === 'mttr' || metric.id === 'cost' || metric.id === 'active';
              const isDown = metric.delta.startsWith('-');
              const DeltaIcon = isDown ? ArrowDownRight : ArrowUpRight;
              const deltaGood = isDown ? downIsGood : !downIsGood;
              return (
                <article className={`metric-card tone-${metric.tone}`} key={metric.id}>
                  <div className="metric-card-head">
                    <span className="metric-icon"><MetricIcon id={metric.id} /></span>
                    <span className={`metric-delta ${deltaGood ? 'good' : 'caution'}`}><DeltaIcon size={13} />{metric.delta}</span>
                  </div>
                  <div className="metric-label">{metric.label}</div>
                  <div className="metric-row"><strong>{metric.value}</strong><SparkBars values={metric.trend} tone={metric.tone} /></div>
                  <span className="metric-helper">{metric.deltaLabel}</span>
                </article>
              );
            })}
          </section>

          <section className="primary-grid">
            <article className="panel workflow-panel">
              <div className="panel-header">
                <div><span className="section-kicker">LIVE ORCHESTRATION</span><h2>全链路智能处置</h2></div>
                <div className="panel-header-actions">
                  <span className="live-label"><span className="live-dot" />实时</span>
                  <button className="text-button" type="button">流程详情<ChevronRight size={14} /></button>
                </div>
              </div>

              <div className="workflow-progress" aria-label="事故处置流程">
                {stageMetrics.map((stage, index) => {
                  const Icon = stageIcons[stage.key];
                  const completed = simulation.completedStages.includes(stage.key);
                  const active = simulation.activeStage === stage.key;
                  return (
                    <div className={`workflow-stage ${active ? 'active' : ''} ${completed ? 'completed' : ''}`} key={stage.key}>
                      <div className="stage-track">
                        <div className="stage-node"><Icon size={18} /></div>
                        {index < stageMetrics.length - 1 ? <div className="stage-connector"><span /></div> : null}
                      </div>
                      <div className="stage-title"><strong>{stage.label}</strong><span>{stage.queue} 待处理</span></div>
                      <p>{stage.description}</p>
                      <dl className="stage-stats">
                        <div><dt>成功率</dt><dd>{stage.successRate}%</dd></div>
                        <div><dt>P50 耗时</dt><dd>{(stage.p50Ms / 1000).toFixed(2)}s</dd></div>
                        <div><dt>人工接管</dt><dd>{stage.humanRate}%</dd></div>
                      </dl>
                    </div>
                  );
                })}
              </div>

              <div className="trace-strip">
                <div className="trace-id"><span className="severity-dot" /><div><span>当前 Incident</span><strong>INC-20260825-031 · 星海出行</strong></div></div>
                <div className="trace-metric"><span>当前阶段</span><strong>{currentStage?.label ?? '等待注入'}</strong></div>
                <div className="trace-metric"><span>Agent 耗时</span><strong>{currentStage ? `${(currentStage.p50Ms / 1000).toFixed(2)}s` : '—'}</strong></div>
                <div className="trace-metric"><span>工具调用</span><strong>{currentStage?.toolCalls ?? '—'}</strong></div>
                <div className="trace-metric"><span>Token</span><strong>{currentStage?.tokens.toLocaleString() ?? '—'}</strong></div>
                <div className="trace-metric"><span>本次成本</span><strong>{currentStage ? `¥${currentStage.costYuan.toFixed(2)}` : '—'}</strong></div>
                <div className="trace-metric confidence"><span>置信度</span><strong>{currentStage ? `${currentStage.confidence}%` : '—'}</strong></div>
              </div>

              {simulation.mode === 'paused_for_review' ? (
                <div className="review-banner">
                  <Pause size={17} />
                  <div><strong>商户触达内容待审核</strong><span>AI 已生成故障说明与排查建议，审核后将进入升级判断。</span></div>
                  <button type="button" onClick={() => dispatch({ type: 'APPROVE_CONTACT' })}>批准发送</button>
                </div>
              ) : null}
            </article>

            <article className="panel incident-focus">
              <div className="panel-header compact"><div><span className="section-kicker danger">P0 INCIDENT</span><h2>重点事故</h2></div><button className="icon-button" aria-label="查看重点事故"><ChevronRight size={17} /></button></div>
              <div className="incident-title-row"><div className="incident-service-icon"><Boxes size={19} /></div><div><strong>星海出行</strong><span>支付接口超时率突增</span></div><span className="severity-badge">P0</span></div>
              <div className="impact-value"><span>预估影响金额</span><strong>¥286.4万</strong><em>持续 08m 42s</em></div>
              <div className="evidence-stack">
                <div><span className="evidence-icon danger"><Activity size={15} /></span><p><span>支付成功率</span><strong>99.72% → 71.36%</strong></p><small>-28.36pp</small></div>
                <div><span className="evidence-icon warning"><Gauge size={15} /></span><p><span>商户接口 P95 RT</span><strong>126ms → 4,620ms</strong></p><small>36.7×</small></div>
                <div><span className="evidence-icon violet"><Wrench size={15} /></span><p><span>TIMEOUT 错误码</span><strong>23.4 倍异常增长</strong></p><small>高相关</small></div>
              </div>
              <div className="root-cause-card"><div><BrainCircuit size={16} /><span>AI 根因判断</span><b>93%</b></div><strong>商户 API 网关连接池耗尽</strong><p>与 2026-07-18 历史 Case 相似度 91.4%，变更后 4 分钟开始恶化。</p></div>
              <button className="incident-detail-button" type="button" onClick={() => setOverviewDrawerOpen(true)}>查看完整证据链<ChevronRight size={15} /></button>
            </article>
          </section>

          <section className="secondary-grid">
            <article className="panel volume-panel">
              <div className="panel-header compact"><div><span className="section-kicker">24H SIGNAL</span><h2>告警与真实故障趋势</h2></div><div className="chart-legend"><span className="alerts" />原始告警<span className="incidents" />真实故障</div></div>
              <div className="bar-chart" aria-label="告警与故障趋势柱状图">
                {volumeSeries.map((point) => (
                  <div className="bar-group" key={point.time}>
                    <div className="bar-pair"><span className="bar alerts" style={{ height: `${point.alerts * 1.8}px` }} /><span className="bar incidents" style={{ height: `${point.incidents * 4}px` }} /></div>
                    <small>{point.time}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel incident-list-panel">
              <div className="panel-header compact"><div><span className="section-kicker">PRIORITY QUEUE</span><h2>重点事故队列</h2></div><button className="text-button" type="button">查看全部<ChevronRight size={14} /></button></div>
              <div className="incident-table-wrap">
                <table>
                  <thead><tr><th>事故 / 商户</th><th>等级</th><th>当前阶段</th><th>影响金额</th><th>持续时间</th><th>AI 置信度</th></tr></thead>
                  <tbody>
                    {incidentSummaries.map((incident) => (
                      <tr key={incident.id}>
                        <td><strong>{incident.title}</strong><span>{incident.id} · {incident.merchant}</span></td>
                        <td><span className={`table-severity tone-${severityTone[incident.severity]}`}>{incident.severity}</span></td>
                        <td><span className="stage-pill"><span />{stageMetrics.find((stage) => stage.key === incident.stage)?.label}</span></td>
                        <td>{incident.impact}</td><td>{incident.duration}</td><td><span className="confidence-cell">{incident.confidence}%<i><b style={{ width: `${incident.confidence}%` }} /></i></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
          </>
          ) : activeView === 'flow' ? (
            <FlowAnalyticsView />
          ) : activeView === 'evaluation' ? (
            <EvaluationView />
          ) : (
            <IncidentsView />
          )}
        </div>
      </section>
      {overviewDrawerOpen ? <IncidentDrawer onClose={() => setOverviewDrawerOpen(false)} /> : null}
    </main>
  );
}
