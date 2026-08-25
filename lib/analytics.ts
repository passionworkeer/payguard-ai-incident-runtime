export interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

interface Engagement {
  delivered: number;
  clicked: number;
}

interface StageWindow {
  startedAt: string;
  completedAt?: string;
}

const safeDivide = (value: number, total: number) =>
  total === 0 ? 0 : value / total;

export function calculateClassification({
  tp,
  fp,
  fn,
  tn,
}: ConfusionMatrix) {
  const precision = safeDivide(tp, tp + fp);
  const recall = safeDivide(tp, tp + fn);

  return {
    precision,
    recall,
    f1: safeDivide(2 * precision * recall, precision + recall),
    accuracy: safeDivide(tp + tn, tp + fp + fn + tn),
  };
}

export function calculateCtr({ delivered, clicked }: Engagement) {
  return safeDivide(clicked, delivered);
}

export function calculateFunnelRates(values: number[]) {
  return values.map((value, index) =>
    index === 0 ? 1 : safeDivide(value, values[index - 1]),
  );
}

export function calculateStageDuration({
  startedAt,
  completedAt,
}: StageWindow) {
  if (!completedAt) return 0;
  return new Date(completedAt).getTime() - new Date(startedAt).getTime();
}
