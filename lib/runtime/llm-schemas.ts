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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1200;
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 8 && value.every(isString);
}

function pickOutput(stage: IncidentStage, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  switch (stage) {
    case 'verify':
      if (typeof value.isIncident !== 'boolean' || !['P0', 'P1', 'P2'].includes(String(value.severity)) || typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 100 || !isString(value.impactScope) || !isStrings(value.visualFindings)) return null;
      return { isIncident: value.isIncident, severity: value.severity, confidence: value.confidence, impactScope: value.impactScope, visualFindings: value.visualFindings };
    case 'locate':
      if (!isString(value.topCause) || !isStrings(value.alternatives) || !isStrings(value.evidenceRefs) || !isStrings(value.recommendedActions)) return null;
      return { topCause: value.topCause, alternatives: value.alternatives, evidenceRefs: value.evidenceRefs, recommendedActions: value.recommendedActions };
    case 'contact':
      if (!isString(value.subject) || !isString(value.message) || !isString(value.actionLinkLabel) || !isStrings(value.channels)) return null;
      return { subject: value.subject, message: value.message, actionLinkLabel: value.actionLinkLabel, channels: value.channels };
    case 'escalate':
      if (!isString(value.ticketTitle) || !isStrings(value.teams) || !isString(value.sla) || !isString(value.escalationReason) || value.simulatedAction !== true) return null;
      return { ticketTitle: value.ticketTitle, teams: value.teams, sla: value.sla, escalationReason: value.escalationReason, simulatedAction: true };
    case 'recover':
      if (typeof value.recovered !== 'boolean' || typeof value.stableWindows !== 'number' || !isString(value.residualRisk) || !isString(value.observationAdvice)) return null;
      return { recovered: value.recovered, stableWindows: value.stableWindows, residualRisk: value.residualRisk, observationAdvice: value.observationAdvice };
    case 'evaluate':
      if (!isString(value.sampleId) || !isString(value.verifyLabel) || !isString(value.predictedRootCause) || !isString(value.finalRootCause) || typeof value.humanCorrected !== 'boolean' || !isString(value.dataset) || !isStrings(value.qualityChecks)) return null;
      return { sampleId: value.sampleId, verifyLabel: value.verifyLabel, predictedRootCause: value.predictedRootCause, finalRootCause: value.finalRootCause, humanCorrected: value.humanCorrected, dataset: value.dataset, qualityChecks: value.qualityChecks };
  }
}

export interface ValidatedStageResult {
  output: Record<string, unknown>;
  decisionFactors: DecisionFactor[];
  confidence: number;
  summary: string;
}

export function validateStageToolInput(stage: IncidentStage, input: unknown): ValidatedStageResult | null {
  if (!isRecord(input) || !isString(input.summary) || typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 100 || !Array.isArray(input.decisionFactors) || input.decisionFactors.length < 1 || input.decisionFactors.length > 8) return null;
  const factors: DecisionFactor[] = [];
  for (const factor of input.decisionFactors) {
    if (!isRecord(factor) || !isString(factor.label) || !isString(factor.value) || !isString(factor.evidence)) return null;
    factors.push({ label: factor.label, value: factor.value, evidence: factor.evidence });
  }
  const output = pickOutput(stage, input.output);
  return output ? { output, decisionFactors: factors, confidence: input.confidence, summary: input.summary } : null;
}
