import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const cursorGothic = localFont({
  variable: '--font-sans',
  display: 'swap',
  src: [
    { path: '../../public/fonts/CursorGothic-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/CursorGothic-Italic.woff2', weight: '400', style: 'italic' },
    { path: '../../public/fonts/CursorGothic-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/CursorGothic-BoldItalic.woff2', weight: '700', style: 'italic' },
  ],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Ready',
  description: 'Make your site AI-ready — generate llms.txt, llms-full.txt, and per-page markdown.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${cursorGothic.variable} ${jetbrainsMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
