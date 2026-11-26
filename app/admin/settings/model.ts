import type { SettingGroupName } from '../../../src/authz/policy.ts';
import type { SettingRecord } from '../../../src/settings/service.ts';
import { displaySetting } from '../../../src/settings/display.ts';

/** Group labels (DS P11: «proposed labels to confirm»; presentation only). */
export const GROUP_FA: Record<SettingGroupName, string> = {
  FEES: 'تعرفه‌ها',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  DEADLINES: 'مهلت‌ها',
  REFERENCE_DATA: 'داده‌های پایه',
  GUIDE_TEXT: 'متن‌های راهنما',
  INTEGRATIONS: 'اتصال‌ها',
  OTP_TECHNICAL: 'ورود و امنیت',
  BREEDING_POLICY: 'سیاست پرورش',
  MODERATION: 'نظارت محتوا',
  ADVERTISING: 'تبلیغات',
  ANIMAL_MARKET: 'بازار حیوان',
  COMMERCE: 'فروشگاه',
  SETTLEMENT: 'تسویه',
  MARKETPLACE_OPERATIONS: 'عملیات بازار',
  MATING_FINDER: 'جفت‌یابی',
};

/** The row data the client row needs; the raw form is what the operator types. */
export function rowData(setting: SettingRecord, groupFa?: string) {
  return {
    key: setting.key,
    labelFa: setting.labelFa,
    kind: setting.kind,
    configured: setting.configured,
    raw: setting.configured ? (typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)) : '',
    display: displaySetting(setting),
    version: setting.version,
    groupFa,
  };
}

