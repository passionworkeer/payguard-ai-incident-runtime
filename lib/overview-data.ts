// 运营总览页静态数据：所有数字设计为「与 dashboard 北极星卡口径自洽」：
// mttrBreakdown 各段加和 = 18.6m（北极星 MTTR 卡值）；
// metricTimeline 时间窗覆盖黄金场景事故窗口 14:18–14:43 的跌落与回弹形状（与 channel-rebound 场景的 13:46–14:18 错开，避免「同一事故同时出现在两处」的口径混乱）。

export interface MttrSegment {
  key: string;
  label: string;
  minutes: number;
}

export const mttrBreakdown: MttrSegment[] = [
  { key: 'detect', label: '发现告警', minutes: 2.4 },
  { key: 'verify', label: '核验', minutes: 1.8 },
  { key: 'locate', label: '定位', minutes: 4.6 },
  { key: 'contact', label: '触达', minutes: 3.2 },
  { key: 'recover', label: '恢复确认', minutes: 6.6 },
];

// 30 个时序点（13:55–14:55）：模拟一次 P0 事故跌落到 71% 再回升的完整曲线，
// 与 channel-rebound 场景「真实世界事故窗口」形状对齐：第 18 点附近（≈14:18）见底，第 25 点（≈14:43）回到基线。
export const metricTimeline: { time: string; successRate: number; p95Ms: number; alertCount: number }[] = (() => {
  const points: { time: string; successRate: number; p95Ms: number; alertCount: number }[] = [];
  const baseSuccess = 99.6;
  const baseLatency = 230;
  // 30 点：i=0..29，第 18 点 = 14:18 + 3 = 14:18（13:55 起步 + 3min/点 → 14:18 在 i=23... 重新校准）
  // 实际想表达：13:55–14:55 = 60 分钟 / 30 点 = 2 分钟/点。第 12 点 = 14:19（事故第 1 个窗口探到）。
  for (let i = 0; i < 30; i++) {
    const minutes = 13 * 60 + 55 + i * 2; // 13:55 起步
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // 形状：12–22 点深度跌落，23–28 回升，29 回到基线
    let successRate = baseSuccess;
    let p95Ms = baseLatency;
    let alertCount = 30;
    if (i >= 12 && i <= 14) { successRate = 96.2; p95Ms = 480; alertCount = 58; }
    if (i >= 15 && i <= 17) { successRate = 88.4; p95Ms = 1240; alertCount = 86; }
    if (i >= 18 && i <= 20) { successRate = 78.6; p95Ms = 2380; alertCount = 102; }
    if (i >= 21 && i <= 23) { successRate = 85.1; p95Ms = 1620; alertCount = 78; }
    if (i >= 24 && i <= 26) { successRate = 92.4; p95Ms = 760; alertCount = 52; }
    if (i >= 27) { successRate = 99.1; p95Ms = 280; alertCount = 34; }
    points.push({ time, successRate, p95Ms, alertCount });
  }
  return points;
})();

export interface AlertFeedRow {
  id: string;
  time: string;
  merchant: string;
  scenario: 'gateway-timeout' | 'false-alarm' | 'merchant-cert' | 'channel-rebound' | 'noise';
  verdict: 'incident' | 'false-alarm' | 'pending';
  severity: 'P0' | 'P1' | 'P2';
  summary: string;
}

// 10 行原始告警流：覆盖 4 个场景商户 + 噪声告警，verdict 区分误报 / 确认 / 处理中。
export const alertFeed: AlertFeedRow[] = [
  { id: 'A-14:23-031', time: '14:23', merchant: '星海出行', scenario: 'gateway-timeout', verdict: 'incident', severity: 'P0', summary: '支付接口超时率突增（5.4×），已生成定位 + 触达方案' },
  { id: 'A-14:18-024', time: '14:18', merchant: '万象零售', scenario: 'channel-rebound', verdict: 'incident', severity: 'P0', summary: '工行渠道成功率 12.4%，切换建议已下发，恢复判断进入第 2 轮' },
  { id: 'A-14:08-028', time: '14:08', merchant: '云杉生活', scenario: 'merchant-cert', verdict: 'incident', severity: 'P1', summary: '签名校验失败 61.2×，商户证书过期，触达指导步骤 3 条' },
  { id: 'A-13:21-019', time: '13:21', merchant: '麦田会员店', scenario: 'false-alarm', verdict: 'false-alarm', severity: 'P2', summary: '大促 4.1× 流量峰值告警，成功率 99.48% 在基线内，回流 TN 样本' },
  { id: 'A-13:55-N1', time: '13:55', merchant: '光合餐饮', scenario: 'noise', verdict: 'false-alarm', severity: 'P2', summary: '单笔超时（黄牛探测），商户正常下单未受影响' },
  { id: 'A-13:42-N2', time: '13:42', merchant: '暖光便利', scenario: 'noise', verdict: 'pending', severity: 'P2', summary: 'CDN 边缘节点抖动 7s，已自动恢复，等待复核' },
  { id: 'A-13:30-014', time: '13:30', merchant: '云海生鲜', scenario: 'noise', verdict: 'incident', severity: 'P1', summary: '商户私钥轮换未通知，已触发升级' },
  { id: 'A-13:18-N3', time: '13:18', merchant: '飞鸟旅行', scenario: 'noise', verdict: 'false-alarm', severity: 'P2', summary: '偶发路由超时 1 次，未达告警阈值' },
  { id: 'A-12:55-N4', time: '12:55', merchant: '晨曦便利', scenario: 'noise', verdict: 'false-alarm', severity: 'P2', summary: '网关探针重试告警（探针自身问题）' },
  { id: 'A-12:34-N5', time: '12:34', merchant: '北辰商超', scenario: 'noise', verdict: 'false-alarm', severity: 'P2', summary: '静态限流策略命中，无业务影响' },
];