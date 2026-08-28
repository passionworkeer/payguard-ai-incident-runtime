'use client';

import type { EChartsOption } from 'echarts';
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDollarSign, Filter, MousePointerClick, Sparkles, Target, TimerReset } from 'lucide-react';
import { useState } from 'react';
import type { EvaluationSample } from '../lib/runtime/evaluation';
import EChart from './EChart';

const axis = { axisLine: { lineStyle: { color: '#c9d3e4' } }, axisLabel: { color: '#66738c', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(220,227,239,.6)' } } };
const tooltip = { backgroundColor: '#ffffff', borderColor: '#dce3ef', textStyle: { color: '#111d36', fontSize: 10 } };

// 导出给 OverviewView 复用：保持全站图表视觉一致（浅色纸质风格，密集单行网格）。
export const overviewAxis = axis;
export const overviewTooltip = tooltip;

const funnel = [
  { name: '原始告警', value: 12847 }, { name: '候选事件', value: 3982 }, { name: '真实故障', value: 2194 },
  { name: '成功定位', value: 1876 }, { name: '成功触达', value: 1522 }, { name: '确认恢复', value: 1439 },
];

const funnelOption: EChartsOption = {
  color: ['#b9c8e4', '#9fb6e8', '#7d9cf2', '#5b82f7', '#3f70fa', '#0e9c6f'],
  tooltip: { ...tooltip, trigger: 'item', formatter: '{b}<br/>{c} 起 · {d}%' },
  series: [{ type: 'funnel', left: '8%', top: 14, bottom: 12, width: '84%', minSize: '28%', maxSize: '100%', sort: 'descending', gap: 4, label: { color: '#43516b', fontSize: 9, formatter: '{b}  {c}' }, labelLine: { length: 8, lineStyle: { color: '#b6c1d4' } }, itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 3 }, data: funnel }],
};

const sankeyNodes = ['监控阈值', '异常检测', '商户反馈', '真实故障', '误报降噪', '接口超时', '签名错误', '流量限流', '商户触达', '内部升级', '自动恢复', '人工恢复'].map((name) => ({ name }));
const sankeyLinks = [
  ['监控阈值','真实故障',1340], ['监控阈值','误报降噪',520], ['异常检测','真实故障',682], ['异常检测','误报降噪',211], ['商户反馈','真实故障',172],
  ['真实故障','接口超时',912], ['真实故障','签名错误',486], ['真实故障','流量限流',796], ['接口超时','商户触达',698], ['接口超时','内部升级',214],
  ['签名错误','商户触达',421], ['签名错误','内部升级',65], ['流量限流','商户触达',403], ['流量限流','内部升级',393], ['商户触达','自动恢复',1328], ['商户触达','人工恢复',194], ['内部升级','自动恢复',421], ['内部升级','人工恢复',251],
].map(([source,target,value]) => ({ source: String(source), target: String(target), value: Number(value) }));

const sankeyOption: EChartsOption = {
  color: ['#8d9ab2', '#7d9cf2', '#12a9c0', '#0e9c6f', '#5d6a82', '#d95c4a', '#e07a1f', '#7c5cd6', '#3fbfa0', '#4f8cff', '#66738c', '#d58558'],
  tooltip: { ...tooltip, trigger: 'item' },
  series: [{ type: 'sankey', left: 10, right: 18, top: 16, bottom: 16, nodeWidth: 10, nodeGap: 10, draggable: false, emphasis: { focus: 'adjacency' }, label: { color: '#43516b', fontSize: 9 }, lineStyle: { color: 'gradient', opacity: .34, curveness: .48 }, data: sankeyNodes, links: sankeyLinks }],
};

const latencyOption: EChartsOption = {
  color: ['#175cff', '#7c5cd6', '#e07a1f'], tooltip: { ...tooltip, trigger: 'axis' }, legend: { top: 0, right: 8, textStyle: { color: '#66738c', fontSize: 9 } },
  grid: { left: 38, right: 14, top: 32, bottom: 25 }, xAxis: { type: 'category', data: ['核验','定位','触达','升级','恢复'], ...axis }, yAxis: { type: 'value', name: '秒', nameTextStyle: { color: '#8b96aa', fontSize: 8 }, ...axis },
  series: [
    { name: 'P50', type: 'bar', barMaxWidth: 14, data: [1.24,4.38,.98,.46,1.86], itemStyle: { borderRadius: [3,3,0,0] } },
    { name: 'P95', type: 'bar', barMaxWidth: 14, data: [2.86,8.92,2.14,1.12,4.26], itemStyle: { borderRadius: [3,3,0,0] } },
    { name: 'SLA', type: 'line', symbol: 'none', lineStyle: { type: 'dashed', width: 1.2 }, data: [3,9,3,2,5] },
  ],
};

const toolOption: EChartsOption = {
  color: ['#175cff','#0e9c6f'], tooltip: { ...tooltip, trigger: 'axis' }, legend: { right: 8, top: 0, textStyle: { color: '#66738c', fontSize: 9 } }, grid: { left: 88, right: 34, top: 30, bottom: 18 },
  xAxis: [
    { type: 'value', ...axis },
    { type: 'value', min: 90, max: 100, position: 'top', axisLabel: { formatter: '{value}%', color: '#66738c', fontSize: 8 }, splitLine: { show: false }, axisLine: { lineStyle: { color: '#c9d3e4' } } },
  ], yAxis: { type: 'category', data: ['Message','Ticket','Merchant Profile','Case RAG','Logs','Metrics'], ...axis },
  series: [{ name: '调用量', type: 'bar', data: [1522,672,2194,1876,3510,5892], barMaxWidth: 10, itemStyle: { borderRadius: [0,4,4,0] } }, { name: '成功率', type: 'line', xAxisIndex: 1, data: [98,99,99,94,97,99], symbolSize: 5 }],
};

const channelOption: EChartsOption = {
  color: ['#b9c8e4','#9fb6e8','#7d9cf2','#5b82f7','#0e9c6f'], tooltip: { ...tooltip, trigger: 'item' },
  series: [{ type: 'funnel', left: '8%', top: 18, bottom: 14, width: '84%', minSize: '34%', maxSize: '100%', gap: 3, label: { color: '#43516b', fontSize: 9, formatter: '{b}  {c}' }, itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, data: [{name:'发送',value:1648},{name:'送达',value:1522},{name:'打开',value:1184},{name:'点击',value:986},{name:'回复',value:542}] }],
};

function ViewHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  // 静态徽标而非按钮：这些筛选在演示数据集上是固定口径，不做假的交互反馈。
  return <div className="view-header"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="view-actions"><span className="view-chip"><Filter size={14}/>全部商户</span><span className="view-chip">近 7 日</span></div></div>;
}

export { ViewHeader };

function MiniMetric({ icon: Icon, label, value, helper, tone = 'cyan' }: { icon: typeof Target; label: string; value: string; helper: string; tone?: string }) {
  return <article className={`mini-metric mini-${tone}`}><span><Icon size={16}/></span><div><small>{label}</small><strong>{value}</strong><em>{helper}</em></div></article>;
}

export function FlowAnalyticsView() {
  const [selectedFlow, setSelectedFlow] = useState('全部链路');
  const showAll = selectedFlow === '全部链路' || !sankeyNodes.some((node) => node.name === selectedFlow);
  const filteredLinks = showAll
    ? sankeyLinks
    : sankeyLinks.filter((link) => link.source === selectedFlow || link.target === selectedFlow);
  const filteredSankeyOption: EChartsOption = {
    ...sankeyOption,
    series: [{
      ...(sankeyOption.series as object[])[0],
      data: sankeyNodes,
      links: filteredLinks,
    }],
  };
  return <div className="view-page">
    <ViewHeader eyebrow="FLOW INTELLIGENCE" title="全链路处置分析" description="从告警进入到恢复确认，识别每个环节的转化、耗时和 AI 贡献。" />
    <section className="mini-metric-grid">
      <MiniMetric icon={ArrowUpRight} label="端到端转化率" value="11.2%" helper="告警 → 确认恢复" />
      <MiniMetric icon={TimerReset} label="P95 处置时长" value="31.4m" helper="目标 ≤ 35m" tone="violet" />
      <MiniMetric icon={MousePointerClick} label="触达点击率" value="64.8%" helper="+4.7% vs v3.3" tone="green" />
      <MiniMetric icon={CircleDollarSign} label="挽回影响金额" value="¥1,842万" helper="演示估算口径" tone="amber" />
    </section>
    <section className="analysis-grid analysis-main">
      <article className="panel chart-panel"><div className="chart-card-head"><div><span>STAGE CONVERSION</span><h3>全链路处置漏斗</h3></div><small>基于 12,847 条告警</small></div><EChart option={funnelOption} summary="12,847 条告警最终确认恢复 1,439 起，端到端转化率 11.2%。" /></article>
      <article className="panel chart-panel wide"><div className="chart-card-head"><div><span>INCIDENT JOURNEY</span><h3>告警去向与处置路径</h3></div><button type="button" onClick={() => setSelectedFlow('全部链路')}>已选：{selectedFlow} {showAll ? '' : '↺'}</button></div><EChart option={filteredSankeyOption} summary={`告警从来源流向核验结果、根因、处置动作和恢复结果${showAll ? '' : `，当前聚焦 ${selectedFlow} 节点`}。`} onSelect={setSelectedFlow} /></article>
      <article className="panel chart-panel"><div className="chart-card-head"><div><span>STAGE LATENCY</span><h3>逐环节 AI 耗时</h3></div><small>P50 / P95 / SLA</small></div><EChart option={latencyOption} summary="定位分析是耗时最长环节，P95 为 8.92 秒，仍低于 9 秒 SLA。" /></article>
      <article className="panel chart-panel"><div className="chart-card-head"><div><span>TOOL ADOPTION</span><h3>工具调用量与成功率</h3></div><small>6 类核心工具</small></div><EChart option={toolOption} summary="Metrics 工具使用最多，所有工具成功率均高于 94%。" /></article>
      <article className="panel chart-panel"><div className="chart-card-head"><div><span>MERCHANT ENGAGEMENT</span><h3>商户触达行为漏斗</h3></div><small>点击率 64.8%</small></div><EChart option={channelOption} summary="1,522 次送达产生 986 次点击与 542 次回复。" /></article>
    </section>
  </div>;
}

const experimentOption: EChartsOption = {
  color: ['#8d9ab2','#93b0ff','#5b82f7','#0e9c6f'], tooltip: { ...tooltip, trigger: 'axis' }, legend: { top: 0, right: 6, textStyle: { color: '#66738c', fontSize: 9 } }, grid: { left: 44, right: 12, top: 36, bottom: 24 },
  xAxis: { type: 'category', data: ['核验 Recall','根因 Top-1','Evidence','自动处置'], ...axis }, yAxis: { type: 'value', min: 50, max: 100, axisLabel: { formatter: '{value}%', color: '#66738c', fontSize: 9 }, splitLine: axis.splitLine },
  series: [
    { name:'规则基线',type:'bar',data:[82.1,58.4,51.2,46.8] }, { name:'RAG Agent',type:'bar',data:[91.5,76.8,84.7,65.2] }, { name:'Evidence v3.3',type:'bar',data:[96.9,84.2,93.5,74.1] }, { name:'Evidence v3.4',type:'bar',data:[98.7,86.9,96.8,78.4], itemStyle:{ borderRadius:[3,3,0,0] } },
  ],
};

const severityOption: EChartsOption = {
  color: ['#d95c4a','#e07a1f','#175cff'], tooltip: { ...tooltip, trigger:'axis' }, grid:{left:40,right:15,top:20,bottom:25}, xAxis:{type:'category',data:['P0','P1','P2'],...axis}, yAxis:{type:'value',min:90,max:100,axisLabel:{formatter:'{value}%',color:'#66738c',fontSize:9},splitLine:axis.splitLine},
  series:[{type:'bar',barMaxWidth:30,data:[98.7,96.4,94.8],itemStyle:{borderRadius:[4,4,0,0]},markLine:{silent:true,symbol:'none',lineStyle:{color:'#e07a1f',type:'dashed'},label:{formatter:'P0 目标 99%',color:'#9a6a2a',fontSize:8},data:[{yAxis:99}]}}],
};

const badCases = [
  ['EVAL-0842','P0','核验','大促流量突增被识别为真实故障','边界样本','待标注'],
  ['EVAL-0837','P1','定位','Top-1 选择签名错误，实际为证书过期','相似根因','已回流'],
  ['EVAL-0829','P2','恢复','单窗口回弹导致过早恢复','时序不足','修复中'],
  ['EVAL-0816','P1','触达','排查建议未匹配商户技术等级','画像缺失','已回流'],
];

export function EvaluationView({ sample }: { sample?: EvaluationSample | null }) {
  return <div className="view-page">
    <ViewHeader eyebrow="AI QUALITY SYSTEM" title="智能化效果评测" description="把核验、定位、证据与动作质量产品化，形成离线回放到线上 Bad Case 的持续优化闭环。" />
    {sample ? <article className="panel current-evaluation-sample"><div><span>本次演示样本</span><strong>{sample.sampleId}</strong></div><dl><div><dt>核验结果</dt><dd>{sample.predictedIncident ? '真实故障 / TP' : '正常'}</dd></div><div><dt>预测根因</dt><dd>{sample.predictedRootCause}</dd></div><div><dt>最终根因</dt><dd>{sample.finalRootCause}</dd></div><div><dt>人工修正</dt><dd>{sample.humanCorrected ? '是' : '否'}</dd></div></dl></article> : null}
    <section className="mini-metric-grid">
      <MiniMetric icon={Target} label="核验 F1" value="94.9%" helper="Precision 91.4%" />
      <MiniMetric icon={CheckCircle2} label="根因 Top-3" value="96.2%" helper="Top-1 86.9%" tone="green" />
      <MiniMetric icon={Sparkles} label="Evidence Grounding" value="96.8%" helper="目标 ≥ 95%" tone="violet" />
      <MiniMetric icon={AlertTriangle} label="幻觉率" value="0.7%" helper="-0.5pp vs v3.3" tone="amber" />
    </section>
    <section className="analysis-grid evaluation-grid">
      <article className="panel chart-panel experiment-panel"><div className="chart-card-head"><div><span>EXPERIMENT COMPARISON</span><h3>模型与 Prompt 实验对比</h3></div><small>Dataset v2026.08 · 2,480 Cases</small></div><EChart option={experimentOption} summary="Evidence Agent v3.4 在四项核心指标中均领先。" /></article>
      <article className="panel chart-panel"><div className="chart-card-head"><div><span>SEVERITY RECALL</span><h3>分级故障召回率</h3></div><small>P0 目标 99%</small></div><EChart option={severityOption} summary="P0 召回率 98.7%，距离 99% 目标仍差 0.3 个百分点。" /></article>
      <article className="panel matrix-panel"><div className="chart-card-head"><div><span>VERIFY CONFUSION MATRIX</span><h3>核验混淆矩阵</h3></div><small>Precision 91.4% · Recall 98.7%</small></div><div className="matrix"><span /><b>预测故障</b><b>预测正常</b><strong>真实故障</strong><em className="tp">1,842<small>TP</small></em><em className="fn">24<small>FN</small></em><strong>真实正常</strong><em className="fp">173<small>FP</small></em><em className="tn">441<small>TN</small></em></div></article>
      <article className="panel bad-case-panel"><div className="chart-card-head"><div><span>FAILURE FEEDBACK</span><h3>Bad Case 回流队列</h3></div><small>人工复核 · 每日回流</small></div><div className="incident-table-wrap"><table><thead><tr><th>Case</th><th>等级</th><th>环节</th><th>失败摘要</th><th>归因</th><th>状态</th></tr></thead><tbody>{badCases.map((row)=><tr key={row[0]}>{row.map((cell,index)=><td key={cell}>{index===0?<strong>{cell}</strong>:cell}</td>)}</tr>)}</tbody></table></div></article>
    </section>
  </div>;
}
