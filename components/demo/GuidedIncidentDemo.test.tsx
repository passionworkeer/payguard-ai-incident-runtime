import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import type { StageImage } from '../../lib/runtime/llm-client';
import type { PublicLlmConfig } from '../../lib/runtime/llm-config';
import type { IncidentRun, IncidentStage } from '../../lib/runtime/types';
import type { ConfigurableLlmRuntime } from './GuidedIncidentDemo';
import { saveMockRun } from '../../lib/runtime/persistence';
import GuidedIncidentDemo from './GuidedIncidentDemo';

const builtInImage: StageImage = { mediaType: 'image/png', data: 'iVBORw0KGgo=', source: 'built_in' };

describe('GuidedIncidentDemo', () => {
  class FakeLlmRuntime extends MockIncidentRuntime implements ConfigurableLlmRuntime {
    image?: StageImage;
    executeFailures = 0;

    async getPublicConfig(): Promise<PublicLlmConfig> {
      return { configured: true, provider: 'anthropic-compatible', model: 'multimodal-model', multimodal: true };
    }

    setVerifyImage(image: StageImage) {
      this.image = image;
    }

    override async createIncident(scenarioId: string): Promise<IncidentRun> {
      return { ...(await super.createIncident(scenarioId)), mode: 'llm' };
    }

    override async executeStage(runId: string, stage: IncidentStage) {
      if (this.executeFailures > 0) {
        this.executeFailures -= 1;
        throw new Error('真实 LLM 上游暂不可用。');
      }
      const result = await super.executeStage(runId, stage);
      const execution = {
        ...result.execution,
        provider: 'real_llm' as const,
        model: 'multimodal-model',
        imageSource: stage === 'verify' ? ('built_in' as const) : undefined,
      };
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
        initialLlmImage={builtInImage}
        persist={false}
      />,
    );
    return { llmRuntime, view };
  }

  async function switchToLlm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: '真实 LLM' }));
    expect(await screen.findByText('REAL LLM MODE')).toBeVisible();
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
    expect(screen.getByText('1 / 6 步已执行')).toBeVisible();
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

  it('can inspect completed history without advancing the run', async () => {
    const user = userEvent.setup();
    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} persist={false} />);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));
    await user.click(await screen.findByRole('button', { name: '下一步：进入定位分析' }));
    await user.click(screen.getByRole('button', { name: /智能核验，已完成/ }));

    expect(screen.getByRole('heading', { name: '智能核验结果' })).toBeVisible();
    expect(screen.getByText('2 / 6 步已执行')).toBeVisible();
  });

  it('rehydrates the saved mock run after a page refresh', async () => {
    localStorage.clear();
    const previousRuntime = new MockIncidentRuntime();
    const created = await previousRuntime.createIncident('gateway-timeout');
    const verified = await previousRuntime.executeStage(created.id, 'verify');
    saveMockRun(localStorage, verified.run);

    render(<GuidedIncidentDemo runtime={new MockIncidentRuntime()} />);

    expect(await screen.findByText('1 / 6 步已执行')).toBeVisible();
    expect(screen.getByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
    localStorage.clear();
  });

  it('keeps Mock as default and can switch to configured real LLM mode', async () => {
    const user = userEvent.setup();
    const { llmRuntime } = renderDemo();

    expect(await screen.findByRole('button', { name: 'Mock 演示' })).toHaveAttribute('aria-pressed', 'true');
    await switchToLlm(user);

    expect(screen.getByText('multimodal-model')).toBeVisible();
    expect(screen.getByText('内置合成监控截图')).toBeVisible();
    expect(llmRuntime.image).toMatchObject({ source: 'built_in', data: 'iVBORw0KGgo=' });
  });

  it('accepts an uploaded image for real multimodal verification', async () => {
    const user = userEvent.setup();
    const { llmRuntime } = renderDemo();
    await switchToLlm(user);
    const file = new File(['image-bytes'], 'merchant-monitor.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('替换核验图片'), file);

    expect(await screen.findByText('merchant-monitor.png')).toBeVisible();
    expect(llmRuntime.image).toMatchObject({ mediaType: 'image/png', source: 'uploaded' });
  });

  it('restores the built-in image after replacing it with an upload', async () => {
    const user = userEvent.setup();
    const { llmRuntime } = renderDemo();
    await switchToLlm(user);
    await user.upload(screen.getByLabelText('替换核验图片'), new File(['image-bytes'], 'custom.png', { type: 'image/png' }));
    expect(await screen.findByText('custom.png')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '恢复内置截图' }));

    expect(await screen.findByText('内置合成监控截图')).toBeVisible();
    expect(llmRuntime.image).toMatchObject({ source: 'built_in', data: 'iVBORw0KGgo=' });
  });

  it('disables the real LLM entry before configuration', async () => {
    class UnconfiguredRuntime extends FakeLlmRuntime {
      override async getPublicConfig(): Promise<PublicLlmConfig> {
        return { configured: false, provider: 'anthropic-compatible', model: '未配置', multimodal: true };
      }
    }
    renderDemo({ llmRuntime: new UnconfiguredRuntime() });

    expect(await screen.findByRole('button', { name: '真实 LLM' })).toBeDisabled();
    expect(screen.getByText('检查 .env.local 中的 key / url / model')).toBeVisible();
  });

  it('keeps the current step after a real failure and can switch back to Mock', async () => {
    const user = userEvent.setup();
    const llmRuntime = new FakeLlmRuntime();
    llmRuntime.executeFailures = 1;
    renderDemo({ llmRuntime });
    await switchToLlm(user);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));

    expect(await screen.findByText('执行异常：真实 LLM 上游暂不可用。')).toBeVisible();
    expect(screen.getByRole('button', { name: '开始演示：执行智能核验' })).toBeVisible();

    await user.click(await screen.findByRole('button', { name: '切回 Mock 演示' }));

    expect(await screen.findByRole('button', { name: 'Mock 演示' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/执行异常/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '开始演示：执行智能核验' }));
    expect(await screen.findByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
  });

  it('marks real stages with provider badges and still hides future output', async () => {
    const user = userEvent.setup();
    renderDemo();
    await switchToLlm(user);

    await user.click(await screen.findByRole('button', { name: '开始演示：执行智能核验' }));

    expect(await screen.findByText('REAL LLM')).toBeVisible();
    expect(screen.getByText('图片来源：内置截图')).toBeVisible();
    expect(screen.getAllByText('multimodal-model').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: '下一步：进入定位分析' })).toBeVisible();
    expect(screen.queryByText('定位分析结果')).toBeNull();
  });
});
