import { LEVEL_ATTRIBUTES, LEVEL_FA, type BreedLevel } from '../breeds/model.ts';

const STEPS: Record<BreedLevel, number> = { LOW: 1, MODERATE: 2, HIGH: 3 };

/** DS *BreedCard* trait meters (`dl.hz-traits`): five 3-step meters with their word; unset says «تعیین‌نشده». */
export function BreedTraits({ breed }: { breed: Readonly<Record<(typeof LEVEL_ATTRIBUTES)[number]['key'], BreedLevel | null>> }) {
  return (
    <dl className="hz-traits">
      {LEVEL_ATTRIBUTES.map(({ key, labelFa }) => {
        const level = breed[key];
        return (
          <div key={key} className={level ? 'hz-trait' : 'hz-trait hz-trait--unset'}>
            <dt className="hz-trait__name">{labelFa}</dt>
            <dd className="hz-trait__value">
              {level ? (
                <span className="hz-meter3" aria-hidden="true">
                  {[1, 2, 3].map((step) => (
                    <span key={step} className={step <= STEPS[level] ? 'hz-meter3__step hz-meter3__step--on' : 'hz-meter3__step'} />
                  ))}
                </span>
              ) : null}
              <span className="hz-trait__label">{level ? LEVEL_FA[level] : 'تعیین‌نشده'}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
