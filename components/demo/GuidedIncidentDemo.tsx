'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StageImage } from '../../lib/runtime/llm-client';
import type { PublicLlmConfig } from '../../lib/runtime/llm-config';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import { clearMockRun } from '../../lib/runtime/persistence';
import { imageDetailLabel, imageMediaTypeError, readImageBase64 } from '../../lib/runtime/image-file';
import type { IncidentRun, IncidentRuntime, IncidentStage } from '../../lib/runtime/types';
import { DesignPanel } from './DesignPanel';
import { IncidentImageInput, type VerifyImageMeta } from './IncidentImageInput';
import { RuntimeModeSwitch, type DemoRuntimeMode } from './RuntimeModeSwitch';
import { StageWorkspace } from './StageWorkspace';
import { StepRail } from './StepRail';
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
  const [mode, setMode] = useState<DemoRuntimeMode>('mock');
  const [llmConfig, setLlmConfig] = useState<PublicLlmConfig | null>(null);
  const [verifyImage, setVerifyImage] = useState<StageImage | null>(initialLlmImage ?? null);
  const [imageMeta, setImageMeta] = useState<VerifyImageMeta | null>(initialLlmImage ? builtInImageMeta : null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageReloadKey, setImageReloadKey] = useState(0);
  const activeRuntime = mode === 'llm' && llmRuntime ? llmRuntime : ownedRuntime;
  const demo = useIncidentDemo(activeRuntime, persist);
  const run = demo.run;
  // locked 仅在“已有 run 且正在执行”时为 true，用于阻止运行模式切换按钮；初始化阶段 (run=null) 不锁。
  const locked = demo.busy && run !== null;
  // 真实模式实时等待计时：覆盖慢 / 极慢两类体感。setElapsedMs 是订阅式 interval 的「首次渲染与退出清理」，
  // 这是按区间计算时间唯一可行写法，不属于「用 effect 从 props / render 派生 state」的反模式。
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
    void llmRuntime.getPublicConfig()
      .then((config) => {
        if (active) setLlmConfig(config);
      })
      .catch(() => {
        if (active) setLlmConfig({ configured: false, provider: 'anthropic-compatible', model: '未配置', multimodal: true });
      });
    return () => {
      active = false;
    };
  }, [llmRuntime]);

  const applyImage = useCallback((image: StageImage | null, meta: VerifyImageMeta | null) => {
    setVerifyImage(image);
    setImageMeta(meta);
    if (image) llmRuntime?.setVerifyImage(image);
  }, [llmRuntime]);

  // 真实模式下按需加载内置监控截图；测试可通过 initialLlmImage 注入。
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
    // 已推进到 ≥1 步或处于人工审批 / 转人工终态时再次确认：跨模式切换会清空进度，且真实模式下的不可恢复消耗一并消失。
    const hasProgress = !!run && (run.completedStages.length > 0 || run.status === 'awaiting_approval' || run.status === 'needs_human');
    if (hasProgress && typeof window !== 'undefined' && !window.confirm(`切换运行模式将丢弃当前 ${run.completedStages.length} 步进度和${run.status === 'awaiting_approval' ? '待审批内容' : run.status === 'needs_human' ? '人工处置说明' : '当前运行'}。确认继续？`)) {
      return;
    }
    if (next === 'llm' && verifyImage) llmRuntime.setVerifyImage(verifyImage);
    if (persist && typeof window !== 'undefined') clearMockRun(window.localStorage);
    setMode(next);
  }, [llmRuntime, locked, mode, persist, run, verifyImage]);

  const showSlowHint = demo.busy && mode === 'llm' && elapsedMs > SLOW_HINT_DELAY_MS;
  const elapsedSecLabel = demo.busy && mode === 'llm' && elapsedMs > 1500 ? `${Math.floor(elapsedMs / 1000)}s` : null;

  const expectedRunMode = mode === 'llm' ? 'llm' : 'mock';
  const runMatchesMode = run?.mode === expectedRunMode;
  const showImageInput = mode === 'llm' && (!run || !runMatchesMode || run.currentStage === 'verify');

  const modeBar = llmRuntime ? (
    <section className="runtime-mode-bar" aria-label="运行模式与真实核验配置">
      <RuntimeModeSwitch mode={mode} llmReady={llmConfig?.configured ?? null} busy={locked} onSwitch={switchMode} />
      {llmConfig?.configured === false && <span className="llm-config-warning">检查 .env.local 中的 key / url / model</span>}
      {mode === 'llm' ? (
        <div className="llm-mode-banner">
          <strong className="llm-mode-flag">REAL LLM MODE</strong>
          <span className="llm-badge-multimodal">MULTIMODAL</span>
          <span className="llm-model-name">{llmConfig?.configured ? llmConfig.model : llmConfig ? '未配置' : '配置加载中…'}</span>
        </div>
      ) : (
        <span className="mock-mode-hint">Mock 数据演示，不发起真实模型调用。</span>
      )}
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
          {imageError ? (
            <>
              {' '}
              <button type="button" className="verify-image-retry" onClick={() => { setImageError(null); setImageReloadKey((k) => k + 1); }}>重新加载</button>
            </>
          ) : null}
        </span>
      ) : null}
    </section>
  ) : null;

  if (!run || !runMatchesMode) {
    return (
      <div className="guided-demo" aria-busy={demo.busy}>
        {modeBar}
        <div className="demo-loading" aria-live="polite">
          {mode === 'llm' ? '正在创建真实 LLM Run…' : '正在装载演示场景…'}
          {demo.error ? <p className="demo-loading-error">初始化失败：{demo.error}</p> : null}
          {mode === 'llm' && demo.error ? (
            <button type="button" className="secondary-button demo-loading-retry" onClick={() => switchMode('mock')} disabled={demo.busy}>切回 Mock 演示</button>
          ) : null}
        </div>
      </div>
    );
  }
  const execution = run.executions[demo.selectedStage];
  const awaitingApproval = run.status === 'awaiting_approval';
  const completed = run.status === 'completed';
  const needsHuman = run.status === 'needs_human';
  // 真实模式的智能核验必须有图：图片未就绪时禁用执行，避免必然失败的误导性 IMAGE_INVALID。
  const verifyImagePending = mode === 'llm' && run.currentStage === 'verify' && !verifyImage;

  // 真实模式的执行按钮需要在确认前提前声明剩余占用，避免长耗时里用户反复点；这是已在按钮上叠加秒级计时器的关键输入。
  const primaryActionLabel = (() => {
    if (verifyImagePending && !demo.busy) return '等待核验图片就绪…';
    if (demo.busy) return mode === 'llm' ? `真实 LLM 正在执行… ${elapsedSecLabel ?? ''}`.trim() : 'AI 正在执行…';
    return actionLabels[run.currentStage];
  })();

  return (
    <div className="guided-demo" aria-busy={demo.busy}>
      {modeBar}

      <header className="incident-hero">
        <div className="incident-identity">
          <span className="severity-mark">{run.incident.severity}</span>
          <div><span>INCIDENT · {run.id.split('-').slice(0, 2).join('-')}</span><h1>{run.incident.title}</h1></div>
        </div>
        <dl className="incident-facts">
          <div><dt>商户</dt><dd>{run.incident.merchant}</dd></div>
          <div><dt>影响金额</dt><dd>{run.incident.impact}</dd></div>
          <div><dt>发现时间</dt><dd>{run.incident.detectedAt}</dd></div>
        </dl>
        <span className="synthetic-label">全量合成演示数据</span>
      </header>

      <div className="cumulative-trace" aria-label="累计运行指标">
        <span><b>{run.completedStages.length} / 6</b>步骤</span>
        <span><b>{demo.totals.latencyMs.toLocaleString()} ms</b>AI 总耗时</span>
        <span><b>{demo.totals.tokens.toLocaleString()}</b>Token</span>
        <span><b>{mode === 'llm' ? '—' : `¥${demo.totals.costYuan.toFixed(2)}`}</b>{mode === 'llm' ? '成本未估算' : '推理成本'}</span>
        <span><b>{demo.totals.toolCalls}</b>工具调用</span>
        <span><b>{demo.totals.evidence}</b>证据项</span>
      </div>

      <div className="guided-layout">
        <StepRail run={run} selectedStage={demo.selectedStage} onSelect={demo.selectHistory} />
        <StageWorkspace run={run} stage={demo.selectedStage} execution={execution} />
        <DesignPanel execution={execution} />
      </div>

      <footer className="demo-action-bar">
        <div>
          <span>{completed ? '演示完成' : needsHuman ? '已转人工处理' : awaitingApproval ? '人工审批点' : `待执行：${actionLabels[run.currentStage].replace(/^.*：/, '')}`}</span>
          <small>
            {demo.error
              ? `执行异常：${demo.error}`
              : needsHuman
                ? (run.humanReason ?? '等待值班人员介入处置。')
                : showSlowHint
                  ? `真实 LLM 正在分析图片与证据，预计 10–25 秒，已等待 ${elapsedSecLabel}…`
                  : '一次点击只推进一个业务步骤，历史结果不会被覆盖。'}
          </small>
        </div>
        <div className="demo-actions">
          {mode === 'llm' && demo.error && (
            <button type="button" className="secondary-button" onClick={() => switchMode('mock')} disabled={demo.busy}>切回 Mock 演示</button>
          )}
          <button type="button" className="secondary-button" onClick={demo.reset} disabled={demo.busy}>重置演示</button>
          {awaitingApproval ? (
            <>
              <button type="button" className="secondary-button danger-button" onClick={demo.reject} disabled={demo.busy}>转人工处理</button>
              <button type="button" className="demo-primary-action" onClick={demo.approve} disabled={demo.busy}>批准并发送</button>
            </>
          ) : completed ? (
            <span className="complete-chip">✓ 全链路处置完成</span>
          ) : needsHuman ? (
            <span className="human-chip">⏸ 已转人工 · 流程暂停，可重置演示重新开始</span>
          ) : (
            <button
              type="button"
              className={`demo-primary-action${demo.busy ? ' is-busy' : ''}`}
              onClick={demo.execute}
              disabled={demo.busy || verifyImagePending}
              title={verifyImagePending ? '正在等待核验图片就绪' : undefined}
              aria-busy={demo.busy}
            >
              {demo.busy ? <span className="demo-spinner" aria-hidden="true" /> : null}
              {demo.error && mode === 'llm' ? `重试：${actionLabels[run.currentStage].replace(/^.*：/, '')}` : primaryActionLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
