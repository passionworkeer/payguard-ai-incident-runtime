import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('PayGuard dashboard', () => {
  it('shows the guided six-stage incident workflow', async () => {
    render(<Dashboard />);

    expect(screen.getByRole('heading', { name: '商户故障 AI 处置台' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: '支付接口超时率突增' })).toBeVisible();

    for (const stage of ['智能核验', '定位分析', '商户触达', '故障升级', '恢复判断', '评测回流']) {
      expect(screen.getByText(stage)).toBeVisible();
    }
  });

  it('does not show the legacy synthetic-data banner', async () => {
    render(<Dashboard />);
    expect(screen.queryByText('全量合成演示数据')).not.toBeInTheDocument();
  });
});
