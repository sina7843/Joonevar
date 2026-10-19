/**
 * The image of a record — DS *RecordImage* (`.hz-media`).
 *
 * The address is always `/media/<file id>`, the alternative text comes from the
 * record and is never invented here, and the frame reserves its ratio so the
 * text below does not jump (PROMPT-018). A record without an image shows the
 * system's designed placeholder (symbol at 40% + the Persian alt text), never an
 * empty grey box (DS rule 4).
 */
import type { ReactNode } from 'react';

export type RecordImageVariant = 'banner' | '4x3' | '3x2' | '1x1' | 'thumb' | 'thumb-lg' | 'avatar';

const FRAME: Record<RecordImageVariant, { cls: string; width: number; height: number }> = {
  banner: { cls: 'hz-media--16x9', width: 1200, height: 675 },
  '4x3': { cls: 'hz-media--4x3', width: 800, height: 600 },
  '3x2': { cls: 'hz-media--3x2', width: 900, height: 600 },
  '1x1': { cls: 'hz-media--1x1', width: 600, height: 600 },
  thumb: { cls: 'hz-media--thumb', width: 56, height: 56 },
  'thumb-lg': { cls: 'hz-media--thumb-lg', width: 64, height: 64 },
  avatar: { cls: 'hz-media--avatar', width: 56, height: 56 },
};

export function RecordImage({
  fileId,
  altFa,
  priority = false,
  variant = 'banner',
  className = '',
  children,
}: {
  fileId: string | null;
  altFa: string | null;
  /** The one image above the fold on a page loads eagerly; every other waits. */
  priority?: boolean;
  variant?: RecordImageVariant;
  className?: string;
  /** Overlays inside the frame — only the DS tag pill (`.hz-tag--on-media`) may sit on a photo. */
  children?: ReactNode;
}) {
  const frame = FRAME[variant];
  const small = variant === 'thumb' || variant === 'thumb-lg' || variant === 'avatar';
  return (
    <div className={['hz-media', frame.cls, className].join(' ').trim()}>
      {fileId === null ? (
        <div className="hz-media__empty" data-testid="record-image-empty">
          <img src="/brand/logo/symbol.svg" alt="" />
          {small ? null : <span className="hz-media__alt">{altFa ?? 'تصویر ثبت نشده'}</span>}
        </div>
      ) : (
        <img
          src={'/media/' + fileId}
          alt={altFa ?? ''}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          width={frame.width}
          height={frame.height}
          data-testid="record-image"
        />
      )}
      {children}
    </div>
  );
}
