'use client';

export type DemoRuntimeMode = 'mock' | 'llm';

export function RuntimeModeSwitch({
  mode,
  llmReady,
  busy,
  onSwitch,
}: {
  mode: DemoRuntimeMode;
  llmReady: boolean | null;
  busy: boolean;
  onSwitch: (mode: DemoRuntimeMode) => void;
}) {
  return (
    <div className="runtime-mode-switch" role="group" aria-label="运行模式">
      <button type="button" aria-pressed={mode === 'mock'} disabled={busy} onClick={() => onSwitch('mock')}>Mock 演示</button>
      <button
        type="button"
        aria-pressed={mode === 'llm'}
        disabled={busy || llmReady === false}
        title={llmReady === false ? '真实 LLM 未配置：检查 .env.local 中的 key / url / model' : undefined}
        onClick={() => onSwitch('llm')}
      >
        真实 LLM
      </button>
    </div>
  );
}
