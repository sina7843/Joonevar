# Manifest colours — app icon options

Same composition in every file: the symbol is centred on the centre of its smallest enclosing circle, and that circle is 85% of the maskable safe zone (central 80% circle). The symbol is 60% of the tile height and survives the iOS squircle and the Android circle/squircle masks whole. Each folder holds `icon-1024.png`, `apple-touch-icon-180.png` (opaque, square corners), `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` and the source `icon.svg`.

| Option | Icon | Mark vs ground | `theme_color` | `background_color` |
|---|---|---|---|---|
| **A — recommended** | orange symbol (cream cut-outs) on cream-50 | 3.22:1 | `#FFFCF8` | `#FFFCF8` |
| B | cream-50 symbol (cut-outs knocked out) on orange-500 | 3.22:1 | `#FFFCF8` | `#FFFCF8` |
| C | orange symbol (cream cut-outs) on ink-900 | 3.43:1 | `#FFFCF8` | `#FFFCF8` |

- `theme_color` = `bg-chrome` (cream-50) for every option: it colours the status bar / title bar, which runs into the cream top bar of the app — it follows the chrome, not the icon.
- `background_color` = cream-50 for every option: the install splash is the canvas the app opens on. With A the icon tile is the same cream, so the splash shows the symbol alone.
- A's ground is cream-50 rather than logo-cream (`#FFF1D6`): the orange mark is 3.22:1 on cream-50 but 2.95:1 on logo-cream, under the brand's 3:1 one-ink rule. B's symbol is cream-50 for the same reason.

**Recommendation: A** — the mark in its approved colours, on the app's own chrome cream, continuous with today's cream icon, seamless with the splash. B is the alternative if home-screen presence matters more than colour fidelity; C reads as a dark-mode icon for a light-only product.

To ship an option, copy its five PNGs from `app-icon/<A|B|C>/` to `App/public/brand/app-icon/` (names unchanged).
