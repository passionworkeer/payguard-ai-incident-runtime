import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MockIncidentRuntime } from '../../lib/runtime/mock-runtime';
import GuidedIncidentDemo from './GuidedIncidentDemo';

describe('GuidedIncidentDemo', () => {
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
});
