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
  metadataBase: new URL('https://codesign-lab-ai-experiment.bbbym-schedule.workers.dev'),
  title: 'CoDesign Lab · AI协同设计实验',
  description: '用于比较四种AI沟通方式与认知支持策略的人机协同设计实验工具。',
  openGraph: {
    title: 'CoDesign Lab',
    description: 'AI协同设计实验',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'CoDesign Lab AI协同设计实验' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CoDesign Lab',
    description: 'AI协同设计实验',
    images: ['/og.png'],
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
