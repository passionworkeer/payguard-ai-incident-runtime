import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import type { PublicLlmConfig } from '../../lib/runtime/llm-config';
import type { IncidentRun, IncidentStage } from '../../lib/runtime/types';
import type { ConfigurableLlmRuntime } from './GuidedIncidentDemo';
import { saveMockRun } from '../../lib/runtime/persistence';
import GuidedIncidentDemo from './GuidedIncidentDemo';

describe('GuidedIncidentDemo', () => {
  class FakeLlmRuntime extends MockIncidentRuntime implements ConfigurableLlmRuntime {
    executeFailures = 0;

    async getPublicConfig(): Promise<PublicLlmConfig> {
      return { configured: true, provider: 'anthropic-compatible', model: 'evidence-model' };
    }

    override async createIncident(scenarioId: string): Promise<IncidentRun> {
      return { ...(await super.createIncident(scenarioId)), mode: 'llm' };
    }

    override async executeStage(runId: string, stage: IncidentStage) {
      if (this.executeFailures > 0) {
        this.executeFailures -= 1;
        throw new Error('真实模型上游暂不可用。');
      }
      const result = await super.executeStage(runId, stage);
      const execution = { ...result.execution, provider: 'real_llm' as const, model: 'evidence-model' };
      const run: IncidentRun = { ...result.run, mode: 'llm', executions: { ...result.run.executions, [stage]: execution } };
      return { run, execution };
    }
  }

  function renderDemo(overrides: { llmRuntime?: FakeLlmRuntime } = {}) {
    const llmRuntime = overrides.llmRuntime ?? new FakeLlmRuntime();
    const view = render(
      <GuidedIncidentDemo
        runtime={new MockIncidentRuntime()}
        llmRuntime={llmRuntime}
        persist={false}
      />,
    );
    return { llmRuntime, view };
  }

  async function openSettings(user: ReturnType<typeof userEvent.setup>) {
    // 真实模式入口在右上角「运行模式设置」浮层里：先开浮层再操作模式开关。
    await user.click(await screen.findByRole('button', { name: '运行模式设置' }));
  }

  it('advances exactly one stage for each click and hides future output', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(
      await screen.findByRole('button', { name: '开始演示：执行智能核验' }),
    );

    expect(await screen.findByRole('heading', { name: '智能核验结果' })).toBeVisible();
    expect(screen.getByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
    expect(screen.queryByText('商户 API 网关连接池耗尽')).not.toBeInTheDocument();
  });

  it('requires explicit approval before escalation', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));
    await user.click(await screen.findByRole('button', { name: '下一步：进入定位分析' }));
    await user.click(await screen.findByRole('button', { name: '下一步：生成商户触达方案' }));

    expect(await screen.findByRole('button', { name: '批准并发送' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /执行故障升级/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '批准并发送' }));
    expect(await screen.findByRole('button', { name: '下一步：执行故障升级' })).toBeVisible();
  });

  it('shows a terminal human-handling state after rejecting outreach and can restart', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));
    await user.click(await screen.findByRole('button', { name: '下一步：进入定位分析' }));
    await user.click(await screen.getByRole('button', { name: '下一步：生成商户触达方案' }));
    await user.click(screen.getByRole('button', { name: '转人工处理' }));

    // 终态可见：状态文本、步骤轨、人工处理 chip；主执行按钮不再出现。
    expect(await screen.findByText(/已转人工处理/)).toBeVisible();
    expect(screen.getByRole('button', { name: '商户触达，已转人工' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /下一步|批准并发送|转人工处理/ })).not.toBeInTheDocument();

    // 重置后回到第一步，可重新开始完整演示。
    await user.click(screen.getByRole('button', { name: '重置演示' }));
    expect(await screen.findByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();
    expect(screen.queryByText(/已转人工/)).not.toBeInTheDocument();
  });

  it('surfaces LLM initialization failures with a path back to Mock', async () => {
    class CreateFailsRuntime extends FakeLlmRuntime {
      override async createIncident(): Promise<IncidentRun> {
        throw new Error('真实模型网络请求失败。');
      }
    }
    const user = userEvent.setup();
    renderDemo({ llmRuntime: new CreateFailsRuntime() });

    // 默认即真实模型：挂载后直接初始化，无需手动切换即触发失败路径。
    expect(await screen.findByText(/初始化失败：真实模型网络请求失败。/)).toBeVisible();
    const backToMock = await screen.findByRole('button', { name: '切回示例数据' });
    await user.click(backToMock);

    expect(await screen.findByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();
    expect(screen.queryByText(/初始化失败/)).not.toBeInTheDocument();
  });

  it('can inspect completed history without advancing the run', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));
    await user.click(await screen.getByRole('button', { name: '下一步：进入定位分析' }));
    await user.click(screen.getByRole('button', { name: /智能核验，已完成/ }));

    expect(screen.getByRole('heading', { name: '智能核验结果' })).toBeVisible();
  });

  it('rehydrates the saved mock run after a page refresh', async () => {
    localStorage.clear();
    const previousRuntime = new MockIncidentRuntime();
    const created = await previousRuntime.createIncident('gateway-timeout');
    const verified = await previousRuntime.executeStage(created.id, 'verify');
    saveMockRun(localStorage, verified.run);

    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} />);

    expect(await screen.findByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
    localStorage.clear();
  });

  it('defaults to real LLM mode when configured and can switch to sample data', async () => {
    const user = userEvent.setup();
    renderDemo();

    // 入口默认真实模型：REAL LLM MODE 角标可见，浮层里 EVIDENCE LLM 徽标同时露出。
    expect(await screen.findByText('REAL LLM MODE')).toBeVisible();
    await openSettings(user);
    expect(await screen.findByText('EVIDENCE LLM')).toBeVisible();
    expect(screen.getAllByText('evidence-model').length).toBeGreaterThan(0);

    // 无进度时一键切回示例数据，无需确认弹窗。
    await user.click(screen.getByRole('button', { name: '示例数据' }));
    expect(await screen.findByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();
    expect(screen.queryByText('REAL LLM MODE')).not.toBeInTheDocument();
  });

  it('disables the real LLM entry before configuration and falls back to sample data', async () => {
    class UnconfiguredRuntime extends FakeLlmRuntime {
      override async getPublicConfig(): Promise<PublicLlmConfig> {
        return { configured: false, provider: 'anthropic-compatible', model: '未配置' };
      }
    }
    const user = userEvent.setup();
    renderDemo({ llmRuntime: new UnconfiguredRuntime() });

    // 未配置：自动回退示例数据并给出可见提示，演示仍可用。
    // 提示节点会随 loading ↔ 主分支切换被替换，用 waitFor 轮询重新查询而不是持有旧节点。
    await waitFor(() => {
      expect(screen.getByText(/已自动切换示例数据/)).toBeVisible();
    });
    expect(await screen.findByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();

    // 浮层打开后真实模型按钮被禁用并提示未配置
    await user.click(screen.getByRole('button', { name: '运行模式设置' }));
    expect(screen.getByRole('button', { name: '真实模型' })).toBeDisabled();
    expect(screen.getByText('检查 .env.local 中的 key / url / model')).toBeVisible();
  });

  it('keeps the current step after a real failure and can switch back to Mock', async () => {
    const user = userEvent.setup();
    const llmRuntime = new FakeLlmRuntime();
    llmRuntime.executeFailures = 1;
    renderDemo({ llmRuntime });

    // 默认真实模型，直接执行第一步触发真实失败。
    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));

    expect(await screen.findByText('执行异常：真实模型上游暂不可用。')).toBeVisible();
    expect(screen.getByRole('button', { name: '重试：执行智能核验' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '切回示例数据' }));

    expect(await screen.findByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();
    expect(screen.queryByText(/执行异常/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '开始演示：执行智能核验' }));
    expect(await screen.findByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
  });

  it('marks real stages with provider badges and still hides future output', async () => {
    const user = userEvent.setup();
    renderDemo();

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));

    expect(await screen.findByText('REAL LLM MODE')).toBeVisible();
    expect(screen.getAllByText('evidence-model').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
    expect(screen.queryByText('定位分析结果')).toBeNull();
  });

  it('renders multi-source tool calls instead of an image in verify stage', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));

    // 核验阶段固定产出 4 个内部接口工具调用卡片（Metrics / Alerts / Logs / Change Records），
    // 旧的多模态截图入口已下线，确保 UI 不再回退到图像路线。
    expect(screen.getAllByText(/metrics\.query|alerts\.context_fetch|logs\.search|change_records\.list/).length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/替换核验图片|内置合成监控截图|merchant-monitor/)).toBeNull();
  });
});