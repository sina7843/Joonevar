'use client';

import { useState } from 'react';
import { Icon } from './icon.tsx';
import { Modal } from './overlay.tsx';

const ZOOM = [1, 1.5, 2, 3] as const;
const pct = (zoom: number): string => (zoom * 100).toLocaleString('fa-IR') + '٪';

/**
 * DS *DocumentPreview*: a private document shown inside the desk with zoom
 * (۱۰۰ · ۱۵۰ · ۲۰۰ · ۳۰۰٪), clockwise rotation and a fullscreen modal — never a
 * download, print or new-tab control. The source is the authorized private-file
 * route; an image renders as <img>, anything the browser cannot draw as an
 * image (a PDF) falls back to an embedded frame of the same route.
 */
export function DocumentPreview({ src, altFa, testId }: { src: string; altFa: string; testId?: string }) {
  const [zoom, setZoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const [full, setFull] = useState(false);
  const [state, setState] = useState<'loading' | 'image' | 'frame'>('loading');
  const transform = 'scale(' + ZOOM[zoom] + ') rotate(' + turn * 90 + 'deg)';

  const body = (fullscreen: boolean) => (
    <div className={['hz-doc', zoom > 0 ? 'hz-doc--zoomed' : '', fullscreen ? 'hz-doc--full' : ''].join(' ').trim()} tabIndex={zoom > 0 ? 0 : undefined}>
      {state === 'frame' ? (
        <iframe src={src} title={altFa} className="h-full w-full border-0 bg-bg-surface" />
      ) : (
        <img
          src={src}
          alt={altFa}
          draggable={false}
          style={{ transform, transition: 'transform var(--duration-base) var(--ease-standard)' }}
          onLoad={() => setState('image')}
          onError={() => setState('frame')}
          data-testid={fullscreen ? undefined : testId}
        />
      )}
      {state === 'loading' ? (
        <div className="hz-doc__status absolute" aria-busy="true">
          <span className="hz-spinner hz-spinner--lg" aria-hidden="true" />
          مدرک در حال بارگذاری است
        </div>
      ) : null}
    </div>
  );

  const tools = (fullscreen: boolean) =>
    state === 'image' ? (
      <div className="hz-doc__tools" role="toolbar" aria-label="ابزار مدرک">
        <button type="button" className="hz-icon-btn hz-icon-btn--sm" aria-label="کوچک‌نمایی" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
          <Icon name="magnifyingGlassMinus" size="xs" />
        </button>
        <button type="button" className="hz-docview__zoom" aria-label="اندازه صفحه" onClick={() => setZoom(0)}>
          {pct(ZOOM[zoom]!)}
        </button>
        <button type="button" className="hz-icon-btn hz-icon-btn--sm" aria-label="بزرگ‌نمایی" disabled={zoom === ZOOM.length - 1} onClick={() => setZoom((z) => z + 1)}>
          <Icon name="magnifyingGlassPlus" size="xs" />
        </button>
        <span className="hz-docview__sep" aria-hidden="true" />
        <button type="button" className="hz-icon-btn hz-icon-btn--sm" aria-label="چرخش ۹۰ درجه" aria-pressed={turn % 4 !== 0} onClick={() => setTurn((t) => (t + 1) % 4)}>
          <Icon name="arrowClockwise" size="xs" />
        </button>
        {fullscreen ? null : (
          <button type="button" className="hz-icon-btn hz-icon-btn--sm" aria-label="تمام‌صفحه" onClick={() => setFull(true)}>
            <Icon name="cornersOut" size="xs" />
          </button>
        )}
      </div>
    ) : null;

  return (
    <>
      <div className="hz-docview__frame">
        {body(false)}
        {tools(false)}
      </div>
      {turn % 4 !== 0 ? <span className="hz-caption">{'چرخانده‌شده ' + (turn * 90).toLocaleString('fa-IR') + '°'}</span> : null}
      <Modal open={full} onClose={() => setFull(false)} title={altFa}>
        <div className="hz-docview__frame h-[70vh]">
          {body(true)}
          {tools(true)}
        </div>
      </Modal>
    </>
  );
}
