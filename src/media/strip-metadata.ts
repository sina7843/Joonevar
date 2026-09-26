/**
 * Public rendition of an uploaded picture — PHASE-4 PROMPT-003.
 *
 * A phone photo carries EXIF, often with the GPS position of the owner's home.
 * The finder never serves the original; it serves this copy, with every
 * metadata segment removed and the pixels untouched. There is no image
 * library in the project and none is needed for this: JPEG and PNG both keep
 * metadata in self-describing blocks that can be dropped whole.
 *
 *  - JPEG: APP1–APP15 and COM segments are dropped; APP0 (JFIF) and every
 *    segment that describes the image are kept, and everything from SOS on is
 *    copied as is.
 *  - PNG: tEXt, zTXt, iTXt, eXIf and tIME chunks are dropped; every other chunk
 *    keeps its own CRC.
 *
 * Anything that does not parse is refused rather than passed through, because
 * passing it through would publish exactly what this exists to remove.
 */
import { validation } from '../domain/errors.ts';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROPPED = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

export function stripImageMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpeg(bytes);
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return stripPng(bytes);
  throw validation('فقط تصویر JPEG یا PNG پذیرفته می‌شود.');
}

function unreadable(): never {
  throw validation('فایل تصویر خوانا نیست؛ تصویر دیگری انتخاب کنید.');
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) unreadable();
    const marker = bytes[i + 1]!;
    // Fill bytes between segments.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Start of scan: the rest is entropy-coded data up to EOI; copy it as is.
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      return concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(i, i + 2));
      return concat(parts);
    }
    if (i + 3 >= bytes.length) unreadable();
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2 || i + 2 + length > bytes.length) unreadable();
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) parts.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return unreadable();
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const end = i + 12 + length;
    if (end > bytes.length) unreadable();
    if (!PNG_DROPPED.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return concat(parts);
  }
  return unreadable();
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
