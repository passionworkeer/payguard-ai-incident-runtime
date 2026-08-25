import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PayGuard · 商户故障 AI 处置台',
  description: '面向支付商户故障核验、定位、触达、升级、恢复与智能化评测的演示系统。',
  openGraph: {
    title: 'PayGuard · 商户故障 AI 处置台',
    description: '用一条可观测、可评测的 AI 流程处置支付商户故障。',
    type: 'website',
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary',
    title: 'PayGuard · 商户故障 AI 处置台',
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
