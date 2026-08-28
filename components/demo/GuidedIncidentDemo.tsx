'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import type { StageImage } from '../../lib/runtime/llm-client';
import type { PublicLlmConfig } from '../../lib/runtime/llm-config';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import { clearMockRun } from '../../lib/runtime/persistence';
import { imageDetailLabel, imageMediaTypeError, readImageBase64 } from '../../lib/runtime/image-file';
import type { IncidentRun, IncidentRuntime, IncidentStage } from '../../lib/runtime/types';
import { IncidentImageInput, type VerifyImageMeta } from './IncidentImageInput';
import { RuntimeModeSwitch, type DemoRuntimeMode } from './RuntimeModeSwitch';
import { StageWorkspace } from './StageWorkspace';
import { StepProgress } from './StepRail';
import { useIncidentDemo } from './useIncidentDemo';

const actionLabels: Record<IncidentStage, string> = {
  verify: '开始演示：执行智能核验',
  locate: '下一步：进入定位分析',
  contact: '下一步：生成商户触达方案',
  escalate: '下一步：执行故障升级',
  recover: '下一步：判断是否恢复',
  evaluate: '最后一步：回流评测样本',
};

const builtInImageUrl = '/mock/merchant-monitor.png';
const builtInImageMeta: VerifyImageMeta = { name: '内置合成监控截图', detail: 'PNG · 合成监控面板' };

// 真实模式单步常见 8-25s：超过 6s 仍未返回就开始展示等待提示；累计等待在主操作按钮上展示以秒级计时。
const SLOW_HINT_DELAY_MS = 6000;

export interface ConfigurableLlmRuntime extends IncidentRuntime {
  getPublicConfig(): Promise<PublicLlmConfig>;
  setVerifyImage(image: StageImage): void;
}

export default function GuidedIncidentDemo({
  runtime,
  llmRuntime,
  initialLlmImage,
  persist = true,
  onRunChange,
}: {
  runtime?: IncidentRuntime;
  llmRuntime?: ConfigurableLlmRuntime;
  initialLlmImage?: StageImage;
  persist?: boolean;
  onRunChange?: (run: IncidentRun) => void;
}) {
  const [ownedRuntime] = useState(() => runtime ?? new MockIncidentRuntime());
  // 入口优先真实模型：有 llmRuntime 就默认真实模式；配置解析出「未配置」时再自动回退（见下方 config effect）。
  const [mode, setMode] = useState<DemoRuntimeMode>(llmRuntime ? 'llm' : 'mock');
  const [llmConfig, setLlmConfig] = useState<PublicLlmConfig | null>(null);
  const [verifyImage, setVerifyImage] = useState<StageImage | null>(initialLlmImage ?? null);
  const [imageMeta, setImageMeta] = useState<VerifyImageMeta | null>(initialLlmImage ? builtInImageMeta : null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageReloadKey, setImageReloadKey] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeRuntime = mode === 'llm' && llmRuntime ? llmRuntime : ownedRuntime;
  const demo = useIncidentDemo(activeRuntime, persist);
  const run = demo.run;
  const locked = demo.busy && run !== null;
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!demo.busy || mode !== 'llm') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => window.clearInterval(id);
  }, [demo.busy, mode]);

  useEffect(() => {
    if (run) onRunChange?.(run);
  }, [onRunChange, run]);

  useEffect(() => {
    if (!llmRuntime) return;
    let active = true;
    const resolve = (config: PublicLlmConfig) => {
      if (!active) return;
      setLlmConfig(config);
      // 默认真实模式但服务端未配置：静默回退示例数据（此时无人工进度可丢，不走 switchMode 的确认弹窗）。
      if (!config.configured) setMode((current) => (current === 'llm' ? 'mock' : current));
    };
    void llmRuntime
      .getPublicConfig()
      .then(resolve)
      .catch(() => resolve({ configured: false, provider: 'anthropic-compatible', model: '未配置', multimodal: true }));
    return () => {
      active = false;
    };
  }, [llmRuntime]);

  const applyImage = useCallback((image: StageImage | null, meta: VerifyImageMeta | null) => {
    setVerifyImage(image);
    setImageMeta(meta);
    if (image) llmRuntime?.setVerifyImage(image);
  }, [llmRuntime]);

  // 默认即真实模式时没有 switchMode 的时机把 initialLlmImage 推给 runtime，这里统一兜底同步。
  useEffect(() => {
    if (llmRuntime && verifyImage) llmRuntime.setVerifyImage(verifyImage);
  }, [llmRuntime, verifyImage]);

  useEffect(() => {
    if (mode !== 'llm' || !llmRuntime || verifyImage) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(builtInImageUrl);
        if (!response.ok) throw new Error('load_failed');
        const blob = await response.blob();
        const mediaType = (blob.type || 'image/png') as StageImage['mediaType'];
        const invalid = imageMediaTypeError({ type: mediaType, size: blob.size });
        if (invalid) throw new Error('load_failed');
        const data = await readImageBase64(blob);
        if (!active || !data) return;
        applyImage({ mediaType, data, source: 'built_in' }, { name: builtInImageMeta.name, detail: imageDetailLabel(mediaType, blob.size) });
        setImageError(null);
      } catch {
        if (active) setImageError('内置监控截图加载失败，可上传本地图片，或稍后重试。');
      }
    })();
    return () => {
      active = false;
    };
  }, [applyImage, imageReloadKey, llmRuntime, mode, verifyImage]);

  const switchMode = useCallback((next: DemoRuntimeMode) => {
    if (!llmRuntime || locked || next === mode) return;
    const hasProgress = !!run && (run.completedStages.length > 0 || run.status === 'awaiting_approval' || run.status === 'needs_human');
    if (hasProgress && typeof window !== 'undefined' && !window.confirm(`切换运行模式将丢弃当前 ${run.completedStages.length} 步进度和${run.status === 'awaiting_approval' ? '待审批内容' : run.status === 'needs_human' ? '人工处置说明' : '当前运行'}。确认继续？`)) {
      return;
    }
    if (next === 'llm' && verifyImage) llmRuntime.setVerifyImage(verifyImage);
    if (persist && typeof window !== 'undefined') clearMockRun(window.localStorage);
    setMode(next);
  }, [llmRuntime, locked, mode, persist, run, verifyImage]);

  // 浮层外点击关闭：避免演示中浮层挡住主步骤。
  useEffect(() => {
    if (!popoverOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  const showSlowHint = demo.busy && mode === 'llm' && elapsedMs > SLOW_HINT_DELAY_MS;
  const elapsedSecLabel = demo.busy && mode === 'llm' && elapsedMs > 1500 ? `${Math.floor(elapsedMs / 1000)}s` : null;
  const expectedRunMode = mode === 'llm' ? 'llm' : 'mock';
  const runMatchesMode = run?.mode === expectedRunMode;
  const showImageInput = mode === 'llm' && (!run || !runMatchesMode || run.currentStage === 'verify');
  // 未配置真实模型：配置解析完成后已在 effect 里自动回退，这里给出可见解释而不是只把按钮禁用。
  const unconfiguredNotice = llmRuntime && llmConfig?.configured === false ? (
    <p className="demo-fallback-notice" role="status">真实模型未配置（检查 .env.local 中的 key / url / model），已自动切换示例数据。</p>
  ) : null;

  const modeCorner = llmRuntime ? (
    <div className="demo-mode-corner" ref={popoverRef}>
      {mode === 'llm' && llmConfig?.configured ? (
        <span className="llm-mode-flag demo-mode-flag-inline">REAL LLM MODE</span>
      ) : null}
      {mode === 'llm' && llmConfig?.configured ? <span className="llm-model-name demo-mode-model-inline">{llmConfig.model}</span> : null}
      <button type="button" className="demo-mode-corner-button" aria-label="运行模式设置" aria-expanded={popoverOpen} onClick={() => setPopoverOpen((open) => !open)}>
        <Settings size={14} />
        <span>{mode === 'llm' ? '真实模型' : '示例数据'}</span>
      </button>
      {popoverOpen ? (
        <div className="demo-mode-popover">
          <RuntimeModeSwitch mode={mode} llmReady={llmConfig?.configured ?? null} busy={locked} onSwitch={switchMode} />
          {llmConfig?.configured === false ? <span className="llm-config-warning">检查 .env.local 中的 key / url / model</span> : null}
          {mode === 'llm' && llmConfig?.configured ? (
            <div className="llm-mode-banner">
              <span className="llm-badge-multimodal">MULTIMODAL</span>
              <span className="llm-model-name">{llmConfig.model}</span>
            </div>
          ) : null}
          {showImageInput && verifyImage && imageMeta ? (
            <IncidentImageInput
              image={verifyImage}
              meta={imageMeta}
              onReplace={(image, meta) => {
                setImageError(null);
                applyImage(image, meta);
              }}
              onRestore={() => applyImage(initialLlmImage ?? null, initialLlmImage ? builtInImageMeta : null)}
            />
          ) : mode === 'llm' && !verifyImage ? (
            <span className="verify-image-hint" role={imageError ? 'alert' : undefined}>
              {imageError ?? '正在加载内置监控截图…'}
              {imageError ? <button type="button" className="verify-image-retry" onClick={() => { setImageError(null); setImageReloadKey((k) => k + 1); }}>重新加载</button> : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  if (!run || !runMatchesMode) {
    return (
      <div className="guided-demo" aria-busy={demo.busy}>
        {modeCorner}
        {unconfiguredNotice}
        <div className="demo-loading" aria-live="polite">
          {mode === 'llm' ? '正在创建真实模型 Run…' : '正在装载演示场景…'}
          {demo.error ? <p className="demo-loading-error">初始化失败：{demo.error}</p> : null}
          {mode === 'llm' && demo.error ? (
            <button type="button" className="demo-cta-secondary" onClick={() => switchMode('mock')} disabled={demo.busy}>切回示例数据</button>
          ) : null}
        </div>
      </div>
    );
  }
  const execution = run.executions[demo.selectedStage];
  const awaitingApproval = run.status === 'awaiting_approval';
  const completed = run.status === 'completed';
  const needsHuman = run.status === 'needs_human';
  const verifyImagePending = mode === 'llm' && run.currentStage === 'verify' && !verifyImage;

  const primaryActionLabel = (() => {
    if (verifyImagePending && !demo.busy) return '等待核验图片就绪…';
    if (demo.busy) return mode === 'llm' ? `真实模型正在执行… ${elapsedSecLabel ?? ''}`.trim() : 'AI 正在执行…';
    return actionLabels[run.currentStage];
  })();

  return (
    <div className="guided-demo" aria-busy={demo.busy}>
      {modeCorner}

      <header className="demo-incident-summary">
        <span className="demo-severity">{run.incident.severity}</span>
        <h1 className="demo-incident-title">{run.incident.title}</h1>
        <span className="demo-incident-meta">{run.incident.merchant} · <b>{run.incident.impact}</b> · {run.incident.detectedAt}</span>
      </header>
      {unconfiguredNotice}

      <StepProgress run={run} selectedStage={demo.selectedStage} onSelect={demo.selectHistory} />

      <StageWorkspace run={run} stage={demo.selectedStage} execution={execution} />

      {(() => {
        const executedCount = Object.keys(run.executions).length;
        if (executedCount === 0) return null;
        // 真实模式由服务端跑 LLM，计费策略本期不固化（依赖 gateway 返回），用「未估算」明示，
        // mock 模式按 fixture 累加并标「（估）」，区分两条链路。空执行数直接不显示 totals。
        const costEstimated = Object.values(run.executions).some((item) => item.costEstimated);
        const isReal = Object.values(run.executions).some((item) => item.provider === 'real_llm');
        const costNode = isReal && demo.totals.costYuan === 0
          ? <span>成本 <b>未估算</b></span>
          : demo.totals.costYuan > 0
            ? <span>成本 <b>¥{demo.totals.costYuan.toFixed(2)}{costEstimated ? '（估）' : ''}</b></span>
            : null;
        return (
          <div className="demo-totals" aria-label="全链路累计指标">
            <span>已执行 <b>{executedCount}/6</b> 步</span>
            <span>总耗时 <b>{demo.totals.latencyMs >= 1000 ? `${(demo.totals.latencyMs / 1000).toFixed(1)}s` : `${demo.totals.latencyMs}ms`}</b></span>
            {demo.totals.tokens > 0 ? <span>tokens <b>{demo.totals.tokens.toLocaleString('zh-CN')}</b></span> : null}
            {costNode}
            <span>工具调用 <b>{demo.totals.toolCalls}</b> 次</span>
            <span>证据 <b>{demo.totals.evidence}</b> 条</span>
          </div>
        );
      })()}

      <div className="demo-cta-row">
        <button type="button" className="demo-cta-secondary" onClick={demo.reset} disabled={demo.busy}>重置演示</button>
        {awaitingApproval ? (
          <>
            <button type="button" className="demo-cta-secondary danger" onClick={demo.reject} disabled={demo.busy}>转人工处理</button>
            <button type="button" className="demo-cta" onClick={demo.approve} disabled={demo.busy}>批准并发送</button>
          </>
        ) : completed ? (
          <span className="complete-chip">✓ 全链路处置完成</span>
        ) : needsHuman ? (
          <span className="human-chip">已转人工处理 · 可点击重置演示重新开始</span>
        ) : (
          <button
            type="button"
            className={`demo-cta${demo.busy ? ' is-busy' : ''}`}
            onClick={demo.execute}
            disabled={demo.busy || verifyImagePending}
            aria-busy={demo.busy}
          >
            {demo.busy ? <span className="demo-spinner" aria-hidden="true" /> : null}
            {demo.error && mode === 'llm' ? `重试：${actionLabels[run.currentStage].replace(/^.*：/, '')}` : primaryActionLabel}
          </button>
        )}
        {demo.error && mode === 'llm' && !awaitingApproval ? (
          <button type="button" className="demo-cta-secondary" onClick={() => switchMode('mock')} disabled={demo.busy}>切回示例数据</button>
        ) : null}
      </div>

      {demo.error ? <p className="demo-cta-error" role="alert">执行异常：{demo.error}</p> : null}
      {showSlowHint ? <p className="demo-cta-error">真实模型正在分析图片与证据，预计 10–25 秒，已等待 {elapsedSecLabel}…</p> : null}
    </div>
  );
}