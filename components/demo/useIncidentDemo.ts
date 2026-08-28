'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearMockRun, loadMockRun, saveMockRun } from '../../lib/runtime/persistence';
import type { IncidentRun, IncidentRuntime, IncidentStage } from '../../lib/runtime/types';

export function useIncidentDemo(runtime: IncidentRuntime, persist = true, scenarioId: string = 'gateway-timeout') {
  const [run, setRun] = useState<IncidentRun | null>(null);
  const [selectedStage, setSelectedStage] = useState<IncidentStage>('verify');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const store = useCallback(
    (next: IncidentRun) => {
      setRun(next);
      // 仅持久化 Mock 进度（README 承诺范围）；LLM run 不写入，避免「写入后被读取侧
      // 拒收并静默删除」的读写不对称。saveMockRun 内部自带配额/禁用兜底，不会抛错。
      if (persist && next.mode === 'mock' && typeof window !== 'undefined') saveMockRun(window.localStorage, next);
    },
    [persist],
  );

  useEffect(() => {
    let active = true;
    async function initialize() {
      setBusy(true);
      setError(null);
      try {
        // localStorage 属性访问本身在「阻止所有 Cookie」等环境下会抛 SecurityError，
        // 读取失败时降级为全新 run，而不是把初始化错误卡在加载态。
        let restored: IncidentRun | null = null;
        if (persist && typeof window !== 'undefined') {
          try {
            restored = loadMockRun(window.localStorage);
          } catch {
            restored = null;
          }
        }
        const initial = restored && restored.scenarioId === scenarioId
          ? runtime.restoreRun?.(restored) ?? await runtime.getRun(restored.id).catch(() => runtime.createIncident(scenarioId))
          : await runtime.createIncident(scenarioId);
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
  }, [persist, runtime, store, scenarioId]);

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
    // 用 attempts 流水而不仅仅是 executions：恢复重入会执行多次 recover，
    // 若只看 executions 会低估 token / 工具调用次数，metrics 面板失真。
    const executions = run ? (run.attempts && run.attempts.length > 0 ? run.attempts : Object.values(run.executions)) : [];
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
