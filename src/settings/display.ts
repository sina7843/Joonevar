import type { SettingRecord } from './service.ts';

const fa = (value: number) => value.toLocaleString('fa-IR');

/** A managed value as the panel shows it; an unset value is «تعیین‌نشده», never zero. */
export function displaySetting(setting: Pick<SettingRecord, 'configured' | 'kind' | 'value'>): string {
  if (!setting.configured) return 'تعیین‌نشده';
  if (setting.kind === 'MONEY_TOMAN' && typeof setting.value === 'number') return fa(setting.value) + ' تومان';
  if (setting.kind === 'INT' && typeof setting.value === 'number') return fa(setting.value);
  if (setting.kind === 'BOOL') return setting.value === true ? 'فعال' : 'غیرفعال';
  return typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value);
}
