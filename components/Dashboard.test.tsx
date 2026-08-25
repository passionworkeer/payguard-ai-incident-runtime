import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('PayGuard dashboard', () => {
  it('shows the core operational KPIs and complete incident workflow', () => {
    render(<Dashboard />);

    expect(screen.getByRole('heading', { name: '商户故障 AI 处置台' })).toBeVisible();
    expect(screen.getByText('AI 自动处置率')).toBeVisible();
    expect(screen.getByText('78.4%')).toBeVisible();

    for (const stage of ['智能核验', '定位分析', '商户触达', '故障升级', '恢复判断']) {
      expect(screen.getAllByText(stage)[0]).toBeVisible();
    }
  });

  it('labels all numbers as synthetic demo data', () => {
    render(<Dashboard />);
    expect(screen.getByText('演示数据')).toBeVisible();
  });
});
