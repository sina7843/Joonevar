import type { Metadata, Viewport } from 'next';
import './globals.css';
import { FAVICONS, THEME_COLOR } from '../src/brand/assets.ts';

export const metadata: Metadata = {
  title: 'همزیست',
  description: 'زیرساخت ثبت و پیگیری هویت، نسب، اسناد و چرخه تولیدمثل سگ‌ها',
  // Nothing is indexed unless its page says so: public pages opt in through
  // `buildMetadata`, so a new application screen never lands in search (DEC-0151).
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  /*
   * Brand › Files: the SVG favicon first, then one artwork per PNG size
   * (below 24px the mark is different artwork), the .ico as the shortcut.
   */
  icons: {
    icon: [
      { url: '/brand/favicon/favicon.svg', type: 'image/svg+xml' },
      ...FAVICONS.map((asset) => ({ url: asset.path, sizes: asset.width + 'x' + asset.height, type: 'image/png' })),
    ],
    shortcut: '/brand/favicon/favicon.ico',
    apple: [{ url: '/brand/app-icon/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  // Default share image; public pages replace it with an absolute URL via `buildMetadata`.
  openGraph: { images: [{ url: '/brand/social/og-1200x630.png', width: 1200, height: 630 }] },
};

/** The status bar follows the cream chrome (Brand › app-icon manifest colours). */
export const viewport: Viewport = { themeColor: THEME_COLOR, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Persian and RTL are the product default, not a locale switch (§24.1).
  // `hz` is the design system's root: type, focus ring and reduced motion.
  return (
    <html lang="fa" dir="rtl" className="has-[.hz-sticky-bar]:[scroll-padding-block-end:120px] has-[.hz-action-row--sticky]:[scroll-padding-block-end:96px] max-md:has-[.hz-sticky-bar]:[&>body]:pb-[140px] max-md:has-[.hz-action-row--sticky]:[&>body]:pb-[88px]">
      <body className="hz">{children}</body>
    </html>
  );
}
