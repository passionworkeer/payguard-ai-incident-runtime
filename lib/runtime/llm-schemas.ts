import { stageOrder, type DecisionFactor, type IncidentStage } from './types';

type JsonSchema = Record<string, unknown> & { additionalProperties?: boolean };

const string = { type: 'string' } as const;
const number = { type: 'number' } as const;
const boolean = { type: 'boolean' } as const;
const strings = { type: 'array', items: string, maxItems: 8 } as const;

const outputSchemas: Record<IncidentStage, JsonSchema> = {
  verify: {
    type: 'object',
    properties: {
      isIncident: boolean,
      severity: { enum: ['P0', 'P1', 'P2'] },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      impactScope: string,
      visualFindings: strings,
    },
    required: ['isIncident', 'severity', 'confidence', 'impactScope', 'visualFindings'],
    additionalProperties: false,
  },
  locate: {
    type: 'object',
    properties: { topCause: string, alternatives: strings, evidenceRefs: strings, recommendedActions: strings },
    required: ['topCause', 'alternatives', 'evidenceRefs', 'recommendedActions'],
    additionalProperties: false,
  },
  contact: {
    type: 'object',
    properties: { subject: string, message: string, actionLinkLabel: string, channels: strings },
    required: ['subject', 'message', 'actionLinkLabel', 'channels'],
    additionalProperties: false,
  },
  escalate: {
    type: 'object',
    properties: { ticketTitle: string, teams: strings, sla: string, escalationReason: string, simulatedAction: { const: true } },
    required: ['ticketTitle', 'teams', 'sla', 'escalationReason', 'simulatedAction'],
    additionalProperties: false,
  },
  recover: {
    type: 'object',
    properties: { recovered: boolean, stableWindows: number, residualRisk: string, observationAdvice: string },
    required: ['recovered', 'stableWindows', 'residualRisk', 'observationAdvice'],
    additionalProperties: false,
  },
  evaluate: {
    type: 'object',
    properties: {
      sampleId: string,
      verifyLabel: string,
      predictedRootCause: string,
      finalRootCause: string,
      humanCorrected: boolean,
      dataset: string,
      qualityChecks: strings,
    },
    required: ['sampleId', 'verifyLabel', 'predictedRootCause', 'finalRootCause', 'humanCorrected', 'dataset', 'qualityChecks'],
    additionalProperties: false,
  },
};

const decisionFactorSchema = {
  type: 'object',
  properties: { label: string, value: string, evidence: string },
  required: ['label', 'value', 'evidence'],
  additionalProperties: false,
} as const;

type StageToolDefinition = {
  name: string;
  description: string;
  input_schema: JsonSchema;
};

export const stageToolDefinitions = stageOrder.reduce((definitions, stage) => {
  definitions[stage] = {
    name: `submit_${stage}_result`,
    description: `提交 ${stage} 阶段的结构化事故处置结果。`,
    input_schema: {
      type: 'object',
      properties: {
        output: outputSchemas[stage],
        decisionFactors: { type: 'array', items: decisionFactorSchema, minItems: 1, maxItems: 8 },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
        summary: string,
      },
      required: ['output', 'decisionFactors', 'confidence', 'summary'],
      additionalProperties: false,
    },
  };
  return definitions;
}, {} as Record<IncidentStage, StageToolDefinition>);

const maxStringLength = 1200;
const maxArrayItems = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// 模型对「条数/长度」约束遵循不稳定（如实测会给出 10 条决策因素），
// 数量类偏差做确定性收敛而不是整单拒绝；类型级违规仍严格拒绝。
function clampString(value: string): string {
  return value.length > maxStringLength ? value.slice(0, maxStringLength) : value;
}

function asStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) return null;
  return value.slice(0, maxArrayItems).map(clampString);
}

function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? clampString(value) : null;
}

function pickOutput(stage: IncidentStage, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  switch (stage) {
    case 'verify': {
      if (typeof value.isIncident !== 'boolean' || !['P0', 'P1', 'P2'].includes(String(value.severity)) || typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 100) return null;
      const impactScope = asString(value.impactScope);
      const visualFindings = asStrings(value.visualFindings);
      if (!impactScope || !visualFindings) return null;
      return { isIncident: value.isIncident, severity: value.severity, confidence: value.confidence, impactScope, visualFindings };
    }
    case 'locate': {
      const topCause = asString(value.topCause);
      const alternatives = asStrings(value.alternatives);
      const evidenceRefs = asStrings(value.evidenceRefs);
      const recommendedActions = asStrings(value.recommendedActions);
      if (!topCause || !alternatives || !evidenceRefs || !recommendedActions) return null;
      return { topCause, alternatives, evidenceRefs, recommendedActions };
    }
    case 'contact': {
      const subject = asString(value.subject);
      const message = asString(value.message);
      const actionLinkLabel = asString(value.actionLinkLabel);
      const channels = asStrings(value.channels);
      if (!subject || !message || !actionLinkLabel || !channels) return null;
      return { subject, message, actionLinkLabel, channels };
    }
    case 'escalate': {
      const ticketTitle = asString(value.ticketTitle);
      const teams = asStrings(value.teams);
      const sla = asString(value.sla);
      const escalationReason = asString(value.escalationReason);
      // simulatedAction 是意图声明而非业务字段；模型可能返回 true / "true" / 1，宽松归一到布尔。
      if (!ticketTitle || !teams || !sla || !escalationReason || !value.simulatedAction) return null;
      return { ticketTitle, teams, sla, escalationReason, simulatedAction: true };
    }
    case 'recover': {
      if (typeof value.recovered !== 'boolean' || typeof value.stableWindows !== 'number') return null;
      const residualRisk = asString(value.residualRisk);
      const observationAdvice = asString(value.observationAdvice);
      if (!residualRisk || !observationAdvice) return null;
      return { recovered: value.recovered, stableWindows: value.stableWindows, residualRisk, observationAdvice };
    }
    case 'evaluate': {
      if (typeof value.humanCorrected !== 'boolean') return null;
      const sampleId = asString(value.sampleId);
      const verifyLabel = asString(value.verifyLabel);
      const predictedRootCause = asString(value.predictedRootCause);
      const finalRootCause = asString(value.finalRootCause);
      const dataset = asString(value.dataset);
      const qualityChecks = asStrings(value.qualityChecks);
      if (!sampleId || !verifyLabel || !predictedRootCause || !finalRootCause || !dataset || !qualityChecks) return null;
      return { sampleId, verifyLabel, predictedRootCause, finalRootCause, humanCorrected: value.humanCorrected, dataset, qualityChecks };
    }
  }
}

export interface ValidatedStageResult {
  output: Record<string, unknown>;
  decisionFactors: DecisionFactor[];
  confidence: number;
  summary: string;
}

export function validateStageToolInput(stage: IncidentStage, input: unknown): ValidatedStageResult | null {
  if (!isRecord(input) || !isNonEmptyString(input.summary) || typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 100 || !Array.isArray(input.decisionFactors) || input.decisionFactors.length < 1) return null;
  const factors: DecisionFactor[] = [];
  for (const factor of input.decisionFactors.slice(0, maxArrayItems)) {
    const label = asString((factor as Record<string, unknown>)?.label);
    const value = asString((factor as Record<string, unknown>)?.value);
    const evidence = asString((factor as Record<string, unknown>)?.evidence);
    if (!label || !value || !evidence) return null;
    factors.push({ label, value, evidence });
  }
  const summary = clampString(input.summary);
  const output = pickOutput(stage, input.output);
  return output ? { output, decisionFactors: factors, confidence: input.confidence, summary } : null;
}
