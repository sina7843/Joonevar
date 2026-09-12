import { Alert } from './alert.tsx';
import { MAP_STATE_FA, mapEmbedUrl, mapState } from '../geo/model.ts';

/**
 * The map slot — Requirements-Phase-2 §19, §20 (PROMPT-015).
 *
 * Nothing is drawn unless three things are true at once: the owner published
 * this place, the superadmin recorded a map embed template, and coordinates
 * exist. A place that is not public renders nothing at all — not an empty box,
 * not a note — so a private address never becomes a URL.
 *
 * The provider's address format is never guessed: it comes from the managed
 * template, exactly as the operator recorded it (DEC-0175).
 */
export function PlaceMap({
  nameFa,
  isPublic,
  latitude,
  longitude,
  template,
  apiKey,
  testId,
}: {
  nameFa: string;
  isPublic: boolean;
  latitude: number | null;
  longitude: number | null;
  template: string | null;
  apiKey: string | null;
  testId: string;
}) {
  const state = mapState({ providerConfigured: (template ?? '').trim() !== '', isPublic, latitude, longitude });
  if (state === 'NOT_PUBLIC') return null;

  if (state !== 'VISIBLE') {
    return (
      <p className="mt-xs text-caption text-text-secondary" data-testid={testId + '-note'}>
        {MAP_STATE_FA[state]}
      </p>
    );
  }

  const src = mapEmbedUrl(template!, { latitude: latitude!, longitude: longitude!, apiKey });
  if (src === null) {
    return (
      <div className="mt-xs" data-testid={testId + '-invalid'}>
        <Alert tone="warning" title="الگوی نشانی نقشه معتبر نیست">
          الگوی ثبت‌شده باید با https شروع شود و جای‌گذارهای مختصات را داشته باشد.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mt-sm overflow-hidden rounded-lg border border-border-subtle" data-testid={testId}>
      <iframe
        src={src}
        title={'نقشه ' + nameFa}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
        className="block h-[220px] w-full border-0"
      />
      <p className="px-md py-sm text-caption text-text-secondary">
        نقشه فقط محل اعلام‌شده را نشان می‌دهد؛ نشانی دقیق و موقعیت غیرعمومی منتشر نمی‌شود.
      </p>
    </div>
  );
}
