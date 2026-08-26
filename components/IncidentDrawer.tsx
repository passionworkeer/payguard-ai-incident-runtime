'use client';

import { Activity, BrainCircuit, CheckCircle2, CircleDollarSign, Clock3, DatabaseZap, Gauge, MessageSquareText, Send, Sparkles, Target, Wrench, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { IncidentSummary } from '../lib/types';

interface IncidentDrawerProps {
  incident: IncidentSummary;
  onClose: () => void;
  onStartDemo?: () => void;
}

// 五阶段 Agent Trace 展示的是处置管线本身的示例链路，与具体事故无关。
const traces = [
  ['智能核验','1.24s','842','¥0.06','96%','Metrics × 2 · Merchant Profile × 1'],
  ['定位分析','4.38s','1,964','¥0.18','93%','Metrics × 3 · Logs × 2 · Case RAG × 2'],
  ['商户触达','0.98s','612','¥0.05','95%','Merchant Profile × 1 · Message × 1'],
  ['故障升级','0.46s','286','¥0.03','98%','Impact Policy × 1 · Ticket × 1'],
  ['恢复判断','1.86s','734','¥0.10','94%','Metrics × 3 · Logs × 1'],
];

export default function IncidentDrawer({ incident, onClose, onStartDemo }: IncidentDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 黄金场景（处置演示对应的事故）才有完整的合成证据链叙事；其余事故只展示真实字段。
  const isGolden = incident.id === 'INC-20260825-031';
  const severityTone = incident.severity === 'P0' ? '' : incident.severity === 'P1' ? ' tone-warning' : ' tone-info';

  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="关闭事故详情" onClick={onClose}/><aside className="incident-drawer" role="dialog" aria-modal="true" aria-label="事故详情">
    <header className="drawer-header"><div><span className={`severity-badge${severityTone}`}>{incident.severity}</span><small>{incident.id}</small><h2>{incident.title}</h2><p>{incident.merchant} · 2026-08-25 {incident.startedAt}</p></div><button className="icon-button" ref={closeRef} aria-label="关闭事故详情" onClick={onClose}><X size={18}/></button></header>
    <div className="drawer-kpis"><div><span><CircleDollarSign size={14}/>影响金额</span><strong>{incident.impact}</strong></div><div><span><Clock3 size={14}/>持续时间</span><strong>{incident.duration}</strong></div><div><span><Sparkles size={14}/>总体置信度</span><strong>{incident.confidence}%</strong></div></div>
    <div className="drawer-scroll">
      {isGolden ? (
        <>
          <section className="drawer-section"><div className="drawer-section-title"><div><BrainCircuit size={15}/><span>AI 结构化决策</span></div><small>Evidence Agent v3.4</small></div><div className="decision-card"><div><span>故障判断</span><b>真实故障</b></div><div><span>Top-1 根因</span><b>商户 API 网关连接池耗尽</b></div><div><span>推荐动作</span><b>立即触达商户并升级 P0 联合响应</b></div><div><span>恢复条件</span><b>连续 3 个窗口成功率 ≥ 99.5%</b></div></div></section>
          <section className="drawer-section"><div className="drawer-section-title"><div><Activity size={15}/><span>关键证据</span></div><small>4 条已引用</small></div><div className="drawer-evidence"><div><Gauge size={15}/><p><span>支付成功率</span><strong>99.72% → 71.36%</strong></p><b>-28.36pp</b></div><div><Clock3 size={15}/><p><span>商户接口 P95 RT</span><strong>126ms → 4,620ms</strong></p><b>36.7×</b></div><div><Wrench size={15}/><p><span>错误码聚合</span><strong>TIMEOUT 错误码增加 23.4 倍</strong></p><b>高相关</b></div><div><DatabaseZap size={15}/><p><span>历史 Case</span><strong>INC-20260718-119 · 连接池耗尽</strong></p><b>91.4%</b></div></div></section>
        </>
      ) : (
        <section className="drawer-section"><div className="drawer-section-title"><div><BrainCircuit size={15}/><span>AI 结构化决策</span></div><small>Evidence Agent v3.4</small></div><div className="decision-card"><div><span>故障判断</span><b>真实故障</b></div><div><span>当前阶段</span><b>{incident.stage === 'verify' ? '智能核验' : incident.stage === 'locate' ? '定位分析' : incident.stage === 'contact' ? '商户触达' : incident.stage === 'escalate' ? '故障升级' : '恢复判断'}</b></div><div><span>置信度</span><b>{incident.confidence}%</b></div><div><span>证据链</span><b>进入处置演示生成完整链路</b></div></div><p className="drawer-generic-note">该事故的完整证据、根因与触达内容由处置演示链路实时生成；此处展示的是当前档案快照。</p></section>
      )}
      <section className="drawer-section"><div className="drawer-section-title"><div><Target size={15}/><span>五阶段 Agent Trace</span></div><small>{isGolden ? '总耗时 8.92s · ¥0.42' : '示例链路 · 演示口径'}</small></div><div className="trace-timeline">{traces.map((trace,index)=><article key={trace[0]}><span className="trace-index">{index+1}</span><div className="trace-body"><div><strong>{trace[0]}</strong><span className="trace-success"><CheckCircle2 size={12}/>完成</span></div><dl><div><dt>耗时</dt><dd>{trace[1]}</dd></div><div><dt>Token</dt><dd>{trace[2]}</dd></div><div><dt>成本</dt><dd>{trace[3]}</dd></div><div><dt>置信度</dt><dd>{trace[4]}</dd></div></dl><p>{trace[5]}</p></div></article>)}</div></section>
      {isGolden ? (
        <section className="drawer-section"><div className="drawer-section-title"><div><MessageSquareText size={15}/><span>商户触达预览</span></div><small>站内信 · 待审核</small></div><div className="message-preview"><p>您好，我们监测到贵司支付接口自 14:23 起出现大面积超时，当前支付成功率下降至 71.36%。初步定位为 API 网关连接池耗尽，请优先检查连接池上限及 14:19 发布变更。</p><div><span>预计影响：¥286.4 万</span><span>建议 10 分钟内响应</span></div></div></section>
      ) : null}
    </div>
    <footer className="drawer-footer"><span>所有操作均为本地模拟</span><div><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button" onClick={onStartDemo ?? onClose}><Send size={14}/>进入处置演示</button></div></footer>
  </aside></div>;
}
