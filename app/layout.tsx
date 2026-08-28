import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '商户故障 AI 处置台',
  description: '面向支付商户故障核验、定位、触达、升级、恢复与智能化评测的演示系统。',
  openGraph: {
    title: '商户故障 AI 处置台',
    description: '用一条可观测、可评测的 AI 流程处置支付商户故障。',
    type: 'website',
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary',
    title: '商户故障 AI 处置台',
    description: '用一条可观测、可评测的 AI 流程处置支付商户故障。',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
