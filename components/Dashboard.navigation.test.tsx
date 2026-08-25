import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('dashboard navigation', () => {
  it('opens the flow analytics workspace', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: '流程分析' }));
    expect(await screen.findByRole('heading', { name: '全链路处置分析' })).toBeVisible();
  });

  it('opens AI evaluation results', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: 'AI 评测' }));
    expect(await screen.findByRole('heading', { name: '智能化效果评测' })).toBeVisible();
  });

  it('opens an incident trace from the incident center', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: /事故中心/ }));
    await user.click(screen.getByRole('button', { name: /INC-20260825-031/ }));
    expect(screen.getByRole('dialog', { name: '事故详情' })).toBeVisible();
    expect(screen.getByText('TIMEOUT 错误码增加 23.4 倍')).toBeVisible();
  });

  it('opens the priority incident trace from the overview', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: '查看完整证据链' }));
    expect(screen.getByRole('dialog', { name: '事故详情' })).toBeVisible();
  });
});
