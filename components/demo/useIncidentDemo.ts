'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearMockRun, loadMockRun, saveMockRun } from '../../lib/runtime/persistence';
import type { IncidentRun, IncidentRuntime, IncidentStage } from '../../lib/runtime/types';

export function useIncidentDemo(runtime: IncidentRuntime, persist = true) {
  const [run, setRun] = useState<IncidentRun | null>(null);
  const [selectedStage, setSelectedStage] = useState<IncidentStage>('verify');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const store = useCallback(
    (next: IncidentRun) => {
      setRun(next);
      if (persist && typeof window !== 'undefined') saveMockRun(window.localStorage, next);
    },
    [persist],
  );

  useEffect(() => {
    let active = true;
    async function initialize() {
      setBusy(true);
      try {
        const restored = persist && typeof window !== 'undefined'
          ? loadMockRun(window.localStorage)
          : null;
        const initial = restored
          ? runtime.restoreRun?.(restored) ?? await runtime.getRun(restored.id).catch(() => runtime.createIncident('gateway-timeout'))
          : await runtime.createIncident('gateway-timeout');
        if (active) {
          store(initial);
          setSelectedStage(initial.currentStage);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : '初始化失败');
      } finally {
        if (active) setBusy(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [persist, runtime, store]);

  const execute = useCallback(async () => {
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.executeStage(run.id, run.currentStage);
      store(result.run);
      setSelectedStage(result.execution.stage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '执行失败');
    } finally {
      setBusy(false);
    }
  }, [busy, run, runtime, store]);

  const approve = useCallback(async () => {
    if (!run?.pendingApproval || busy) return;
    setBusy(true);
    setError(null);
    try {
      store(await runtime.approveAction(run.id, run.pendingApproval.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '审批失败');
    } finally {
      setBusy(false);
    }
  }, [busy, run, runtime, store]);

  const reject = useCallback(async () => {
    if (!run?.pendingApproval || busy) return;
    setBusy(true);
    setError(null);
    try {
      store(await runtime.rejectAction(run.id, run.pendingApproval.id, '转人工复核触达内容'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '转人工失败');
    } finally {
      setBusy(false);
    }
  }, [busy, run, runtime, store]);

  const reset = useCallback(async () => {
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (persist && typeof window !== 'undefined') clearMockRun(window.localStorage);
      const next = await runtime.resetRun(run.id);
      store(next);
      setSelectedStage('verify');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重置失败');
    } finally {
      setBusy(false);
    }
  }, [busy, persist, run, runtime, store]);

  const selectHistory = useCallback(
    (stage: IncidentStage) => {
      if (run?.executions[stage]) setSelectedStage(stage);
    },
    [run],
  );

  const totals = useMemo(() => {
    const executions = run ? Object.values(run.executions) : [];
    return executions.reduce(
      (sum, execution) => ({
        latencyMs: sum.latencyMs + execution.metrics.latencyMs,
        tokens: sum.tokens + execution.metrics.inputTokens + execution.metrics.outputTokens,
        costYuan: sum.costYuan + execution.metrics.costYuan,
        toolCalls: sum.toolCalls + execution.metrics.toolCalls,
        evidence: sum.evidence + execution.metrics.evidenceCount,
      }),
      { latencyMs: 0, tokens: 0, costYuan: 0, toolCalls: 0, evidence: 0 },
    );
  }, [run]);

  return { run, selectedStage, busy, error, totals, execute, approve, reject, reset, selectHistory };
}
