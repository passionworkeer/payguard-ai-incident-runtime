'use client';

import type { EChartsOption } from 'echarts';
import { BarChart, FunnelChart, LineChart, SankeyChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use as registerECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

registerECharts([
  BarChart,
  FunnelChart,
  LineChart,
  SankeyChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsOption;
  summary: string;
  className?: string;
  onSelect?: (name: string) => void;
}

export default function EChart({ option, summary, className = '', onSelect }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const chart = init(containerRef.current, undefined, { renderer: 'canvas' });
    chart.setOption(option);
    const handleClick = (params: { name?: string }) => {
      if (params.name) onSelect?.(params.name);
    };
    chart.on('click', handleClick);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.off('click', handleClick);
      chart.dispose();
    };
  }, [onSelect, option]);

  return (
    <div className={`echart-shell ${className}`}>
      <div className="echart-canvas" ref={containerRef} aria-hidden="true" />
      <p className="sr-only">{summary}</p>
    </div>
  );
}
