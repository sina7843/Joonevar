'use client';

import { useActionState, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { QuantityStepper } from '../ui/quantity-stepper.tsx';

interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
}
type Action = (previous: FormState, form: FormData) => Promise<FormState>;

export interface BuyOffer {
  readonly offerId: string;
  readonly skuId: string;
  readonly sellerNameFa: string;
  readonly sellerMetaFa: string;
  readonly priceFa: string;
  readonly available: number;
}
export interface BuyVariant {
  readonly key: string;
  readonly labelFa: string;
  /** Best offer first (cheapest in stock), as the server ordered them. */
  readonly offers: readonly BuyOffer[];
}

const fa = (value: number) => value.toLocaleString('fa-IR');

/**
 * K7 buy box — DS *VariantPicker* + price + *StockBadge* + *QuantityStepper* +
 * «افزودن به سبد» + one *SellerCard* (the best offer of the chosen variant).
 * The variant tiles are real radios in a fieldset; an out-of-stock variant is
 * disabled with «ناموجود». With one variant the picker is not drawn.
 */
export function BuyBox({
  productNameFa,
  variantNameFa,
  variants,
  signedIn,
  action,
}: {
  productNameFa: string;
  /** The picker's legend («وزن بسته»…); «گزینه» when the catalogue names none. */
  variantNameFa: string;
  variants: readonly BuyVariant[];
  signedIn: boolean;
  action: Action;
}) {
  const firstInStock = variants.find((variant) => (variant.offers[0]?.available ?? 0) > 0) ?? variants[0];
  const [key, setKey] = useState(firstInStock?.key ?? '');
  const [quantity, setQuantity] = useState(1);
  const [state, submit, pending] = useActionState(action, {} as FormState);
  const variant = variants.find((candidate) => candidate.key === key) ?? firstInStock;
  const offer = variant?.offers[0];
  if (!variant || !offer) return null;
  const inStock = offer.available > 0;
  const low = inStock && offer.available <= 3;

  return (
    <div className="space-y-lg" data-testid="buy-box">
      {variants.length > 1 ? (
        <fieldset className="hz-variant-picker" data-testid="variant-picker">
          <legend className="hz-variant-picker__legend">
            {variantNameFa} <span className="hz-variant-picker__value">{variant.labelFa}</span>
          </legend>
          <div className="hz-variant-picker__options">
            {variants.map((candidate) => {
              const best = candidate.offers[0];
              const out = !best || best.available <= 0;
              return (
                <label key={candidate.key} className="hz-variant">
                  <input
                    type="radio"
                    name="variant"
                    value={candidate.key}
                    checked={candidate.key === variant.key}
                    disabled={out}
                    aria-describedby={out ? 'variant-out-' + candidate.key : undefined}
                    onChange={() => {
                      setKey(candidate.key);
                      setQuantity(1);
                    }}
                  />
                  <span className="hz-variant__label">{candidate.labelFa}</span>
                  {best ? <span className="hz-variant__price">{best.priceFa + ' تومان'}</span> : null}
                  {out ? (
                    <span className="hz-variant__note" id={'variant-out-' + candidate.key}>
                      ناموجود
                    </span>
                  ) : (
                    <span className="hz-variant__check" aria-hidden="true" />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="hz-variant-summary" aria-live="polite">
        <div className="hz-price hz-price--lg" data-testid="product-price">
          <span className="hz-price__amount">{offer.priceFa}</span>
          <span className="hz-price__unit">تومان</span>
        </div>
        <span className={['hz-stock', !inStock ? 'hz-stock--out' : low ? 'hz-stock--low' : 'hz-stock--in'].join(' ')}>
          {!inStock ? 'ناموجود' : low ? 'فقط ' + fa(offer.available) + ' عدد باقی مانده' : 'موجود'}
        </span>
      </div>

      {signedIn && inStock ? (
        <form action={submit} className="space-y-sm" data-testid={'add-to-cart-form-' + offer.skuId}>
          <input type="hidden" name="skuId" value={offer.skuId} />
          <input type="hidden" name="quantity" value={quantity} />
          <div className="flex items-center gap-md">
            <QuantityStepper
              key={offer.skuId}
              max={offer.available}
              value={quantity}
              onChange={setQuantity}
              label={'تعداد ' + productNameFa}
              testId={'add-quantity-' + offer.skuId}
            />
            <Button type="submit" size="lg" className="flex-1" disabled={pending} aria-busy={pending || undefined} data-testid={'add-to-cart-' + offer.skuId}>
              {pending ? 'در حال افزودن…' : 'افزودن به سبد'}
            </Button>
          </div>
          {state.message ? (
            <div data-testid={'add-to-cart-result-' + offer.skuId}>
              <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
            </div>
          ) : null}
        </form>
      ) : null}

      <article className="hz-card hz-seller" aria-labelledby="buy-seller-name" data-testid={'offer-' + offer.offerId}>
        <div className="hz-entity">
          <div className="hz-entity__body">
            <span className="hz-caption">فروشنده</span>
            <h2 className="hz-entity__name" id="buy-seller-name">
              {offer.sellerNameFa}
            </h2>
            {offer.sellerMetaFa ? <span className="hz-entity__meta">{offer.sellerMetaFa}</span> : null}
          </div>
        </div>
      </article>
    </div>
  );
}
