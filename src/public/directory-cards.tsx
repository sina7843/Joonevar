import Link from 'next/link';
import { Icon } from '../ui/icon.tsx';
import { RecordImage } from '../ui/record-image.tsx';
import { StatusBadge, TrustedMark } from '../ui/status.tsx';
import type { VetCard as VetCardData } from '../vets/directory.ts';
import type { CentreCard as CentreCardData } from '../centres/service.ts';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * DS *VetCard* (`.hz-vet`): avatar, name with the «معتمد» mark, headline (or
 * specialties), city. One link, one accessible name.
 */
export function VetCard({ vet, testId }: { vet: VetCardData; testId?: string }) {
  const headline = vet.headlineFa ?? (vet.specialtiesFa.length > 0 ? vet.specialtiesFa.join('، ') : null);
  return (
    <Link href={'/veterinarians/' + vet.slug} className="hz-card hz-card--interactive block h-full" data-testid={testId}>
      <div className="hz-vet">
        <RecordImage variant="avatar" fileId={vet.imageFileId} altFa={vet.imageAltFa} />
        <div className="hz-vet__body">
          <span className="hz-vet__name">
            {vet.nameFa}
            {vet.trusted ? <TrustedMark /> : null}
          </span>
          {headline ? <span className="hz-vet__meta">{headline}</span> : null}
          {vet.placesFa.length > 0 ? (
            <span className="hz-vet__meta hz-meta__item">
              <Icon name="mapPin" size="xs" />
              {vet.placesFa.join('، ')}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * DS *CenterCard* (`.hz-centre`): 16:9 photo, type, name, city, up to three
 * service tags (+ «N خدمت دیگر»), and the licence foot.
 */
export function CentreCard({ centre, testId }: { centre: CentreCardData; testId?: string }) {
  const shown = centre.servicesFa.slice(0, 3);
  const more = centre.servicesFa.length - shown.length;
  return (
    <Link href={'/centers/' + centre.slug} className="hz-card hz-card--flush hz-card--interactive hz-centre h-full" data-testid={testId}>
      <RecordImage variant="banner" fileId={centre.imageFileId} altFa={centre.imageAltFa} />
      <div className="hz-card__section hz-centre__body">
        <span className="hz-centre__type">{centre.typeFa}</span>
        <h3 className="hz-centre__name">{centre.nameFa}</h3>
        {centre.placesFa.length > 0 ? (
          <span className="hz-entity__line">
            <Icon name="mapPin" size="xs" />
            {centre.placesFa.join('، ')}
          </span>
        ) : null}
        {shown.length > 0 ? (
          <ul className="hz-tag-list" aria-label="خدمات">
            {shown.map((service) => (
              <li key={service} className="hz-tag hz-tag--neutral">
                {service}
              </li>
            ))}
            {more > 0 ? <li className="hz-tag hz-tag--neutral">{fa(more) + ' خدمت دیگر'}</li> : null}
          </ul>
        ) : null}
      </div>
      <div className="hz-card__section hz-centre__foot">
        پروانه فعالیت
        <StatusBadge status={centre.verified ? 'VALID' : 'NONE'} size="sm" />
      </div>
    </Link>
  );
}
