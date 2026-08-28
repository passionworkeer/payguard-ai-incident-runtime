'use client';

import { runtimeScenarios, scenarioOrder } from '../../lib/runtime/scenarios';

const shortLabels: Record<string, string> = {
  'gateway-timeout': '网关超时',
  'false-alarm': '误报收敛',
  'merchant-cert': '商户证书',
  'channel-rebound': '渠道回弹',
};

// 演示场景切换器：放在事故摘要与进度条之间，让招聘方/PM 一次看到 4 个分支。
// 切换会触发父级确认（防止误丢当前进度），并通过 onChange 把 scenarioId 传给 GuidedIncidentDemo。
export function ScenarioPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (scenarioId: string) => void;
}) {
  return (
    <div className="scenario-picker" role="group" aria-label="演示场景切换">
      <span className="scenario-picker-label">演示场景</span>
      <div className="runtime-mode-switch scenario-picker-buttons">
        {scenarioOrder.map((id) => {
          const scenario = runtimeScenarios[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={value === id}
              onClick={() => onChange(id)}
              title={scenario.summary}
            >
              {shortLabels[id] ?? scenario.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}