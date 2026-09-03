import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from './button.tsx';
import { ActionOwner, Identifier, StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';
import type { LockDetail } from '../domain/errors.ts';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={[
        'rounded-lg border border-border-subtle bg-bg-surface p-lg',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: { tone: StatusTone; label: string };
}) {
  return (
    <div className="flex items-start justify-between gap-md">
      <div className="min-w-0">
        <h3 className="text-label-lg text-text-primary">{title}</h3>
        {subtitle ? <div className="mt-2xs text-caption text-text-secondary">{subtitle}</div> : null}
      </div>
      {badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : null}
    </div>
  );
}

/**
 * Animal summary card, following the approved dashboard composition
 * (prototype OWN-001 / Populated, node 116:481): name, species and breed, the
 * identifier when one has been issued, and a status badge.
 */
export function AnimalCard({
  name,
  speciesBreed,
  petId,
  status,
  href,
}: {
  name: string;
  speciesBreed: string;
  petId: string | null;
  status: { tone: StatusTone; label: string };
  href: string;
}) {
  /*
   * Prototype PET card, F03 116:481: an avatar tile, the name, the species and
   * breed under it, the identifier, and the state as a badge. The whole row is
   * the link — the prototype has no button inside this card, and a button per
   * animal turned a list into a column of calls to action.
   */
  return (
    <Link
      href={href}
      className="hz-lift block rounded-lg border border-border-subtle bg-bg-surface p-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-brand"
    >
      <div className="flex items-start gap-md">
        <span
          aria-hidden="true"
          className="flex size-[var(--size-control-md)] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand"
        >
          <Icon name="dog" size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-sm">
            <h3 className="truncate text-label-lg">{name}</h3>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className="mt-2xs text-caption text-text-secondary">{speciesBreed}</p>
          <p className="mt-2xs text-caption text-text-secondary">
            {/* Pet ID exists only once a registration sheet is issued (§23.2). */}
            {petId ? <Identifier label="شناسه:" value={petId} /> : <span>شناسه: —</span>}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Active request card. Every active request shows its status, the animal, the
 * owner of the next action, a deadline when one exists, and a continue CTA that
 * returns to the same case and step (§8).
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
  status: { tone: StatusTone; label: string };
  owner: ActionOwnerKind;
  deadlineFa?: string;
  resumeHref: string;
}) {
  return (
    <Card>
      <CardHeader title={title} badge={status} subtitle={<Identifier value={requestCode} />} />
      <p className="mt-md text-body-sm">{animalName}</p>
      {deadlineFa ? <p className="mt-2xs text-caption text-text-secondary">مهلت مراجعه تا {deadlineFa}</p> : null}
      <div className="mt-sm">
        <ActionOwner owner={owner} />
      </div>
      <div className="mt-lg">
        <ButtonLink tone="secondary" href={resumeHref} block>
          پیگیری
        </ButtonLink>
      </div>
    </Card>
  );
}

/**
 * A locked service.
 *
 * §5 makes three parts mandatory — the reason, the next prerequisite and a
 * direct CTA — and the prototype's blocked dashboard state (node 116:690)
 * renders exactly that. The component takes a `LockDetail`, so a lock cannot be
 * shown as a bare disabled button with nothing to act on.
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
    <div className="space-y-md">
      <div className="rounded-lg bg-bg-subtle p-xl text-center">
        <p className="text-h4 text-text-primary">{lock.reason}</p>
        <p className="mt-md text-body-sm text-text-secondary">{lock.nextPrerequisite}</p>
        <div className="mt-lg flex justify-center">
          <ButtonLink href={lock.cta.href}>{lock.cta.label}</ButtonLink>
        </div>
      </div>
      <div
        aria-disabled="true"
        className="flex items-center justify-center gap-sm rounded-lg bg-bg-disabled p-lg text-label-lg text-text-disabled"
      >
        {icon ? <Icon name={icon} size="md" /> : null}
        {serviceLabel}
      </div>
    </div>
  );
}

/** An available service entry point. */
export function ServiceCard({
  label,
  description,
  href,
  icon,
}: {
  label: string;
  description: string;
  href: string;
  /** The domain glyph of this service (DS 48:472 domain icons). */
  icon?: IconName;
}) {
  return (
    <Card>
      <h3 className="flex items-center gap-sm text-label-lg">
        {icon ? <Icon name={icon} size="md" className="text-text-brand" /> : null}
        {label}
      </h3>
      <p className="mt-2xs text-caption text-text-secondary">{description}</p>
      <div className="mt-lg">
        <ButtonLink tone="secondary" href={href} block>
          {label}
        </ButtonLink>
      </div>
    </Card>
  );
}
