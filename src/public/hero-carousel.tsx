'use client';

import { useState } from 'react';
import { Icon } from '../ui/icon.tsx';

/**
 * Home hero images — DS *Hero* carousel: manual only (never autoplay), 44px
 * arrows so the dots are never the only control, the active dot carries
 * `aria-current`. A single slide hides the controls.
 */
export function HeroCarousel({ slides }: { slides: ReadonlyArray<{ src: string; altFa: string }> }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const slide = slides[index]!;
  const go = (next: number) => setIndex((next + count) % count);
  return (
    <div aria-roledescription="carousel" aria-label="تصویرهای همزیست" className="flex flex-col gap-md">
      <div
        className="hz-media hz-media--16x9 hz-hero__media"
        role="group"
        aria-roledescription="اسلاید"
        aria-label={(index + 1).toLocaleString('fa-IR') + ' از ' + count.toLocaleString('fa-IR')}
      >
        <img src={slide.src} alt={slide.altFa} width={1200} height={675} fetchPriority={index === 0 ? 'high' : 'auto'} />
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-between gap-md [&>.hz-carousel]:ms-auto">
          <p className="hz-caption hz-show-md">{slide.altFa}</p>
          <div className="hz-carousel">
            <button type="button" className="hz-icon-btn hz-icon-btn--outline" aria-label="تصویر قبلی" onClick={() => go(index - 1)}>
              <Icon name="caretLeft" size="sm" mirror />
            </button>
            <div className="hz-carousel-dots">
              {slides.map((item, dot) => (
                <button
                  key={item.src}
                  type="button"
                  aria-label={'تصویر ' + (dot + 1).toLocaleString('fa-IR') + ' از ' + count.toLocaleString('fa-IR')}
                  aria-current={dot === index ? 'true' : undefined}
                  onClick={() => setIndex(dot)}
                />
              ))}
            </div>
            <button type="button" className="hz-icon-btn hz-icon-btn--outline" aria-label="تصویر بعدی" onClick={() => go(index + 1)}>
              <Icon name="caretRight" size="sm" mirror />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
