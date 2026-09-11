import { serializeJsonLd, type JsonLd } from './structured-data.ts';

/** Inline JSON-LD, escaped so a value can never close the script element. */
export function JsonLdScript({ data }: { data: JsonLd }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
