# PayGuard Incident Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, interactive merchant-incident AI operations dashboard that demonstrates the complete verify-to-recovery workflow and its evaluation metrics.

**Architecture:** A standalone Vite/React SPA uses typed mock data and a deterministic incident state machine. Pure analytics functions create chart view models, ECharts renders the visualizations, and focused React components provide drill-down and simulation interactions.

**Tech Stack:** React 19, TypeScript, Vite, ECharts, Lucide React, Vitest, Testing Library, native CSS.

---

## File map

- `sites/payguard/package.json`: scripts and dependencies.
- `sites/payguard/src/domain/types.ts`: domain contracts for incidents, traces and analytics.
- `sites/payguard/src/data/mock-data.ts`: deterministic payment-monitoring dataset.
- `sites/payguard/src/domain/analytics.ts`: tested business metric calculations.
- `sites/payguard/src/domain/simulation.ts`: deterministic five-stage simulation reducer.
- `sites/payguard/src/components/`: shell, KPI, workflow, charts, tables and drawer.
- `sites/payguard/src/pages/`: four view compositions.
- `sites/payguard/src/styles/`: design tokens, layout and component styles.
- `sites/payguard/src/test/`: test setup and focused unit/component tests.

### Task 1: Scaffold the standalone dashboard

**Files:**
- Create: `sites/payguard/package.json`
- Create: `sites/payguard/index.html`
- Create: `sites/payguard/tsconfig.json`
- Create: `sites/payguard/vite.config.ts`
- Create: `sites/payguard/src/main.tsx`
- Create: `sites/payguard/src/App.tsx`
- Create: `sites/payguard/src/test/setup.ts`

- [ ] **Step 1: Create the package and configuration files**

Use scripts `dev`, `build`, `test`, `test:watch`, `lint`, and `types:check`. Configure Vitest with jsdom and `src/test/setup.ts`.

- [ ] **Step 2: Create the minimal application mount**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

- [ ] **Step 3: Install dependencies and verify the empty shell**

Run: `npm install`

Run: `npm run types:check`

Expected: TypeScript exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add sites/payguard/package.json sites/payguard/index.html sites/payguard/tsconfig.json sites/payguard/vite.config.ts sites/payguard/src
git commit -m "feat(payguard): 初始化故障处置看板工程"
```

### Task 2: Define domain data and lock metric formulas with tests

**Files:**
- Create: `sites/payguard/src/domain/types.ts`
- Create: `sites/payguard/src/domain/analytics.ts`
- Create: `sites/payguard/src/domain/analytics.test.ts`
- Create: `sites/payguard/src/data/mock-data.ts`

- [ ] **Step 1: Write failing tests for the metric formulas**

```ts
import { describe, expect, it } from 'vitest';
import { calculateClassification, calculateCtr, calculateFunnelRates } from './analytics';

describe('dashboard analytics', () => {
  it('calculates precision, recall and f1', () => {
    expect(calculateClassification({ tp: 80, fp: 20, fn: 10, tn: 90 })).toEqual({
      precision: 0.8,
      recall: 80 / 90,
      f1: 0.8421052631578948,
      accuracy: 0.85,
    });
  });

  it('calculates delivered-message click through rate', () => {
    expect(calculateCtr({ delivered: 250, clicked: 162 })).toBeCloseTo(0.648);
  });

  it('calculates conversion from the previous funnel stage', () => {
    expect(calculateFunnelRates([100, 40, 20])).toEqual([1, 0.4, 0.5]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/domain/analytics.test.ts`

Expected: FAIL because `analytics.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```ts
const safeDivide = (value: number, total: number) => total === 0 ? 0 : value / total;

export function calculateClassification({ tp, fp, fn, tn }: ConfusionMatrix) {
  const precision = safeDivide(tp, tp + fp);
  const recall = safeDivide(tp, tp + fn);
  return {
    precision,
    recall,
    f1: safeDivide(2 * precision * recall, precision + recall),
    accuracy: safeDivide(tp + tn, tp + fp + fn + tn),
  };
}
```

- [ ] **Step 4: Add typed incidents, stage traces, chart snapshots and deterministic mock data**

The data must include at least eight incidents, all five workflow stages, six tool types, three severity levels, channel touch results, time series, funnel values, Sankey links, confusion matrices and three experiment variants.

- [ ] **Step 5: Run tests and type checking**

Run: `npm test && npm run types:check`

Expected: all tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add sites/payguard/src/domain sites/payguard/src/data
git commit -m "feat(payguard): 定义事故数据与评测口径"
```

### Task 3: Build the design system and application shell

**Files:**
- Create: `sites/payguard/src/styles/index.css`
- Create: `sites/payguard/src/components/AppShell.tsx`
- Create: `sites/payguard/src/components/TopBar.tsx`
- Create: `sites/payguard/src/components/MetricCard.tsx`
- Create: `sites/payguard/src/components/SectionCard.tsx`
- Create: `sites/payguard/src/components/StatusBadge.tsx`
- Create: `sites/payguard/src/components/EmptyState.tsx`
- Create: `sites/payguard/src/components/AppShell.test.tsx`

- [ ] **Step 1: Write a failing navigation test**

```tsx
it('switches from overview to flow analytics', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: '流程分析' }));
  expect(screen.getByRole('heading', { name: '全链路处置分析' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/components/AppShell.test.tsx`

Expected: FAIL because navigation is not implemented.

- [ ] **Step 3: Implement shell navigation and design tokens**

Define CSS variables for background, panel, border, primary cyan, warning amber, danger coral, text levels, radii and shadows. Build a fixed side navigation, compact top bar and responsive content container.

- [ ] **Step 4: Add accessible card primitives and pass the test**

Run: `npm test -- src/components/AppShell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sites/payguard/src/App.tsx sites/payguard/src/components sites/payguard/src/styles
git commit -m "feat(payguard): 搭建运营驾驶舱设计系统"
```

### Task 4: Implement the overview and incident simulation

**Files:**
- Create: `sites/payguard/src/domain/simulation.ts`
- Create: `sites/payguard/src/domain/simulation.test.ts`
- Create: `sites/payguard/src/pages/OverviewPage.tsx`
- Create: `sites/payguard/src/components/WorkflowBoard.tsx`
- Create: `sites/payguard/src/components/IncidentSpotlight.tsx`
- Create: `sites/payguard/src/components/StageTraceCard.tsx`

- [ ] **Step 1: Write reducer tests for five-stage progression**

```ts
it('advances a simulated incident through the ordered stages', () => {
  let state = createSimulationState();
  state = simulationReducer(state, { type: 'START' });
  expect(state.activeStage).toBe('verify');
  state = simulationReducer(state, { type: 'ADVANCE' });
  expect(state.activeStage).toBe('locate');
});
```

- [ ] **Step 2: Run the reducer test and verify failure**

Run: `npm test -- src/domain/simulation.test.ts`

Expected: FAIL because the reducer is missing.

- [ ] **Step 3: Implement deterministic progression**

The reducer owns `idle`, `running`, `paused_for_review`, and `completed` modes. `ADVANCE` follows `verify → locate → contact → escalate → recover`; contact pauses for local approval before advancing.

- [ ] **Step 4: Build overview KPI cards, stage workflow and live incident panel**

Render six KPIs, one compact trend chart, the five-stage workflow, stage-level latency/token/cost/confidence values, and the priority incident table.

- [ ] **Step 5: Verify tests and commit**

Run: `npm test && npm run types:check`

```bash
git add sites/payguard/src/domain/simulation* sites/payguard/src/pages/OverviewPage.tsx sites/payguard/src/components
git commit -m "feat(payguard): 实现五阶段故障模拟流程"
```

### Task 5: Add the analysis and evaluation visualizations

**Files:**
- Create: `sites/payguard/src/components/Chart.tsx`
- Create: `sites/payguard/src/components/charts/FunnelChart.tsx`
- Create: `sites/payguard/src/components/charts/SankeyChart.tsx`
- Create: `sites/payguard/src/components/charts/LatencyChart.tsx`
- Create: `sites/payguard/src/components/charts/ToolUsageChart.tsx`
- Create: `sites/payguard/src/components/charts/ConfusionMatrix.tsx`
- Create: `sites/payguard/src/components/charts/ExperimentChart.tsx`
- Create: `sites/payguard/src/pages/FlowAnalyticsPage.tsx`
- Create: `sites/payguard/src/pages/EvaluationPage.tsx`

- [ ] **Step 1: Implement a reusable ECharts wrapper**

The wrapper must initialize once, resize through `ResizeObserver`, update options without recreating the chart, expose click callbacks and show an accessible text summary next to the canvas.

- [ ] **Step 2: Implement the funnel and Sankey interaction**

Clicking a Sankey node updates the active filter label and the summary card. The funnel shows absolute values and previous-stage conversion percentages.

- [ ] **Step 3: Implement latency, tool usage and channel engagement charts**

Show stage P50/P95/SLA, tool call volume/success/contribution and message delivered/open/click/reply conversion.

- [ ] **Step 4: Implement evaluation charts**

Show the confusion matrix, P0/P1/P2 recall with targets, experiment comparison and Bad Case table. Label every chart with its unit, date range and metric definition.

- [ ] **Step 5: Run type checks and production build**

Run: `npm run types:check && npm run build`

Expected: both commands exit with code 0.

- [ ] **Step 6: Commit**

```bash
git add sites/payguard/src/components/charts sites/payguard/src/components/Chart.tsx sites/payguard/src/pages
git commit -m "feat(payguard): 完成流程与智能化评测图表"
```

### Task 6: Build the incident center and trace drawer

**Files:**
- Create: `sites/payguard/src/pages/IncidentsPage.tsx`
- Create: `sites/payguard/src/components/IncidentTable.tsx`
- Create: `sites/payguard/src/components/IncidentDrawer.tsx`
- Create: `sites/payguard/src/components/TraceTimeline.tsx`
- Create: `sites/payguard/src/components/EvidencePanel.tsx`
- Create: `sites/payguard/src/components/IncidentDrawer.test.tsx`

- [ ] **Step 1: Write a failing drill-down test**

```tsx
it('opens an incident and exposes trace evidence', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: '事故中心' }));
  await userEvent.click(screen.getByRole('button', { name: /INC-20260825-031/ }));
  expect(screen.getByRole('dialog', { name: '事故详情' })).toBeVisible();
  expect(screen.getByText('TIMEOUT 错误码增加 23.4 倍')).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/components/IncidentDrawer.test.tsx`

Expected: FAIL because the table and dialog are missing.

- [ ] **Step 3: Implement filters, table and accessible drawer**

Provide severity, stage and merchant filters. The drawer uses `role="dialog"`, closes on Escape, traps focus, restores focus to the selected row, and exposes the five trace stages.

- [ ] **Step 4: Add evidence and local approval actions**

Render metric/log/case evidence, structured root cause, merchant message preview, “批准发送” and “人工接管”. Clearly mark actions as simulations.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run types:check`

```bash
git add sites/payguard/src/pages/IncidentsPage.tsx sites/payguard/src/components
git commit -m "feat(payguard): 增加事故下钻与证据链"
```

### Task 7: Browser QA and handoff documentation

**Files:**
- Create: `sites/payguard/README.md`
- Modify: `sites/payguard/src/styles/index.css`

- [ ] **Step 1: Run the full automated verification**

Run: `npm test && npm run types:check && npm run build`

Expected: all commands exit with code 0.

- [ ] **Step 2: Run browser checks at 1440×900 and 1280×720**

Verify all four views, one complete simulation, drawer keyboard behavior, Sankey filtering, no horizontal overflow, no console errors and readable chart labels.

- [ ] **Step 3: Fix only observed presentation and accessibility defects**

Do not add new features. Keep changes limited to layout, contrast, keyboard focus, clipping and empty states found during QA.

- [ ] **Step 4: Write the README**

Document install/run commands, the 3–5 minute interview demo script, metric definitions, synthetic-data disclaimer and future backend integration points.

- [ ] **Step 5: Final verification and commit**

Run: `npm test && npm run types:check && npm run build`

```bash
git add sites/payguard
git commit -m "docs(payguard): 补充演示脚本与验收说明"
```
