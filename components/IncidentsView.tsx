'use client';

import { ChevronRight, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { incidentSummaries, stageMetrics } from '../lib/mock-data';
import type { IncidentSummary } from '../lib/types';
import IncidentDrawer from './IncidentDrawer';

type SeverityFilter = 'ALL' | 'P0' | 'P1' | 'P2';

export default function IncidentsView({ onStartDemo }: { onStartDemo?: () => void }) {
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<IncidentSummary | null>(null);

  const counts = useMemo(() => ({
    ALL: incidentSummaries.length,
    P0: incidentSummaries.filter((incident) => incident.severity === 'P0').length,
    P1: incidentSummaries.filter((incident) => incident.severity === 'P1').length,
    P2: incidentSummaries.filter((incident) => incident.severity === 'P2').length,
  }), []);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return incidentSummaries.filter((incident) => {
      if (severity !== 'ALL' && incident.severity !== severity) return false;
      if (!keyword) return true;
      return [incident.id, incident.merchant, incident.title].some((field) => field.toLowerCase().includes(keyword));
    });
  }, [query, severity]);

  return <div className="view-page incidents-page">
    <div className="view-header"><div><span>INCIDENT OPERATIONS</span><h2>事故中心</h2><p>统一查看三方商户故障状态、业务影响、AI 处置阶段和证据质量。</p></div><div className="view-actions"><span className="view-chip"><Filter size={14}/>P0–P2</span><span className="view-chip">全部阶段</span></div></div>
    <section className="incident-toolbar">
      <label><Search size={15}/><input aria-label="筛选事故" placeholder="搜索事故 ID、商户或故障类型" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <div>
        {(['ALL', 'P0', 'P1', 'P2'] as const).map((key) => (
          <button key={key} className={severity === key ? 'active' : ''} onClick={() => setSeverity(key)}>
            {key === 'ALL' ? `全部 ${counts.ALL}` : `${key} ${counts[key]}`}
          </button>
        ))}
      </div>
    </section>
    <article className="panel incident-center-panel"><div className="incident-table-wrap"><table><thead><tr><th>事故 / 商户</th><th>等级</th><th>当前阶段</th><th>开始时间</th><th>影响金额</th><th>持续时间</th><th>AI 置信度</th><th>操作</th></tr></thead><tbody>{visible.map((incident)=><tr key={incident.id}><td><button className="incident-row-button" onClick={()=>setSelected(incident)} aria-label={`查看 ${incident.id} ${incident.title}`}><strong>{incident.title}</strong><span>{incident.id} · {incident.merchant}</span></button></td><td><span className={`table-severity tone-${incident.severity==='P0'?'danger':incident.severity==='P1'?'warning':'info'}`}>{incident.severity}</span></td><td><span className="stage-pill"><span/>{stageMetrics.find((stage)=>stage.key===incident.stage)?.label}</span></td><td>{incident.startedAt}</td><td>{incident.impact}</td><td>{incident.duration}</td><td><span className="confidence-cell">{incident.confidence}%<i><b style={{width:`${incident.confidence}%`}}/></i></span></td><td>{incident.id === 'INC-20260825-031' && onStartDemo ? <button className="table-action" type="button" onClick={onStartDemo}>进入处置演示</button> : <ChevronRight size={14}/>}</td></tr>)}</tbody></table>
      {visible.length === 0 ? <p className="incident-empty-copy">没有匹配当前筛选条件的事故，可调整严重度或清空搜索关键词。</p> : null}
    </div></article>
    {selected ? <IncidentDrawer incident={selected} onClose={() => setSelected(null)} onStartDemo={onStartDemo}/> : null}
  </div>;
}
