import { StatusBadge } from '../ui/status.tsx';
import { RecordImage } from '../ui/record-image.tsx';
import type { ProfileCard } from './profiles.ts';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * The mating-profile card (PRODUCT_DECISIONS §5). Everything on it is either a
 * fact Hamzist holds or is labelled for what it is: no full microchip number,
 * no exact address, no previous partner, and the last mating only from a
 * mutually confirmed date.
 */
export function MatingProfileCardView({ card, detail = false }: { card: ProfileCard; detail?: boolean }) {
  const sexFa = card.sex === 'MALE' ? 'نر' : card.sex === 'FEMALE' ? 'ماده' : 'نامشخص';
  const place = [card.provinceFa, card.cityFa].filter(Boolean).join('، ') || 'مکان ثبت نشده';
  return (
    <article className="rounded-lg border border-border-subtle bg-bg-surface p-lg" data-testid={'finder-card-' + card.profileId}>
      <div className="flex flex-wrap items-start gap-md">
        <RecordImage fileId={card.primary?.fileId ?? null} altFa={card.primary?.altFa ?? null} variant={detail ? 'banner' : 'thumb'} priority={detail} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <h2 className="text-label-lg">{card.nameFa}</h2>
            <span data-testid={'finder-card-state-' + card.profileId}>
              <StatusBadge tone={card.state === 'READY' ? 'success' : card.state === 'INACTIVE' ? 'neutral' : 'info'}>{card.stateFa}</StatusBadge>
            </span>
          </div>
          <p className="mt-2xs text-body-sm text-text-secondary">
            {[card.breedFa ?? 'نژاد نامشخص', sexFa, card.ageFa ?? 'سن نامشخص', place].join(' · ')}
          </p>
        </div>
      </div>

      <dl className="mt-md grid gap-sm text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-caption text-text-secondary">آخرین جفت‌گیری تأییدشده</dt>
          <dd data-testid={'finder-card-last-mating-' + card.profileId}>{card.lastMatingFa}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">فاصله استراحت</dt>
          <dd data-testid={'finder-card-cooldown-' + card.profileId}>{card.cooldown.fa}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">سابقه ثبت‌شده</dt>
          <dd>
            {fa(card.confirmedMatings) + ' جفت‌گیری تأییدشده · ' + fa(card.births) + ' زایمان · ' + fa(card.registeredOffspring) + ' توله ثبت‌شده'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">شجره‌نامه و کامل‌بودن اطلاعات</dt>
          <dd>{(card.hasPedigree ? 'شجره‌نامه دارد' : 'بدون شجره‌نامه') + ' · ' + fa(card.completeness.score) + ' از ' + fa(card.completeness.total)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">مالک</dt>
          <dd>{card.ownerKind === 'KENNEL' ? 'کنل' + (card.kennelNameFa ? ' ' + card.kennelNameFa : '') : 'مالک شخصی'}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">میکروچیپ</dt>
          <dd>میکروچیپ رسمی ثبت‌شده</dd>
        </div>
      </dl>

      {card.ageRequestProblemFa ? (
        <p className="mt-md rounded-md bg-status-warning-bg px-md py-sm text-caption" data-testid={'finder-card-age-' + card.profileId}>
          {card.ageRequestProblemFa}
        </p>
      ) : null}

      {detail && card.preferencesFa ? (
        <div className="mt-md">
          <h3 className="text-label-md">ترجیحات مالک</h3>
          <p className="mt-2xs whitespace-pre-line text-body-sm">{card.preferencesFa}</p>
        </div>
      ) : null}

      {detail && card.images.length > 1 ? (
        <ul className="mt-md grid grid-cols-2 gap-sm sm:grid-cols-4" aria-label="تصویرهای دیگر">
          {card.images
            .filter((image) => image.fileId !== card.primary?.fileId)
            .map((image) => (
              <li key={image.mediaId}>
                <RecordImage fileId={image.fileId} altFa={image.altFa} />
              </li>
            ))}
        </ul>
      ) : null}

      <p className="mt-md text-caption text-text-secondary">
        {'وضعیت باروری اظهار مالک است و تأیید دامپزشکی نیست. ' + (card.ruleVersion !== null ? 'قاعده نژاد: نسخه ' + fa(card.ruleVersion) + '.' : '')}
      </p>
    </article>
  );
}
