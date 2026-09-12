/**
 * Upload validation. Files and provider callbacks are untrusted input.
 *
 * A declared Content-Type is a claim by the client, so the real check is the
 * magic bytes. Size ceilings and the accepted set come from the purpose:
 * §6.2 fixes KYC at JPG/PNG/PDF up to 10 MB.
 */
import { validation } from '../domain/errors.ts';
import type { FilePurposeName } from '../authz/policy.ts';

export type DetectedMime = 'image/jpeg' | 'image/png' | 'application/pdf';

const MAGIC: ReadonlyArray<{ mime: DetectedMime; bytes: readonly number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

export const MB = 1024 * 1024;

export interface PurposeRule {
  readonly accept: readonly DetectedMime[];
  readonly maxBytes: number;
}

export const PURPOSE_RULES: Record<FilePurposeName, PurposeRule> = {
  KYC_NATIONAL_ID: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  FOREIGN_PEDIGREE_FRONT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  FOREIGN_PEDIGREE_BACK: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  GENETICS_RECEIPT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  ANIMAL_PHOTO: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  CONTENT_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  VET_APPLICATION_DOCUMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  CENTRE_CLAIM_DOCUMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  // Public images of directory records: pictures only, never a document, and the
  // same ceiling a content image has, because they are served the same way.
  BREED_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  CENTRE_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  VET_PROFILE_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  COMMUNITY_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
};

export function detectMime(bytes: Uint8Array): DetectedMime | null {
  for (const candidate of MAGIC) {
    if (bytes.length < candidate.bytes.length) continue;
    let matches = true;
    for (let i = 0; i < candidate.bytes.length; i += 1) {
      if (bytes[i] !== candidate.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return candidate.mime;
  }
  return null;
}

export const EXTENSION: Record<DetectedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

/** Returns the trusted mime, or throws with a reason the UI can show as an accessible error. */
export function assertAcceptable(purpose: FilePurposeName, bytes: Uint8Array): DetectedMime {
  const rule = PURPOSE_RULES[purpose];
  if (bytes.length === 0) throw validation('فایل خالی است.');
  if (bytes.length > rule.maxBytes) {
    throw validation('حجم فایل بیش از حد مجاز است (حداکثر ' + Math.floor(rule.maxBytes / MB) + ' مگابایت).');
  }
  const detected = detectMime(bytes);
  if (detected === null || !rule.accept.includes(detected)) {
    throw validation('نوع فایل پذیرفته نمی‌شود. فقط JPG، PNG یا PDF بارگذاری کنید.');
  }
  return detected;
}
