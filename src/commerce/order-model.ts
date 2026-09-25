/**
 * What an order is allowed to do, and what its money adds up to — PROMPT-010.
 *
 * Everything here is arithmetic and rules, with no database in sight, so the
 * parts that are easy to get quietly wrong — a commission rounded the generous
 * way, a status moved by somebody it does not belong to, a refund that returns
 * more than was paid — can be read and tested on their own.
 */

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SUB_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED_BY_SELLER',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURNED',
  'CANCELLED',
  'REFUNDED',
  'DISPUTED',
] as const;
export type SubOrderStatus = (typeof SUB_ORDER_STATUSES)[number];

export const ORDER_STATUS_FA: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  CANCELLED: 'لغوشده',
  REFUNDED: 'بازپرداخت‌شده',
};

export const SUB_ORDER_STATUS_FA: Record<SubOrderStatus, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'در انتظار پذیرش فروشنده',
  ACCEPTED_BY_SELLER: 'پذیرفته‌شده',
  PREPARING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  RETURN_REQUESTED: 'درخواست مرجوعی',
  RETURNED: 'مرجوع‌شده',
  CANCELLED: 'لغوشده',
  REFUNDED: 'بازپرداخت‌شده',
  DISPUTED: 'در حال بررسی اختلاف',
};

/** Who is allowed to make a move, rather than merely to see it. */
export type OrderMover = 'BUYER' | 'SELLER' | 'OPERATOR' | 'SYSTEM';

interface Transition {
  readonly to: SubOrderStatus;
  readonly by: readonly OrderMover[];
}

/**
 * The sub-order's life.
 *
 * `SYSTEM` is not a shortcut for "the code did it": it means no person decided,
 * which is true of exactly two moves — a verified payment, and an acceptance
 * deadline passing. Neither is a button, so neither is open to a person.
 */
const TRANSITIONS: Record<SubOrderStatus, readonly Transition[]> = {
  PENDING_PAYMENT: [
    { to: 'PAID', by: ['SYSTEM'] },
    { to: 'CANCELLED', by: ['BUYER', 'OPERATOR', 'SYSTEM'] },
  ],
  PAID: [
    { to: 'ACCEPTED_BY_SELLER', by: ['SELLER'] },
    // The shop can refuse, and the deadline refuses on its behalf.
    { to: 'CANCELLED', by: ['SELLER', 'OPERATOR', 'SYSTEM'] },
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  ACCEPTED_BY_SELLER: [
    { to: 'PREPARING', by: ['SELLER'] },
    { to: 'CANCELLED', by: ['SELLER', 'OPERATOR'] },
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  PREPARING: [
    { to: 'SHIPPED', by: ['SELLER'] },
    { to: 'CANCELLED', by: ['SELLER', 'OPERATOR'] },
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  SHIPPED: [
    // The buyer confirms; the shop may record a delivery it has proof of.
    { to: 'DELIVERED', by: ['BUYER', 'SELLER', 'OPERATOR'] },
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  DELIVERED: [
    { to: 'RETURN_REQUESTED', by: ['BUYER'] },
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  RETURN_REQUESTED: [
    { to: 'RETURNED', by: ['SELLER', 'OPERATOR'] },
    // A refused return is a disagreement, not a closed matter.
    { to: 'DISPUTED', by: ['BUYER', 'SELLER', 'OPERATOR'] },
  ],
  RETURNED: [{ to: 'REFUNDED', by: ['OPERATOR', 'SYSTEM'] }],
  CANCELLED: [{ to: 'REFUNDED', by: ['OPERATOR', 'SYSTEM'] }],
  REFUNDED: [],
  DISPUTED: [
    // A decided dispute goes back into the ordinary life of the order.
    { to: 'REFUNDED', by: ['OPERATOR'] },
    { to: 'DELIVERED', by: ['OPERATOR'] },
    { to: 'CANCELLED', by: ['OPERATOR'] },
  ],
};

export const subOrderTransitionAllowed = (from: SubOrderStatus, to: SubOrderStatus, by: OrderMover): boolean =>
  TRANSITIONS[from].some((t) => t.to === to && t.by.includes(by));

export const subOrderMovesFor = (from: SubOrderStatus, by: OrderMover): readonly SubOrderStatus[] =>
  TRANSITIONS[from].filter((t) => t.by.includes(by)).map((t) => t.to);

/** Nothing about a sub-order moves any more once it is here. */
export const subOrderIsFinal = (status: SubOrderStatus): boolean => TRANSITIONS[status].length === 0;

/** The shop still owes goods: money for it is not the platform's to settle. */
export const subOrderIsOpen = (status: SubOrderStatus): boolean =>
  !['DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED'].includes(status);

/** Money went back, or is going back, rather than through. */
export const subOrderEndedInRefund = (status: SubOrderStatus): boolean =>
  status === 'REFUNDED' || status === 'RETURNED' || status === 'CANCELLED';

/**
 * What the parent says, read from its children.
 *
 * The parent is never moved by hand after payment. It has exactly one job
 * afterwards: to say that every part of it ended with the money going back,
 * which is the only sentence about the whole order that is still true when the
 * sub-orders disagree with each other.
 */
export function parentStatusFrom(
  paid: boolean,
  subStatuses: readonly SubOrderStatus[],
): OrderStatus {
  if (!paid) return 'PENDING_PAYMENT';
  if (subStatuses.length > 0 && subStatuses.every((status) => status === 'REFUNDED')) return 'REFUNDED';
  return 'PAID';
}

// ── money ──────────────────────────────────────────────────────────────────

export interface LinePrice {
  readonly unitPriceToman: bigint;
  readonly quantity: number;
  readonly discountToman?: bigint;
}

/** One line, to the toman. A discount is subtracted from the line, never from a rate. */
export function lineTotal(line: LinePrice): bigint {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError('quantity must be a positive integer');
  }
  const gross = line.unitPriceToman * BigInt(line.quantity);
  const discount = line.discountToman ?? 0n;
  if (discount < 0n || discount > gross) throw new RangeError('discount must be between zero and the line');
  return gross - discount;
}

/**
 * The shop's delivery charge for this basket.
 *
 * A null fee is not free: it means the shop never said, and the caller is
 * expected to refuse the checkout rather than bill nothing. A threshold of
 * null means the shop has no free-delivery offer, which is different from a
 * threshold of zero — that one makes everything free.
 */
export function shippingFor(input: {
  feeToman: bigint | null;
  freeThresholdToman: bigint | null;
  itemsTotalToman: bigint;
}): { toman: bigint; waived: boolean } | null {
  if (input.feeToman === null) return null;
  if (input.feeToman < 0n) throw new RangeError('a delivery charge cannot be negative');
  if (input.freeThresholdToman !== null && input.itemsTotalToman >= input.freeThresholdToman) {
    return { toman: 0n, waived: true };
  }
  return { toman: input.feeToman, waived: false };
}

/**
 * The platform's share of one sub-order.
 *
 * Truncating division, so a fraction of a toman is never charged upward: the
 * platform takes the smaller side of the rounding, the shop the larger. The
 * minimum, when the shop's plan has one, is a floor on the figure rather than
 * something added to it — and it can never exceed what the buyer paid, because
 * a commission larger than the sale would make the payout negative.
 */
export function commissionFor(input: {
  buyerTotalToman: bigint;
  percentBp: number;
  minimumToman?: bigint | null;
}): bigint {
  if (!Number.isInteger(input.percentBp) || input.percentBp < 0 || input.percentBp > 10_000) {
    throw new RangeError('the commission percentage must be between 0 and 10000 basis points');
  }
  if (input.buyerTotalToman <= 0n) throw new RangeError('a sub-order total must be positive');
  const percentage = (input.buyerTotalToman * BigInt(input.percentBp)) / 10_000n;
  const minimum = input.minimumToman ?? 0n;
  const raised = percentage > minimum ? percentage : minimum;
  return raised > input.buyerTotalToman ? input.buyerTotalToman : raised;
}

export interface SubOrderMoney {
  readonly itemsTotalToman: bigint;
  readonly discountToman: bigint;
  readonly shippingToman: bigint;
  readonly buyerTotalToman: bigint;
  readonly commissionToman: bigint;
  readonly payoutToman: bigint;
}

/** One shop's figures, complete and self-consistent before anything is written. */
export function subOrderMoney(input: {
  lines: readonly LinePrice[];
  shippingToman: bigint;
  commissionPercentBp: number;
  commissionMinimumToman?: bigint | null;
}): SubOrderMoney {
  const itemsGross = input.lines.reduce((sum, line) => sum + line.unitPriceToman * BigInt(line.quantity), 0n);
  const discount = input.lines.reduce((sum, line) => sum + (line.discountToman ?? 0n), 0n);
  const itemsNet = input.lines.reduce((sum, line) => sum + lineTotal(line), 0n);
  if (itemsNet !== itemsGross - discount) throw new RangeError('the line totals do not add up');
  const buyerTotal = itemsNet + input.shippingToman;
  const commission = commissionFor({
    buyerTotalToman: buyerTotal,
    percentBp: input.commissionPercentBp,
    minimumToman: input.commissionMinimumToman ?? null,
  });
  return {
    itemsTotalToman: itemsGross,
    discountToman: discount,
    shippingToman: input.shippingToman,
    buyerTotalToman: buyerTotal,
    commissionToman: commission,
    payoutToman: buyerTotal - commission,
  };
}

/**
 * The order's figures, which are the sum of its sub-orders and nothing else.
 *
 * This is why nothing has to be allocated: a parent that is a sum cannot
 * disagree with its parts, whereas a parent total split back across them by
 * percentage always can, by however much the rounding costs.
 */
export function orderMoney(parts: readonly SubOrderMoney[]): {
  itemsTotalToman: bigint;
  discountTotalToman: bigint;
  shippingTotalToman: bigint;
  grandTotalToman: bigint;
} {
  if (parts.length === 0) throw new RangeError('an order has at least one sub-order');
  const itemsTotalToman = parts.reduce((sum, part) => sum + part.itemsTotalToman, 0n);
  const discountTotalToman = parts.reduce((sum, part) => sum + part.discountToman, 0n);
  const shippingTotalToman = parts.reduce((sum, part) => sum + part.shippingToman, 0n);
  const grandTotalToman = parts.reduce((sum, part) => sum + part.buyerTotalToman, 0n);
  if (grandTotalToman !== itemsTotalToman - discountTotalToman + shippingTotalToman) {
    throw new RangeError('the order total does not add up');
  }
  return { itemsTotalToman, discountTotalToman, shippingTotalToman, grandTotalToman };
}

/**
 * What goes back when one shop's part of an order falls through.
 *
 * The whole of that shop's part, including its delivery charge, because the
 * buyer is not receiving a delivery either. The other shops in the same order
 * are untouched: that is the point of the sub-order existing.
 */
export const refundableFor = (part: { buyerTotalToman: bigint }): bigint => part.buyerTotalToman;

// ── what changed between seeing a basket and paying for it ─────────────────

export type BasketChangeKind =
  | 'PRICE_CHANGED'
  | 'STOCK_SHORT'
  | 'UNAVAILABLE'
  | 'SELLER_UNAVAILABLE'
  | 'SHIPPING_UNKNOWN'
  | 'SHIPPING_CHANGED';

export interface BasketChange {
  readonly kind: BasketChangeKind;
  readonly skuId: string | null;
  readonly sellerId: string | null;
  readonly labelFa: string;
  readonly detailFa: string;
  /** False when the buyer can go on without this line; true when they cannot. */
  readonly blocking: boolean;
}

export const CHANGE_TITLE_FA: Record<BasketChangeKind, string> = {
  PRICE_CHANGED: 'قیمت تغییر کرده',
  STOCK_SHORT: 'موجودی کافی نیست',
  UNAVAILABLE: 'این قلم دیگر قابل خرید نیست',
  SELLER_UNAVAILABLE: 'این فروشگاه در حال حاضر فروش ندارد',
  SHIPPING_UNKNOWN: 'هزینه ارسال این فروشگاه اعلام نشده',
  SHIPPING_CHANGED: 'هزینه ارسال تغییر کرده',
};

/**
 * Whether a basket may go to the gateway as it stands.
 *
 * A changed price is not an error and not a silent correction: it is shown,
 * and the buyer agrees to the new figure or does not. Anything that cannot be
 * bought at all stops the checkout until that line is taken out, because
 * paying for it and sorting it out afterwards is the worst of both.
 */
export const checkoutBlocked = (changes: readonly BasketChange[]): boolean =>
  changes.some((change) => change.blocking);

/**
 * The exact figure the buyer last saw, as the form carries it back.
 *
 * Confirmation is per figure, not per basket: a buyer who agreed to 480,000
 * has agreed to that number and nothing else, so if it moves again between the
 * confirmation and the gateway, the confirmation is stale and the checkout
 * stops rather than charging the newer amount.
 */
export const confirmationMatches = (confirmedToman: bigint | null, currentToman: bigint): boolean =>
  confirmedToman !== null && confirmedToman === currentToman;

/** Long enough to reach a gateway and come back; short enough not to hoard the last bag. */
export const CHECKOUT_HOLD_MINUTES = 30;

/** A person can only be said to have refused by silence after the shop's deadline. */
export const acceptanceDeadline = (paidAt: Date, windowHours: number): Date => {
  if (!Number.isInteger(windowHours) || windowHours <= 0) throw new RangeError('the window must be whole hours');
  return new Date(paidAt.getTime() + windowHours * 3_600_000);
};

export const acceptanceOverdue = (dueAt: Date | null, now: Date = new Date()): boolean =>
  dueAt !== null && dueAt.getTime() <= now.getTime();

/**
 * What one seller may know about the person they are shipping to.
 *
 * A name, a telephone number and an address are needed to deliver a parcel.
 * Which other shops were in the same basket, what was bought from them and
 * what the whole order came to are not, so they are not here.
 */
export interface FulfillmentContact {
  readonly recipientNameFa: string;
  readonly recipientPhone: string;
  readonly provinceFa: string | null;
  readonly cityFa: string | null;
  readonly addressFa: string;
  readonly postalCode: string | null;
  readonly noteFa: string | null;
}

export const fulfillmentContactOf = (order: FulfillmentContact): FulfillmentContact => ({
  recipientNameFa: order.recipientNameFa,
  recipientPhone: order.recipientPhone,
  provinceFa: order.provinceFa,
  cityFa: order.cityFa,
  addressFa: order.addressFa,
  postalCode: order.postalCode,
  noteFa: order.noteFa,
});

/** An order reference a person can read down a telephone without spelling hex. */
export function orderReference(now: Date, random: string): string {
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const tail = random.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 6).padEnd(6, '0');
  return 'HS' + year + month + '-' + tail;
}

export const subOrderReference = (orderReferenceValue: string, index: number): string =>
  orderReferenceValue + '-' + (index + 1).toString().padStart(2, '0');
