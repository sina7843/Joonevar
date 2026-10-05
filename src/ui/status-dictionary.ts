/**
 * Status dictionary — DS *Status dictionary* (docs/design-system/sample-content/
 * status-dictionary.json, 81 keys). One key = one Persian label + one tone for
 * every viewer; the tone is the family (draft/closed neutral, waiting info,
 * action warning, done success, blocked error). Who acts next is ActionOwner's
 * job, never the label's. Generated from the system file; do not edit by hand.
 */
import type { StatusTone } from './status.tsx';

export type StatusFamily = 'draft' | 'waiting' | 'action' | 'done' | 'blocked' | 'closed';

export interface StatusEntry {
  readonly labelFa: string;
  readonly tone: StatusTone;
  readonly family: StatusFamily;
}

export const STATUS_DICTIONARY = {
  DRAFT: { labelFa: 'پیش‌نویس', tone: 'neutral', family: 'draft' },
  READY_TO_SUBMIT: { labelFa: 'آماده ارسال', tone: 'neutral', family: 'draft' },
  INACTIVE: { labelFa: 'غیرفعال', tone: 'neutral', family: 'draft' },
  NONE: { labelFa: 'ثبت‌نشده', tone: 'neutral', family: 'draft' },
  SUBMITTED: { labelFa: 'در انتظار بررسی', tone: 'info', family: 'waiting' },
  UNDER_REVIEW: { labelFa: 'در حال بررسی', tone: 'info', family: 'waiting' },
  PENDING_REVIEW: { labelFa: 'در انتظار بررسی انجمن', tone: 'info', family: 'waiting' },
  WAITING_REVIEW: { labelFa: 'درخواست ارسال‌شده', tone: 'info', family: 'waiting' },
  PENDING_VERIFICATION: { labelFa: 'در انتظار بررسی', tone: 'info', family: 'waiting' },
  AWAITING_COUNTERPARTY: { labelFa: 'در انتظار تأیید طرف مقابل', tone: 'info', family: 'waiting' },
  PROCESSING: { labelFa: 'در حال پردازش', tone: 'info', family: 'waiting' },
  SCHEDULED: { labelFa: 'زمان‌بندی‌شده', tone: 'info', family: 'waiting' },
  PREPARING: { labelFa: 'در حال آماده‌سازی', tone: 'info', family: 'waiting' },
  ACCEPTED_BY_SELLER: { labelFa: 'پذیرفته‌شده', tone: 'info', family: 'waiting' },
  SHIPPED: { labelFa: 'ارسال‌شده', tone: 'info', family: 'waiting' },
  TECHNICAL_REVIEW: { labelFa: 'در مرحله تأیید فنی', tone: 'info', family: 'waiting' },
  WAITING_PARENT_RESULTS: { labelFa: 'در انتظار تکمیل نتایج والدین', tone: 'info', family: 'waiting' },
  NEGOTIATING: { labelFa: 'در حال مذاکره', tone: 'info', family: 'waiting' },
  CONTRACT_DRAFTING: { labelFa: 'ورود به قرارداد', tone: 'info', family: 'waiting' },
  PENDING: { labelFa: 'در جریان', tone: 'info', family: 'waiting' },
  OPEN: { labelFa: 'در انتظار بررسی', tone: 'info', family: 'waiting' },
  NEEDS_CORRECTION: { labelFa: 'نیازمند اصلاح', tone: 'warning', family: 'action' },
  AWAITING_PAYMENT: { labelFa: 'در انتظار پرداخت', tone: 'warning', family: 'action' },
  PENDING_PAYMENT: { labelFa: 'در انتظار پرداخت', tone: 'warning', family: 'action' },
  EXPIRED: { labelFa: 'منقضی', tone: 'warning', family: 'action' },
  PAUSED: { labelFa: 'موقتاً متوقف', tone: 'warning', family: 'action' },
  RETURN_REQUESTED: { labelFa: 'درخواست مرجوعی', tone: 'warning', family: 'action' },
  TEMPORARILY_UNAVAILABLE: { labelFa: 'موقتاً غیرفعال', tone: 'warning', family: 'action' },
  APPROVED: { labelFa: 'تأییدشده', tone: 'success', family: 'done' },
  ACTIVE: { labelFa: 'فعال', tone: 'success', family: 'done' },
  PUBLISHED: { labelFa: 'منتشرشده', tone: 'success', family: 'done' },
  ISSUED: { labelFa: 'صادر شد', tone: 'success', family: 'done' },
  PAID: { labelFa: 'پرداخت‌شده', tone: 'success', family: 'done' },
  VERIFIED: { labelFa: 'تأییدشده', tone: 'success', family: 'done' },
  COMPLETED: { labelFa: 'تحویل انجام و مالکیت منتقل شد', tone: 'success', family: 'done' },
  DELIVERED: { labelFa: 'تحویل‌شده', tone: 'success', family: 'done' },
  FINAL: { labelFa: 'نتیجه نهایی', tone: 'success', family: 'done' },
  VALID: { labelFa: 'معتبر', tone: 'success', family: 'done' },
  REGISTERED: { labelFa: null, tone: 'success', family: 'done' },
  CONFIRMED: { labelFa: 'وجود توافق تأیید شد', tone: 'success', family: 'done' },
  READY: { labelFa: 'آماده واریز', tone: 'success', family: 'done' },
  RESOLVED: { labelFa: 'تعیین تکلیف شد', tone: 'success', family: 'done' },
  ALIVE: { labelFa: 'زنده', tone: 'success', family: 'done' },
  REJECTED: { labelFa: 'ردشده', tone: 'error', family: 'blocked' },
  FAILED: { labelFa: 'ناموفق', tone: 'error', family: 'blocked' },
  SUSPENDED: { labelFa: 'تعلیق‌شده', tone: 'error', family: 'blocked' },
  REVOKED: { labelFa: 'باطل‌شده', tone: 'error', family: 'blocked' },
  DISPUTED: { labelFa: 'در حال بررسی اختلاف', tone: 'error', family: 'blocked' },
  DELETED: { labelFa: 'حذف‌شده', tone: 'error', family: 'blocked' },
  TERMINATED: { labelFa: 'خاتمه‌یافته', tone: 'error', family: 'blocked' },
  PAYMENT_FAILED: { labelFa: 'پرداخت ناموفق', tone: 'error', family: 'blocked' },
  CANCELLED: { labelFa: 'لغوشده', tone: 'neutral', family: 'closed' },
  WITHDRAWN: { labelFa: 'پس گرفته شد', tone: 'neutral', family: 'closed' },
  ARCHIVED: { labelFa: 'بایگانی‌شده', tone: 'neutral', family: 'closed' },
  REMOVED: { labelFa: 'برداشته‌شده', tone: 'neutral', family: 'closed' },
  SUPERSEDED: { labelFa: 'جایگزین‌شده', tone: 'neutral', family: 'closed' },
  SOLD: { labelFa: 'فروخته‌شده', tone: 'neutral', family: 'closed' },
  RESERVED: { labelFa: 'رزروشده', tone: 'neutral', family: 'closed' },
  REFUNDED: { labelFa: 'بازپرداخت‌شده', tone: 'neutral', family: 'closed' },
  RETURNED: { labelFa: 'مرجوع‌شده', tone: 'neutral', family: 'closed' },
  HIDDEN: { labelFa: 'پنهان', tone: 'neutral', family: 'closed' },
  DECEASED: { labelFa: 'فوت', tone: 'neutral', family: 'closed' },
  MERGED: { labelFa: 'ادغام‌شده در محصول پایه', tone: 'neutral', family: 'closed' },
  LEFT: { labelFa: 'خارج‌شده', tone: 'neutral', family: 'closed' },
  PROPOSED: { labelFa: 'در انتظار پاسخ', tone: 'info', family: 'waiting' },
  CODE_ISSUED: { labelFa: 'کد تحویل صادر شد', tone: 'info', family: 'waiting' },
  FINDER_INVITE_ONLY: { labelFa: 'فقط با دعوت', tone: 'info', family: 'waiting' },
  FINDER_UNAVAILABLE: { labelFa: 'موقتاً در دسترس نیست', tone: 'info', family: 'waiting' },
  COLLECTED: { labelFa: 'نمونه‌گیری انجام شد', tone: 'info', family: 'waiting' },
  SEND_INSTRUCTED: { labelFa: 'دستور ارسال صادر شد', tone: 'info', family: 'waiting' },
  SAMPLE_RECEIVED: { labelFa: 'دریافت‌شده در مرکز', tone: 'info', family: 'waiting' },
  RESAMPLED: { labelFa: 'نمونه‌گیری مجدد در همین درخواست', tone: 'info', family: 'waiting' },
  MARKED_UNUSABLE: { labelFa: 'نمونه غیرقابل‌استفاده ثبت شد', tone: 'warning', family: 'action' },
  ACCEPTED: { labelFa: 'پذیرفته‌شده', tone: 'success', family: 'done' },
  IN_STOCK: { labelFa: 'موجود', tone: 'success', family: 'done' },
  LOW_STOCK: { labelFa: 'فقط {n} عدد موجود', tone: 'success', family: 'done' },
  FINDER_READY: { labelFa: 'آماده دریافت درخواست', tone: 'success', family: 'done' },
  OVERTURNED: { labelFa: 'اعتراض پذیرفته شد', tone: 'success', family: 'done' },
  DECLINED: { labelFa: 'پذیرفته نشد', tone: 'neutral', family: 'closed' },
  CLOSED: { labelFa: 'بسته‌شده', tone: 'neutral', family: 'closed' },
  OUT_OF_STOCK: { labelFa: 'ناموجود', tone: 'neutral', family: 'closed' },
} as const satisfies Record<string, StatusEntry>;

export type StatusKey = keyof typeof STATUS_DICTIONARY;

export function statusOf(key: string): StatusEntry | null {
  return (STATUS_DICTIONARY as Record<string, StatusEntry>)[key] ?? null;
}
