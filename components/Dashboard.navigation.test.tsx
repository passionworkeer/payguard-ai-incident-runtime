import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('dashboard navigation', () => {
  it('uses the guided run as the default and exposes only functional modules', async () => {
    render(<Dashboard />);

    expect(await screen.findByRole('heading', { name: '支付接口超时率突增' })).toBeVisible();
    // 运营总览是 P4 引入的导航项（北极星/一级/护栏三层指标 + MTTR 分解），保留为功能模块。
    for (const item of ['处置演示', '事故中心', '运营总览', '流程分析', 'AI 评测']) {
      expect(screen.getByRole('button', { name: new RegExp(item) })).toBeVisible();
    }
    for (const removed of ['数据集', 'Prompt 版本', '系统设置']) {
      expect(screen.queryByRole('button', { name: removed })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('AI 自动处置率')).not.toBeInTheDocument();
  });

  it('opens the operations overview placeholder', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: '运营总览' }));
    expect(await screen.findByRole('heading', { name: '运营总览' })).toBeVisible();
  });

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

});
