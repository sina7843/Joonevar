import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'همزیست',
  description: 'زیرساخت ثبت و پیگیری هویت، نسب، اسناد و چرخه تولیدمثل سگ‌ها',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Persian and RTL are the product default, not a locale switch (§24.1).
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
