'use client';

import { Activity, BrainCircuit, CheckCircle2, ChevronDown, CircleDollarSign, Clock3, DatabaseZap, Gauge, MessageSquareText, Send, Sparkles, Target, Wrench, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface IncidentDrawerProps { onClose: () => void; }

const traces = [
  ['智能核验','1.24s','842','¥0.06','96%','Metrics × 2 · Merchant Profile × 1'],
  ['定位分析','4.38s','1,964','¥0.18','93%','Metrics × 3 · Logs × 2 · Case RAG × 2'],
  ['商户触达','0.98s','612','¥0.05','95%','Merchant Profile × 1 · Message × 1'],
  ['故障升级','0.46s','286','¥0.03','98%','Impact Policy × 1 · Ticket × 1'],
  ['恢复判断','1.86s','734','¥0.10','94%','Metrics × 3 · Logs × 1'],
];

export default function IncidentDrawer({ onClose }: IncidentDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="关闭事故详情" onClick={onClose}/><aside className="incident-drawer" role="dialog" aria-modal="true" aria-label="事故详情">
    <header className="drawer-header"><div><span className="severity-badge">P0</span><small>INC-20260825-031</small><h2>支付接口超时率突增</h2><p>星海出行 · 2026-08-25 14:23:18</p></div><button className="icon-button" ref={closeRef} aria-label="关闭事故详情" onClick={onClose}><X size={18}/></button></header>
    <div className="drawer-kpis"><div><span><CircleDollarSign size={14}/>影响金额</span><strong>¥286.4万</strong></div><div><span><Clock3 size={14}/>当前 MTTR</span><strong>08m 42s</strong></div><div><span><Sparkles size={14}/>总体置信度</span><strong>93%</strong></div></div>
    <div className="drawer-scroll">
      <section className="drawer-section"><div className="drawer-section-title"><div><BrainCircuit size={15}/><span>AI 结构化决策</span></div><small>Evidence Agent v3.4</small></div><div className="decision-card"><div><span>故障判断</span><b>真实故障</b></div><div><span>Top-1 根因</span><b>商户 API 网关连接池耗尽</b></div><div><span>推荐动作</span><b>立即触达商户并升级 P0 联合响应</b></div><div><span>恢复条件</span><b>连续 3 个窗口成功率 ≥ 99.5%</b></div></div></section>
      <section className="drawer-section"><div className="drawer-section-title"><div><Activity size={15}/><span>关键证据</span></div><small>4 条已引用</small></div><div className="drawer-evidence"><div><Gauge size={15}/><p><span>支付成功率</span><strong>99.72% → 71.36%</strong></p><b>-28.36pp</b></div><div><Clock3 size={15}/><p><span>商户接口 P95 RT</span><strong>126ms → 4,620ms</strong></p><b>36.7×</b></div><div><Wrench size={15}/><p><span>错误码聚合</span><strong>TIMEOUT 错误码增加 23.4 倍</strong></p><b>高相关</b></div><div><DatabaseZap size={15}/><p><span>历史 Case</span><strong>INC-20260718-119 · 连接池耗尽</strong></p><b>91.4%</b></div></div></section>
      <section className="drawer-section"><div className="drawer-section-title"><div><Target size={15}/><span>五阶段 Agent Trace</span></div><small>总耗时 8.92s · ¥0.42</small></div><div className="trace-timeline">{traces.map((trace,index)=><article key={trace[0]}><span className="trace-index">{index+1}</span><div className="trace-body"><div><strong>{trace[0]}</strong><span className="trace-success"><CheckCircle2 size={12}/>完成</span><button aria-label={`展开${trace[0]}详情`}><ChevronDown size={14}/></button></div><dl><div><dt>耗时</dt><dd>{trace[1]}</dd></div><div><dt>Token</dt><dd>{trace[2]}</dd></div><div><dt>成本</dt><dd>{trace[3]}</dd></div><div><dt>置信度</dt><dd>{trace[4]}</dd></div></dl><p>{trace[5]}</p></div></article>)}</div></section>
      <section className="drawer-section"><div className="drawer-section-title"><div><MessageSquareText size={15}/><span>商户触达预览</span></div><small>站内信 · 待审核</small></div><div className="message-preview"><p>您好，我们监测到贵司支付接口自 14:23 起出现大面积超时，当前支付成功率下降至 71.36%。初步定位为 API 网关连接池耗尽，请优先检查连接池上限及 14:19 发布变更。</p><div><span>预计影响：¥286.4 万</span><span>建议 10 分钟内响应</span></div></div></section>
    </div>
    <footer className="drawer-footer"><span>所有操作均为本地模拟</span><div><button className="secondary-button">人工接管</button><button className="primary-button"><Send size={14}/>批准发送</button></div></footer>
  </aside></div>;
}
