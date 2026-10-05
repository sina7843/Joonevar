# حرکت — Motion

Formal and trustworthy means motion is **little, short and meaningful**. It only ever explains a change; it never decorates.

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120ms | Hover, press, focus, small state changes; every exit |
| `duration-base` | 160ms | Card lift, tab switch, accordion, toast enter |
| `duration-slow` | 240ms | Modal / drawer / bottom sheet enter, carousel slide |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Changes in place |
| `ease-enter` | cubic-bezier(0, 0, 0.2, 1) | Layers entering |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Layers leaving |

## Allowed motion

- **Overlay enter/exit:** modal fades + scales from 0.98; drawer and bottom sheet slide from their edge (drawer from the **end** side in RTL, i.e. physical left — use logical transforms).
- **State feedback:** button press, toggle, checkbox, toast, copy-to-clipboard confirmation.
- **Card lift on hover** (pointer devices only): translateY(−2px), `duration-base` — the existing `hz-lift`.
- **Carousel** in the home hero: manual, with dots; **never autoplay**.
- **Progress:** skeletons shimmer once per 1.2s at most; spinners only inside buttons (loading state).

## Reduced motion

`@media (prefers-reduced-motion: reduce)`: every transition and animation is removed (durations → 0); overlays appear without movement; skeletons are static; the carousel never advances on its own. No information may depend on motion.
