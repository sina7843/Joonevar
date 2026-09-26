/**
 * Upload validation. Files and provider callbacks are untrusted input.
 *
 * A declared Content-Type is a claim by the client, so the real check is the
 * magic bytes. Size ceilings and the accepted set come from the purpose:
 * §6.2 fixes KYC at JPG/PNG/PDF up to 10 MB.
 */
import { validation } from '../domain/errors.ts';
import type { FilePurposeName } from '../authz/policy.ts';

export type DetectedMime = 'image/jpeg' | 'image/png' | 'application/pdf' | 'video/mp4';

const MAGIC: ReadonlyArray<{ mime: DetectedMime; bytes: readonly number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

/**
 * MP4 does not start with a magic number: it starts with a box length, and the
 * type follows at offset 4. Checked separately rather than bent into the table
 * above, and accepted for exactly one purpose — the optional video of an animal
 * listing (PROMPT-003). Every other purpose still refuses it.
 */
const FTYP = [0x66, 0x74, 0x79, 0x70] as const; // 'ftyp'

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
  VET_PROFESSIONAL_DOCUMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  CENTRE_CLAIM_DOCUMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  // Public images of directory records: pictures only, never a document, and the
  // same ceiling a content image has, because they are served the same way.
  BREED_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  CENTRE_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  VET_PROFILE_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  COMMUNITY_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  // Listing photos are served the same way every other public image is.
  ANIMAL_LISTING_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  /*
   * The one place a video is accepted. The ceiling is deliberately small: this
   * is a short clip of one animal served whole through the ordinary media
   * route, not a video platform, and a larger allowance would need byte-range
   * serving and a storage decision nobody has taken.
   */
  ANIMAL_LISTING_VIDEO: { accept: ['video/mp4'], maxBytes: 20 * MB },
  /*
   * A picture or a document one side sends the other inside a deal thread —
   * a vaccination card, a photo of the animal today. Pictures and PDF only:
   * a chat is not a file-transfer channel, and every other type would be one
   * more thing served back to somebody through a route that has to stay small.
   */
  INQUIRY_ATTACHMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  /** Evidence in a deposit dispute: a photo, a receipt, a veterinary report. */
  DISPUTE_EVIDENCE: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  /** A business licence, an identity document or a bank proof (PROMPT-008). */
  SELLER_DOCUMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  /** A store's logo: a picture, never a document. */
  SELLER_LOGO: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  /** A product picture: images only, served the same way every public image is. */
  PRODUCT_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  RETURN_EVIDENCE: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 5 * MB },
  /*
   * Phase 4 mating profile. The original stays private; the rendition is the
   * same picture with its metadata (EXIF, GPS, text chunks) removed, and only
   * the rendition is ever served publicly. The clip has the listing clip's
   * ceiling and the same reasons for it.
   */
  MATING_PROFILE_IMAGE: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  MATING_PROFILE_RENDITION: { accept: ['image/jpeg', 'image/png'], maxBytes: 5 * MB },
  MATING_PROFILE_VIDEO: { accept: ['video/mp4'], maxBytes: 20 * MB },
  /** A picture or a document one owner sends the other in a finder conversation. */
  FINDER_MESSAGE_ATTACHMENT: { accept: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * MB },
  /** The rendered contract; written by the server only. */
  FINDER_CONTRACT_PDF: { accept: ['application/pdf'], maxBytes: 10 * MB },
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
  if (bytes.length >= 12 && FTYP.every((byte, i) => bytes[4 + i] === byte)) return 'video/mp4';
  return null;
}

export const EXTENSION: Record<DetectedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
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
    // The message names what this purpose accepts, not a fixed list: a listing
    // video and a national-id scan do not take the same files.
    const allowed = rule.accept.map((mime) => EXTENSION[mime].toUpperCase()).join('، ');
    throw validation('نوع فایل پذیرفته نمی‌شود. فقط ' + allowed + ' بارگذاری کنید.');
  }
  return detected;
}
