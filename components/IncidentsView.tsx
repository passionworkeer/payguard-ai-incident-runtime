'use client';

import { ChevronRight, Filter, Search } from 'lucide-react';
import { useState } from 'react';
import { incidentSummaries, stageMetrics } from '../lib/mock-data';
import IncidentDrawer from './IncidentDrawer';

export default function IncidentsView({ onStartDemo }: { onStartDemo?: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return <div className="view-page incidents-page">
    <div className="view-header"><div><span>INCIDENT OPERATIONS</span><h2>事故中心</h2><p>统一查看三方商户故障状态、业务影响、AI 处置阶段和证据质量。</p></div><div className="view-actions"><button><Filter size={14}/>P0–P2</button><button>全部阶段<ChevronRight size={13}/></button></div></div>
    <section className="incident-toolbar"><label><Search size={15}/><input aria-label="筛选事故" placeholder="搜索事故 ID、商户或故障类型"/></label><div><button className="active">全部 31</button><button>P0 3</button><button>P1 11</button><button>P2 17</button></div></section>
    <article className="panel incident-center-panel"><div className="incident-table-wrap"><table><thead><tr><th>事故 / 商户</th><th>等级</th><th>当前阶段</th><th>开始时间</th><th>影响金额</th><th>持续时间</th><th>AI 置信度</th><th>操作</th></tr></thead><tbody>{incidentSummaries.map((incident)=><tr key={incident.id}><td><button className="incident-row-button" onClick={()=>setDrawerOpen(true)} aria-label={`查看 ${incident.id} ${incident.title}`}><strong>{incident.title}</strong><span>{incident.id} · {incident.merchant}</span></button></td><td><span className={`table-severity tone-${incident.severity==='P0'?'danger':incident.severity==='P1'?'warning':'info'}`}>{incident.severity}</span></td><td><span className="stage-pill"><span/>{stageMetrics.find((stage)=>stage.key===incident.stage)?.label}</span></td><td>{incident.startedAt}</td><td>{incident.impact}</td><td>{incident.duration}</td><td><span className="confidence-cell">{incident.confidence}%<i><b style={{width:`${incident.confidence}%`}}/></i></span></td><td>{incident.id === 'INC-20260825-031' && onStartDemo ? <button className="table-action" type="button" onClick={onStartDemo}>进入处置演示</button> : <ChevronRight size={14}/>}</td></tr>)}</tbody></table></div></article>
    {drawerOpen ? <IncidentDrawer onClose={()=>setDrawerOpen(false)}/> : null}
  </div>;
}
