'use client';

import type { EChartsOption } from 'echarts';
import { AlertTriangle, CheckCircle2, CircleSlash, Filter, Target } from 'lucide-react';
import { kpiMetrics } from '../lib/mock-data';
import { alertFeed, metricTimeline, mttrBreakdown } from '../lib/overview-data';
import { ViewHeader, overviewAxis, overviewTooltip } from './AnalyticsViews';
import EChart from './EChart';

const tierTitle: Record<NonNullable<(typeof kpiMetrics)[number]['tier']>, { eyebrow: string; title: string; description: string }> = {
  north_star: { eyebrow: 'TIER · NORTH STAR', title: '北极星指标', description: '战略对齐卡，所有运营动作的最终判据。' },
  primary: { eyebrow: 'TIER · PRIMARY', title: '一级指标', description: '日常运营盯的转化 / 触达 / 检出；驱动 ROI 提升。' },
  guardrail: { eyebrow: 'TIER · GUARDRAIL', title: '护栏指标', description: '防止自动化过头 / 漏掉关键事故；任何一项越线立即回滚。' },
};

// metricTimeline 总耗时求和（19 段检测 + 28 段回顾），靠 30 个点直接渲染。
const mttrTotal = mttrBreakdown.reduce((sum, segment) => sum + segment.minutes, 0);

// 1. MTTR 分解堆叠条：每段以「段名 + 分钟」叠成横条，颜色按 tier 区分。
const mttrOption: EChartsOption = {
  tooltip: { ...overviewTooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params) => {
    // bar 是单 series 多 data，params 可能是数组或单值；统一成数组再 map。
    const list = Array.isArray(params) ? params : [params];
    const rows = list.map((item) => `${item.marker} ${item.seriesName}：<b>${item.value}m</b>`).join('<br/>');
    const total = list.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    return `${rows}<br/>合计 <b>${total.toFixed(1)}m</b>（与北极星 MTTR 卡口径自洽）`;
  } },
  grid: { left: 70, right: 18, top: 12, bottom: 16 },
  xAxis: { type: 'value', max: mttrTotal, ...overviewAxis, axisLabel: { ...overviewAxis.axisLabel, formatter: '{value}m' } },
  yAxis: { type: 'category', data: ['MTTR 18.6m'], ...overviewAxis, axisLabel: { ...overviewAxis.axisLabel, fontSize: 11, fontWeight: 700 } },
  series: [{
    type: 'bar', stack: 'mttr', barWidth: 28,
    data: mttrBreakdown.map((segment) => segment.minutes),
    itemStyle: { color: (params) => {
      const palette = ['#175cff', '#0e9c6f', '#7c5cd6', '#e07a1f', '#d95c4a'];
      return palette[params.dataIndex % palette.length];
    }, borderColor: '#ffffff', borderWidth: 1 },
    label: {
      show: true, position: 'inside', color: '#ffffff', fontSize: 10, fontWeight: 700,
      formatter: (params) => `${mttrBreakdown[params.dataIndex].label} ${params.value}m`,
    },
  }],
};

// 2. 告警量 vs 事故量：复用 volumeSeries 风格，加事故窗口阴影（markArea）。
const alertOption: EChartsOption = {
  tooltip: { ...overviewTooltip, trigger: 'axis' },
  legend: { top: 0, right: 8, textStyle: { color: '#66738c', fontSize: 9 } },
  grid: { left: 32, right: 14, top: 26, bottom: 22 },
  xAxis: { type: 'category', data: metricTimeline.map((point) => point.time), ...overviewAxis, axisLabel: { ...overviewAxis.axisLabel, interval: 3 } },
  yAxis: [
    { type: 'value', name: '告警量', ...overviewAxis, nameTextStyle: { color: '#66738c', fontSize: 8 } },
    { type: 'value', name: '事故量', ...overviewAxis, splitLine: { show: false }, nameTextStyle: { color: '#d95c4a', fontSize: 8 } },
  ],
  series: [
    {
      name: '告警量', type: 'line', smooth: true, data: metricTimeline.map((point) => point.alertCount),
      areaStyle: { color: 'rgba(124,92,214,0.12)' }, lineStyle: { color: '#7c5cd6' }, symbol: 'none',
      // markArea 必须显式注册才能渲染：标记事故窗口 14:18–14:43。
      markArea: {
        itemStyle: { color: 'rgba(217,92,74,0.12)' },
        data: [[{ xAxis: '14:19' }, { xAxis: '14:43' }]],
      },
    },
    {
      name: '事故量', type: 'line', smooth: true, yAxisIndex: 1, data: metricTimeline.map((point) => Math.round(point.alertCount / 6)),
      lineStyle: { color: '#d95c4a', width: 2 }, symbol: 'circle', symbolSize: 4,
    },
  ],
};

// 3. 成功率 / P95 双轴 + 事故窗口 markArea：直观看到「下跌 = 事故」「回升 = 处置完成」。
const dualAxisOption: EChartsOption = {
  tooltip: { ...overviewTooltip, trigger: 'axis' },
  legend: { top: 0, right: 8, textStyle: { color: '#66738c', fontSize: 9 } },
  grid: { left: 48, right: 48, top: 26, bottom: 22 },
  xAxis: { type: 'category', data: metricTimeline.map((point) => point.time), ...overviewAxis, axisLabel: { ...overviewAxis.axisLabel, interval: 3 } },
  yAxis: [
    { type: 'value', name: '成功率 %', min: 70, max: 100, ...overviewAxis, nameTextStyle: { color: '#0e9c6f', fontSize: 8 } },
    { type: 'value', name: 'P95 ms', ...overviewAxis, splitLine: { show: false }, nameTextStyle: { color: '#d95c4a', fontSize: 8 } },
  ],
  series: [
    {
      name: '成功率', type: 'line', smooth: true, data: metricTimeline.map((point) => point.successRate),
      lineStyle: { color: '#0e9c6f', width: 2 }, symbol: 'none', areaStyle: { color: 'rgba(14,156,111,0.08)' },
      markArea: {
        itemStyle: { color: 'rgba(217,92,74,0.10)' },
        data: [[{ xAxis: '14:19' }, { xAxis: '14:43' }]],
      },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: '#d95c4a', type: 'dashed' }, data: [{ yAxis: 99.5, label: { color: '#d95c4a', fontSize: 9, formatter: '基线 99.5%' } }] },
    },
    { name: 'P95', type: 'line', smooth: true, yAxisIndex: 1, data: metricTimeline.map((point) => point.p95Ms), lineStyle: { color: '#d95c4a' }, symbol: 'none' },
  ],
};

// 原始告警流的 verdict 映射：与 .table-severity 共享配色变量。
function verdictChip(verdict: 'incident' | 'false-alarm' | 'pending') {
  if (verdict === 'incident') return <span className="table-severity tone-danger">确认事故</span>;
  if (verdict === 'false-alarm') return <span className="table-severity tone-info">误报</span>;
  return <span className="table-severity tone-warning">处理中</span>;
}

function severityTone(severity: 'P0' | 'P1' | 'P2') {
  const tone = severity === 'P0' ? 'danger' : severity === 'P1' ? 'warning' : 'info';
  return <span className={`table-severity tone-${tone}`}>{severity}</span>;
}

function KpiTile({ metric }: { metric: (typeof kpiMetrics)[number] }) {
  const toneClass = `tone-${metric.tone}`;
  const trendBars = metric.trend.map((value, index) => {
    const max = Math.max(...metric.trend);
    const min = Math.min(...metric.trend);
    const height = max === min ? 12 : Math.round(((value - min) / (max - min)) * 22) + 2;
    return <span key={index} style={{ height: `${height}px` }} />;
  });
  return (
    <article className={`metric-card ${toneClass}`}>
      <div className="metric-card-head">
        <span className="metric-delta">{metric.delta}</span>
      </div>
      <span className="metric-label">{metric.label}</span>
      <div className="metric-row">
        <strong>{metric.value}</strong>
        <span className="spark-bars">{trendBars}</span>
      </div>
      <span className="metric-helper">{metric.deltaLabel}</span>
    </article>
  );
}

export default function OverviewView() {
  const tiers: Array<NonNullable<(typeof kpiMetrics)[number]['tier']>> = ['north_star', 'primary', 'guardrail'];
  return (
    <div className="view-page overview-page">
      <ViewHeader eyebrow="OPERATIONS · NORTH STAR / PRIMARY / GUARDRAIL" title="运营总览" description="三层指标 + MTTR 分解 + 原始告警流 + 指标时序，全链路质量大盘。" />
      {tiers.map((tier) => {
        const metrics = kpiMetrics.filter((metric) => metric.tier === tier);
        if (metrics.length === 0) return null;
        const meta = tierTitle[tier];
        return (
          <section className={`overview-tier overview-tier-${tier}`} key={tier}>
            <header className="overview-tier-head"><span>{meta.eyebrow}</span><h3>{meta.title}</h3><em>{meta.description}</em></header>
            <div className="kpi-grid">
              {metrics.map((metric) => <KpiTile key={metric.id} metric={metric} />)}
            </div>
          </section>
        );
      })}

      <section className="overview-charts">
        <article className="panel overview-panel">
          <header className="panel-head"><div><span>MTTR 分解</span></div><small>合计 {mttrTotal}m · 与北极星卡口径自洽</small></header>
          <EChart option={mttrOption} summary="MTTR 各阶段耗时堆叠条" className="overview-chart-mttr" />
        </article>
        <article className="panel overview-panel">
          <header className="panel-head"><div><AlertTriangle size={14} /><span>告警量 vs 事故量</span></div><small>事故窗口 14:19–14:43（高亮）</small></header>
          <EChart option={alertOption} summary="告警量与事故量随时间变化趋势" className="overview-chart-alerts" />
        </article>
        <article className="panel overview-panel">
          <header className="panel-head"><div><Target size={14} /><span>成功率 / P95 双轴</span></div><small>基线 99.5% + 事故窗口阴影</small></header>
          <EChart option={dualAxisOption} summary="支付成功率与 P95 延迟双轴趋势" className="overview-chart-dual" />
        </article>
      </section>

      <section className="overview-alert-feed panel">
        <header className="panel-head"><div><Filter size={14} /><span>原始告警流</span></div><small>近 1 小时 · {alertFeed.length} 条</small></header>
        <table>
          <thead><tr><th>时间</th><th>事故 / 商户</th><th>等级</th><th>判定</th><th>摘要</th></tr></thead>
          <tbody>
            {alertFeed.map((row) => (
              <tr key={row.id}>
                <td>{row.time}</td>
                <td><button className="incident-row-button" type="button"><strong>{row.merchant}</strong><span>{row.id}</span></button></td>
                <td>{severityTone(row.severity)}</td>
                <td>{verdictChip(row.verdict)}</td>
                <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{row.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="overview-feed-legend"><CheckCircle2 size={11} /> 确认 = 已生成定位与触达方案；<CircleSlash size={11} /> 误报 = TN 样本回流；处理中 = 等待证据复核。</p>
      </section>
    </div>
  );
}