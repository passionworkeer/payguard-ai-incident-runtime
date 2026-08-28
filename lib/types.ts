import type { IncidentStage } from './simulation';

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'violet';

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaLabel: string;
  tone: Tone;
  trend: number[];
}

export interface StageMetric {
  key: IncidentStage;
  label: string;
  shortLabel: string;
  queue: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  humanRate: number;
  toolCalls: number;
  tokens: number;
  costYuan: number;
  confidence: number;
  description: string;
}

export interface IncidentSummary {
  id: string;
  merchant: string;
  title: string;
  severity: 'P0' | 'P1' | 'P2';
  stage: IncidentStage;
  impact: string;
  startedAt: string;
  duration: string;
  confidence: number;
  // 对应演示场景：事故中心「进入处置演示」按行跳转到对应链路。
  scenarioId: string;
}
