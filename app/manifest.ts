import type { MetadataRoute } from 'next';
import { PWA_ICONS, PWA_MASKABLE, THEME_COLOR } from '../src/brand/assets.ts';

/** Web manifest — app icon option A; both colours follow the cream chrome (Brand). */
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
      ...PWA_ICONS.map((icon) => ({ src: icon.path, sizes: icon.width + 'x' + icon.height, type: 'image/png' })),
      { src: PWA_MASKABLE.path, sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ],
  };
}
