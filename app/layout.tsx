import type { Metadata } from 'next';
import './globals.css';
import { APPLE_ICON, FAVICONS } from '../src/brand/assets.ts';

export const metadata: Metadata = {
  title: 'همزیست',
  description: 'زیرساخت ثبت و پیگیری هویت، نسب، اسناد و چرخه تولیدمثل سگ‌ها',
  // Nothing is indexed unless its page says so: public pages opt in through
  // `buildMetadata`, so a new application screen never lands in search (DEC-0151).
  robots: { index: false, follow: false },
  /*
   * The Design System ships one artwork per favicon size (section 05), because
   * below 24px the mark uses the simplified single-ink glyph. Declaring all
   * three lets the browser pick the right drawing instead of scaling one.
   */
  icons: {
    icon: FAVICONS.map((asset) => ({
      url: asset.path,
      sizes: asset.width + 'x' + asset.height,
      type: 'image/png',
    })),
    apple: [{ url: APPLE_ICON.path, sizes: APPLE_ICON.width + 'x' + APPLE_ICON.height, type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Persian and RTL are the product default, not a locale switch (§24.1).
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
