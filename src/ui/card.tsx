import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from './button.tsx';
import { ActionOwner, Identifier, StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';
import type { LockDetail } from '../domain/errors.ts';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';

/**
 * Card — DS *Card* (`.hz-card`): white, 1px `border-default`, radius 20, no
 * shadow. `feature` (cream) is for SiteShell landing pages only.
 */
export type CardVariant = 'default' | 'compact' | 'flush' | 'subtle' | 'feature';

export function Card({
  children,
  className = '',
  variant = 'default',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
  as?: 'section' | 'article' | 'div';
}) {
  return (
    <Tag className={['hz-card', variant === 'default' ? '' : 'hz-card--' + variant, className].join(' ').trim()}>
      {children}
    </Tag>
  );
}

/**
 * A status-dictionary key, or — only for a value the dictionary has no key for
 * (GAPS #4) — an explicit tone and label.
 */
export type CardStatus = string | { tone: StatusTone; label: string };

function CardStatusBadge({ status }: { status: CardStatus }) {
  return typeof status === 'string' ? <StatusBadge status={status} /> : <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

export function CardHeader({
  title,
  subtitle,
  badge,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: CardStatus;
  action?: ReactNode;
}) {
  return (
    <div className="hz-card__header">
      <div className="min-w-0">
        <h3 className="hz-card__title">{title}</h3>
        {subtitle ? <div className="mt-2xs text-caption text-text-secondary">{subtitle}</div> : null}
      </div>
      {badge ? <CardStatusBadge status={badge} /> : null}
      {action ?? null}
    </div>
  );
}

/**
 * Animal row — DS *AnimalCard* (`.hz-animal`): thumbnail, name, species and
 * breed, the identifier once issued, and the state as a badge. The whole row
 * is the link (§23.2: the Pet ID exists only once a sheet is issued). `status`
 * is a dictionary key; REGISTERED shows no badge — the Pet ID says it (CMPA1-018).
 */
export function AnimalCard({
  name,
  speciesBreed,
  petId,
  status,
  href,
  imageFileId = null,
  imageAltFa = null,
}: {
  name: string;
  speciesBreed: string;
  petId: string | null;
  status?: string;
  href: string;
  imageFileId?: string | null;
  imageAltFa?: string | null;
}) {
  return (
    <Link href={href} className="hz-animal">
      <div className="hz-media hz-media--thumb-lg">
        {imageFileId ? (
          <img src={'/media/' + imageFileId} alt={imageAltFa ?? ''} loading="lazy" width={64} height={64} />
        ) : (
          <div className="hz-media__empty">
            <img src="/brand/logo/symbol.svg" alt="" />
          </div>
        )}
      </div>
      <div className="hz-animal__body">
        <span className="hz-animal__name">{name}</span>
        <span className="hz-animal__meta">{speciesBreed}</span>
        <span className="hz-animal__meta">
          {petId ? <Identifier label="شناسه:" value={petId} /> : 'شناسه: —'}
        </span>
      </div>
      <div className="hz-animal__end">{status ? <StatusBadge status={status} /> : null}</div>
      <Icon name="caretRight" size="sm" mirror />
    </Link>
  );
}

/**
 * Active request — DS *RequestCard* (`.hz-request`): title, case code, animal,
 * status, the owner of the next action, a deadline when one exists, and a
 * «پیگیری» link back to the same case and step (§8).
 */
export function RequestCard({
  title,
  requestCode,
  animalName,
  status,
  owner,
  deadlineFa,
  resumeHref,
}: {
  title: string;
  requestCode: string;
  animalName: string;
  status: CardStatus;
  owner: ActionOwnerKind;
  deadlineFa?: string;
  resumeHref: string;
}) {
  return (
    <article className="hz-request">
      <div className="hz-request__head">
        <div className="min-w-0">
          <div className="hz-request__title">{title}</div>
          <div className="hz-request__meta">
            <bdi className="hz-id" dir="ltr" data-testid="identifier">
              {requestCode}
            </bdi>
            <span>حیوان: {animalName}</span>
          </div>
        </div>
        <CardStatusBadge status={status} />
      </div>
      <div className="hz-request__foot">
        <ActionOwner owner={owner} extra={deadlineFa ? 'مهلت مراجعه تا ' + deadlineFa : undefined} />
        <ButtonLink tone="secondary" href={resumeHref}>
          پیگیری
          <Icon name="arrowRight" size="sm" mirror />
        </ButtonLink>
      </div>
    </article>
  );
}

/**
 * A locked service — DS *LockedServiceCard* (`.hz-locked`): what is locked ·
 * why · what unlocks it (§5). It takes a `LockDetail`, so a lock can never be a
 * bare disabled button with nothing to act on.
 */
export function LockedServiceCard({
  serviceLabel,
  lock,
  icon,
}: {
  serviceLabel: string;
  lock: LockDetail;
  icon?: IconName;
}) {
  return (
    <article className="hz-locked" aria-disabled="true">
      <h3 className="hz-locked__title">
        <Icon name={icon ?? 'lockSimple'} size="sm" />
        {serviceLabel}
      </h3>
      <p className="hz-locked__why">
        <b>{lock.reason}</b> {lock.nextPrerequisite}
      </p>
      <ButtonLink tone="secondary" size="sm" href={lock.cta.href} className="hz-locked__unlock">
        {lock.cta.label}
      </ButtonLink>
    </article>
  );
}

/** An available service entry point — DS *ServiceCard*: the whole card is the link. */
export function ServiceCard({
  label,
  description,
  href,
  icon,
  price,
}: {
  label: string;
  description: string;
  href: string;
  icon?: IconName;
  /** Formatted fee from the managed fee table; `null` shows «تعیین‌نشده». */
  price?: string | null;
}) {
  return (
    <Link href={href} className="hz-card hz-card--interactive hz-service-card">
      <div className="hz-service">
        <h3 className="hz-service__title">
          {icon ? <Icon name={icon} size="sm" className="text-text-brand" /> : null}
          {label}
          <Icon name="arrowRight" size="sm" mirror />
        </h3>
        <p className="hz-service__desc">{description}</p>
      </div>
      {price !== undefined ? (
        <div className="hz-card__footer">
          <span className={price === null ? 'hz-service__price hz-service__price--unset' : 'hz-service__price'}>
            {price ?? 'تعیین‌نشده'}
          </span>
        </div>
      ) : null}
    </Link>
  );
}
