import Link from 'next/link';
import type { ReactNode } from 'react';
import { RecordImage } from '../ui/record-image.tsx';
import { Icon } from '../ui/icon.tsx';
import type { IconName } from '../ui/icon-paths.ts';
import { KeyValueList } from '../ui/key-value.tsx';
import { statusOf } from '../ui/status-dictionary.ts';
import type { ProfileCard } from './profiles.ts';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/** DS MatingProfileCard availability line: icon + label; the finder keys use the dictionary label. */
const AVAILABILITY: Record<string, { icon: IconName; key?: string }> = {
  READY: { icon: 'checkCircle', key: 'FINDER_READY' },
  INVITE_ONLY: { icon: 'lockSimple', key: 'FINDER_INVITE_ONLY' },
  TEMPORARILY_UNAVAILABLE: { icon: 'pauseCircle', key: 'FINDER_UNAVAILABLE' },
  COORDINATING: { icon: 'handshake' },
  MATCH_SELECTED: { icon: 'handshake' },
  INACTIVE: { icon: 'pauseCircle' },
};

/**
 * The mating-profile card (PRODUCT_DECISIONS §5), drawn as DS *MatingProfileCard*
 * (`.hz-card.hz-mating` + `.hz-entity`). Everything on it is either a fact
 * Hamzist holds or is labelled for what it is: no full microchip number, no
 * exact address, no previous partner, and the last mating only from a mutually
 * confirmed date. `href` makes the name a link (list use); `children` is the
 * fit box / footer the page adds inside the card.
 */
export function MatingProfileCardView({
  card,
  detail = false,
  href,
  children,
}: {
  card: ProfileCard;
  detail?: boolean;
  href?: string;
  children?: ReactNode;
}) {
  const sexFa = card.sex === 'MALE' ? 'نر' : card.sex === 'FEMALE' ? 'ماده' : 'نامشخص';
  const place = [card.provinceFa, card.cityFa].filter(Boolean).join('، ') || 'مکان ثبت نشده';
  const availability = AVAILABILITY[card.state] ?? { icon: 'info' as IconName };
  const stateLabel = (availability.key ? statusOf(availability.key)?.labelFa : null) ?? card.stateFa;
  const Name = detail ? 'h2' : 'h3';

  return (
    <article className="hz-card hz-mating" data-testid={'finder-card-' + card.profileId}>
      {detail ? (
        <div className="mb-lg">
          <RecordImage fileId={card.primary?.fileId ?? null} altFa={card.primary?.altFa ?? null} variant="banner" priority />
        </div>
      ) : null}
      <div className="hz-entity">
        {detail ? null : <RecordImage fileId={card.primary?.fileId ?? null} altFa={card.primary?.altFa ?? null} variant="thumb-lg" />}
        <div className="hz-entity__body">
          <Name className="hz-entity__name">{href ? <Link href={href}>{card.nameFa}</Link> : card.nameFa}</Name>
          <span className="hz-entity__meta">{[card.breedFa ?? 'نژاد نامشخص', sexFa, card.ageFa ?? 'سن نامشخص'].join('، ')}</span>
          <span className="hz-entity__line">
            <Icon name="mapPin" size="xs" />
            {place}
          </span>
          <span className="hz-entity__line">
            <Icon name="calendarBlank" size="xs" />
            <span>
              {'آخرین جفت‌گیری تأییدشده: '}
              <span data-testid={'finder-card-last-mating-' + card.profileId}>{card.lastMatingFa}</span>
            </span>
          </span>
          {detail ? null : (
            <span className="hz-entity__line">
              <Icon name="hourglassMedium" size="xs" />
              <span data-testid={'finder-card-cooldown-' + card.profileId}>{card.cooldown.fa}</span>
            </span>
          )}
          <span
            className={card.state === 'READY' ? 'hz-availability hz-availability--open' : 'hz-availability'}
            data-testid={'finder-card-state-' + card.profileId}
          >
            <Icon name={availability.icon} size="sm" />
            {stateLabel}
          </span>
        </div>
      </div>

      {detail ? (
      <div className="mt-md">
        <KeyValueList
          twoCol={detail}
          rows={[
            {
              key: 'فاصله استراحت',
              value: <span data-testid={'finder-card-cooldown-' + card.profileId}>{card.cooldown.fa}</span>,
            },
            {
              key: 'سابقه ثبت‌شده',
              value:
                fa(card.confirmedMatings) + ' جفت‌گیری تأییدشده · ' + fa(card.births) + ' زایمان · ' + fa(card.registeredOffspring) + ' توله ثبت‌شده',
            },
            {
              key: 'شجره‌نامه',
              value: (card.hasPedigree ? 'شجره‌نامه دارد' : 'بدون شجره‌نامه') + ' · کامل‌بودن ' + fa(card.completeness.score) + ' از ' + fa(card.completeness.total),
            },
            { key: 'مالک', value: card.ownerKind === 'KENNEL' ? 'کنل' + (card.kennelNameFa ? ' ' + card.kennelNameFa : '') : 'مالک شخصی' },
            { key: 'میکروچیپ', value: 'میکروچیپ رسمی ثبت‌شده' },
          ]}
        />
      </div>
      ) : null}

      {card.ageRequestProblemFa ? (
        <div className="hz-fit" data-testid={'finder-card-age-' + card.profileId}>
          <p className="hz-mating__note">{card.ageRequestProblemFa}</p>
        </div>
      ) : null}

      {detail && card.preferencesFa ? (
        <div className="mt-md">
          <h3 className="text-label-lg">ترجیحات مالک</h3>
          <p className="hz-body-sm mt-2xs whitespace-pre-line">{card.preferencesFa}</p>
        </div>
      ) : null}

      {detail && card.images.length > 1 ? (
        <ul className="mt-md grid grid-cols-2 gap-sm sm:grid-cols-4" aria-label="تصویرهای دیگر">
          {card.images
            .filter((image) => image.fileId !== card.primary?.fileId)
            .map((image) => (
              <li key={image.mediaId}>
                <RecordImage fileId={image.fileId} altFa={image.altFa} variant="1x1" />
              </li>
            ))}
        </ul>
      ) : null}

      {children}

      <p className="hz-mating__note mt-md">
        {'وضعیت باروری اظهار مالک است و تأیید دامپزشکی نیست. ' + (card.ruleVersion !== null ? 'قاعده نژاد: نسخه ' + fa(card.ruleVersion) + '.' : '')}
      </p>
    </article>
  );
}
