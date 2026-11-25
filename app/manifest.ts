import type { MetadataRoute } from 'next';
import { THEME_COLOR } from '../src/brand/assets.ts';

/** Web manifest — app icon option A; both colours are the cream chrome FFFCF8 (Brand). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'همزیست',
    short_name: 'همزیست',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: [
      { src: '/brand/app-icon/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/app-icon/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/app-icon/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
