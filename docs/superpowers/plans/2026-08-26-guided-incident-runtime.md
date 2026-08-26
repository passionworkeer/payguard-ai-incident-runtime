# Guided Incident Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic dashboard-first experience with a presenter-led, six-step incident workflow that works locally with deterministic Mock data and can switch to an HTTP backend without changing UI components.

**Architecture:** A typed `IncidentRuntime` owns legal state transitions and stage results. `MockIncidentRuntime` returns deterministic events from one golden scenario, while `HttpIncidentRuntime` implements the same contract over fetch. The React demo controller persists only Mock runs and the guided workspace renders one stage at a time, so every click produces one auditable transition.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, Vitest, Testing Library, ECharts, native CSS.

---

## File map

- `lib/runtime/types.ts`: runtime contract, run state, stage execution and event types.
- `lib/runtime/scenario.ts`: golden P0 scenario, stage inputs, tool events and outputs.
- `lib/runtime/mock-runtime.ts`: deterministic state machine and approval behavior.
- `lib/runtime/http-runtime.ts`: fetch-based production adapter boundary.
- `lib/runtime/persistence.ts`: guarded Mock run serialization.
- `lib/runtime/evaluation.ts`: convert a completed run into evaluation metrics/sample.
- `components/demo/useIncidentDemo.ts`: async controller that connects React to a runtime.
- `components/demo/GuidedIncidentDemo.tsx`: page composition and primary action.
- `components/demo/StepRail.tsx`: six-step progress and history navigation.
- `components/demo/StageWorkspace.tsx`: current input, tool timeline, decision and output.
- `components/demo/DesignPanel.tsx`: stage gate, success metric, risk and fallback.
- `components/Dashboard.tsx`: simplified navigation and default guided-demo view.
- `app/globals.css`: guided layout, responsive behavior, focus and loading states.
- `app/layout.tsx`: replace stale generated font URLs with local/system font variables.

### Task 1: Runtime contract and legal transitions

**Files:**
- Create: `lib/runtime/types.ts`
- Create: `lib/runtime/scenario.ts`
- Create: `lib/runtime/mock-runtime.ts`
- Test: `lib/runtime/mock-runtime.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

```ts
it('executes exactly one stage per call', async () => {
  const runtime = new MockIncidentRuntime();
  const created = await runtime.createIncident('gateway-timeout');
  const verified = await runtime.executeStage(created.id, 'verify');
  expect(verified.run.currentStage).toBe('locate');
  expect(verified.run.completedStages).toEqual(['verify']);
});

it('blocks escalation until contact is approved', async () => {
  const runtime = await runtimeAtContact();
  await expect(runtime.executeStage(RUN_ID, 'escalate'))
    .rejects.toThrow('approval_required');
});

it('does not expose future stage output', async () => {
  const runtime = new MockIncidentRuntime();
  const run = await runtime.createIncident('gateway-timeout');
  expect(run.executions.locate).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- lib/runtime/mock-runtime.test.ts`

Expected: FAIL because runtime modules do not exist.

- [ ] **Step 3: Define the shared contract**

```ts
export const stageOrder = ['verify', 'locate', 'contact', 'escalate', 'recover', 'evaluate'] as const;
export type IncidentStage = (typeof stageOrder)[number];
export type RunStatus = 'idle' | 'running' | 'awaiting_approval' | 'needs_human' | 'failed' | 'completed';

export interface RuntimeEvent {
  id: string;
  type: 'stage_started' | 'tool_call_started' | 'tool_call_completed' | 'tool_call_failed' | 'decision_ready' | 'approval_required' | 'stage_completed';
  at: string;
  label: string;
  detail: string;
  durationMs?: number;
}

export interface StageExecution {
  stage: IncidentStage;
  goal: string;
  input: Record<string, unknown>;
  events: RuntimeEvent[];
  decisionFactors: Array<{ label: string; value: string; evidence: string }>;
  output: Record<string, unknown>;
  metrics: { latencyMs: number; inputTokens: number; outputTokens: number; costYuan: number; confidence: number; toolCalls: number };
  requiresApproval?: boolean;
}

export interface IncidentRun {
  id: string;
  scenarioId: string;
  status: RunStatus;
  currentStage: IncidentStage;
  completedStages: IncidentStage[];
  executions: Partial<Record<IncidentStage, StageExecution>>;
  pendingApproval?: { id: string; stage: 'contact'; label: string };
}

export interface IncidentRuntime {
  createIncident(scenarioId: string): Promise<IncidentRun>;
  executeStage(runId: string, stage: IncidentStage): Promise<{ run: IncidentRun; execution: StageExecution }>;
  approveAction(runId: string, actionId: string): Promise<IncidentRun>;
  rejectAction(runId: string, actionId: string, reason: string): Promise<IncidentRun>;
  getRun(runId: string): Promise<IncidentRun>;
  resetRun(runId: string): Promise<IncidentRun>;
}
```

- [ ] **Step 4: Add the golden scenario without future-result leakage**

Create one fixture per stage. The verify fixture contains Metrics and alert context only; locate adds Logs, Change Records and Case RAG; contact adds Merchant Profile and the message draft; escalate adds policy, ticket and on-call results; recover contains three time windows; evaluate contains the final labeled sample.

```ts
export const gatewayTimeoutScenario: RuntimeScenario = {
  id: 'gateway-timeout',
  incident: { merchant: '星海出行', severity: 'P0', impact: '¥286.4万', title: '支付接口超时率突增' },
  stages: {
    verify: verifyExecution,
    locate: locateExecution,
    contact: contactExecution,
    escalate: escalateExecution,
    recover: recoverExecution,
    evaluate: evaluateExecution,
  },
};
```

- [ ] **Step 5: Implement minimal Mock runtime**

Store runs in a `Map`, clone every returned value, validate `run.currentStage === requestedStage`, and pause after contact execution with `awaiting_approval`. `approveAction` advances to `escalate`; `rejectAction` sets `needs_human` and records the reason.

- [ ] **Step 6: Run tests and confirm GREEN**

Run: `npm test -- lib/runtime/mock-runtime.test.ts`

Expected: all runtime transition tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/runtime/types.ts lib/runtime/scenario.ts lib/runtime/mock-runtime.ts lib/runtime/mock-runtime.test.ts
git commit -m "feat(runtime): 实现六步事故处置状态机"
```

### Task 2: Persistence, HTTP adapter and evaluation output

**Files:**
- Create: `lib/runtime/persistence.ts`
- Create: `lib/runtime/http-runtime.ts`
- Create: `lib/runtime/evaluation.ts`
- Test: `lib/runtime/adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
it('restores a valid mock run and rejects corrupt storage', () => {
  const storage = memoryStorage();
  saveMockRun(storage, completedRun);
  expect(loadMockRun(storage)?.id).toBe(completedRun.id);
  storage.setItem(STORAGE_KEY, '{bad json');
  expect(loadMockRun(storage)).toBeNull();
});

it('maps an HTTP stage response to the runtime contract', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(stageResponse)));
  const runtime = new HttpIncidentRuntime('/api/incidents', fetcher);
  const result = await runtime.executeStage('run-1', 'verify');
  expect(fetcher).toHaveBeenCalledWith('/api/incidents/run-1/stages/verify', expect.objectContaining({ method: 'POST' }));
  expect(result.execution.stage).toBe('verify');
});
```

- [ ] **Step 2: Run focused test and confirm RED**

Run: `npm test -- lib/runtime/adapters.test.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement guarded Mock persistence**

Persist only `{ version: 1, run }`, validate `scenarioId`, `status`, `currentStage`, arrays and execution objects on load, and remove invalid state. HTTP runs never call this adapter.

- [ ] **Step 4: Implement HTTP Runtime**

Use injected `fetch` and one helper that throws `RuntimeRequestError` with `status`, `code` and retryability. Do not configure a real endpoint or credentials.

- [ ] **Step 5: Derive evaluation from a completed run**

```ts
export function createEvaluationSample(run: IncidentRun): EvaluationSample {
  if (run.status !== 'completed') throw new Error('run_not_completed');
  return {
    runId: run.id,
    predictedIncident: Boolean(run.executions.verify?.output.isIncident),
    predictedRootCause: String(run.executions.locate?.output.topCause),
    finalRootCause: String(run.executions.evaluate?.output.finalRootCause),
    humanCorrected: Boolean(run.executions.evaluate?.output.humanCorrected),
  };
}
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- lib/runtime/adapters.test.ts`

Expected: all adapter tests pass.

```bash
git add lib/runtime/persistence.ts lib/runtime/http-runtime.ts lib/runtime/evaluation.ts lib/runtime/adapters.test.ts
git commit -m "feat(runtime): 增加持久化与 HTTP 接口边界"
```

### Task 3: Guided demo controller and stage workspace

**Files:**
- Create: `components/demo/useIncidentDemo.ts`
- Create: `components/demo/StepRail.tsx`
- Create: `components/demo/StageWorkspace.tsx`
- Create: `components/demo/DesignPanel.tsx`
- Create: `components/demo/GuidedIncidentDemo.tsx`
- Test: `components/demo/GuidedIncidentDemo.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('advances one stage for each click', async () => {
  render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} />);
  await userEvent.click(screen.getByRole('button', { name: '开始演示：执行智能核验' }));
  expect(await screen.findByRole('heading', { name: '智能核验结果' })).toBeVisible();
  expect(screen.getByText('下一步：进入定位分析')).toBeVisible();
  expect(screen.queryByText('商户 API 网关连接池耗尽')).not.toBeInTheDocument();
});

it('requires explicit approval before escalation', async () => {
  render(<GuidedIncidentDemo runtime={await runtimeAtContact()} />);
  expect(await screen.findByRole('button', { name: '批准并发送' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /故障升级/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused test and confirm RED**

Run: `npm test -- components/demo/GuidedIncidentDemo.test.tsx`

Expected: FAIL because guided components do not exist.

- [ ] **Step 3: Implement the controller**

`useIncidentDemo` owns `run`, `selectedStage`, `busy` and `error`. It creates or restores a Mock run, executes only `run.currentStage`, persists after every successful action, exposes `approve`, `reject`, `reset`, and allows history selection only for completed stages.

- [ ] **Step 4: Implement the six-step rail**

Render status as text plus icon: `已完成`, `当前步骤`, `待执行`, `待审批`, or `需人工`. Completed stages are buttons for history inspection; future stages are disabled.

- [ ] **Step 5: Implement the current-stage workspace**

Render five stable sections: business goal, input evidence, tool timeline, decision factors, structured output. The output section is absent until that stage executes. Add summary/JSON tabs with a `<pre>` JSON alternative.

- [ ] **Step 6: Implement product controls and cumulative trace**

The primary button label is stage-specific. Show latency, Token, cost, calls, evidence and human approvals aggregated from `run.executions`. Disable controls while the runtime promise is pending.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- components/demo/GuidedIncidentDemo.test.tsx`

Expected: all guided interaction tests pass.

```bash
git add components/demo
git commit -m "feat(demo): 新增逐步讲解式事故处置台"
```

### Task 4: Replace dashboard-first information architecture

**Files:**
- Modify: `components/Dashboard.tsx`
- Modify: `components/Dashboard.navigation.test.tsx`
- Modify: `components/AnalyticsViews.tsx`
- Modify: `components/IncidentsView.tsx`

- [ ] **Step 1: Change navigation tests first**

Expect four functional items only: `处置演示`, `事故中心`, `流程分析`, `AI 评测`. Assert `数据集`, `Prompt 版本`, `系统设置` are absent. Assert the default page contains the guided demo heading and not the six-card KPI grid.

- [ ] **Step 2: Run navigation tests and confirm RED**

Run: `npm test -- components/Dashboard.navigation.test.tsx`

Expected: FAIL because old navigation and overview remain.

- [ ] **Step 3: Make guided demo the default view**

Split the current overview into a removable component only if needed for reference. Mount `<GuidedIncidentDemo runtime={runtime} />` for the default route. Keep Incident Center, Flow Analytics and AI Evaluation as secondary views.

- [ ] **Step 4: Connect incident selection and generated evaluation**

Selecting the golden incident in Incident Center returns to the guided demo and resets it to that scenario. When the run completes, pass its `EvaluationSample` into Evaluation View and render it above the static benchmark table as `本次演示样本`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- components/Dashboard.navigation.test.tsx components/Dashboard.test.tsx`

Expected: navigation and overview tests pass with the new default.

```bash
git add components/Dashboard.tsx components/Dashboard.navigation.test.tsx components/Dashboard.test.tsx components/AnalyticsViews.tsx components/IncidentsView.tsx
git commit -m "refactor(ui): 以端到端处置演示作为默认入口"
```

### Task 5: Visual hierarchy, responsive behavior and font repair

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `components/EChart.tsx`

- [ ] **Step 1: Remove generated font-path dependency**

Remove `next/font` imports and use a system stack:

```css
--font-sans: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
```

- [ ] **Step 2: Implement the presenter-first layout**

At desktop widths use `260px minmax(0, 1fr) 320px` for rail, workspace and design panel. Use a maximum content width of 1440px, 14–16px body copy, 44px controls, and remove fixed empty heights from the previous workflow panel.

- [ ] **Step 3: Add responsive rules**

At 900px collapse the design panel below the workspace. At 640px hide the sidebar by default, make the step rail horizontally scrollable, stack evidence cards, and wrap tables in labeled horizontal-scroll containers. Ensure the sidebar backdrop is rendered only when `sidebarOpen` is true.

- [ ] **Step 4: Add accessible states**

Add `:focus-visible` outlines, non-color status labels, `aria-live` for stage changes, `aria-busy` for execution and reduced-motion fallbacks.

- [ ] **Step 5: Run lint, typecheck and component tests**

Run: `npm run lint`, `npm run types:check`, `npm test -- --run`

Expected: zero errors and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx components/EChart.tsx
git commit -m "fix(ui): 优化讲解布局与响应式可用性"
```

### Task 6: Browser walkthrough, documentation and final verification

**Files:**
- Modify: `README.md`
- Create: `docs/demo-script.md`
- Test: browser walkthrough at `http://localhost:3002`

- [ ] **Step 1: Update local usage and six-click script**

Document Mock mode, the HTTP contract boundary, reset behavior, the approval gate, error scenarios and a 3–5 minute walkthrough. State clearly that all merchant and payment data is synthetic.

- [ ] **Step 2: Execute the golden path manually**

Start at idle. Click verify, locate, contact, approve, escalate, recover and evaluate. After every action assert the previous stage remains visible in history, exactly one new execution appears, cumulative metrics increase, and future outputs remain hidden.

- [ ] **Step 3: Test error paths**

Run the Mock timeout and low-confidence variants. Confirm retry, switch-to-human and reset work without losing completed Trace.

- [ ] **Step 4: Run responsive and console audit**

Capture 375×812, 768×1024 and 1280×720 screenshots. Confirm no sidebar overlay, horizontal page overflow, stale `file://` font errors, unhandled promise errors or failed resources.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test -- --run
npm run types:check
npm run lint
npm run build
npm audit --omit=dev
```

Expected: all tests pass, typecheck/lint/build exit 0, and production audit reports zero vulnerabilities. A Vinext route-classification or ECharts chunk-size warning may remain informational but must not fail the build.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/demo-script.md
git commit -m "docs: 补充端到端演示脚本与运行说明"
```
