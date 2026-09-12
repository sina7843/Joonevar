/**
 * The small formatting language the content body accepts.
 *
 * The safe part is not the allowlist, it is the shape: this parser never
 * produces HTML. It produces a tree of blocks and inline marks that the renderer
 * turns into React elements, so nothing an author types can become markup.
 * There is no `dangerouslySetInnerHTML` anywhere in the path, which means a
 * pasted `<script>` is text about a script and nothing else. That is a stronger
 * guarantee than sanitising HTML, and it needs no library (DEC-0184).
 *
 * What is supported is what a Persian article actually needs: headings, lists,
 * quotes, emphasis and links. Anything else stays literal, because an author who
 * types a character should see that character.
 */

export interface TextNode {
  readonly kind: 'text';
  readonly value: string;
}
export interface MarkNode {
  readonly kind: 'bold' | 'italic';
  readonly children: readonly InlineNode[];
}
export interface LinkNode {
  readonly kind: 'link';
  readonly href: string;
  readonly children: readonly InlineNode[];
}
export type InlineNode = TextNode | MarkNode | LinkNode;

export type Block =
  | { readonly kind: 'paragraph'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'heading'; readonly level: 2 | 3; readonly children: readonly InlineNode[] }
  | { readonly kind: 'quote'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly InlineNode[])[] };

/**
 * The addresses a link may point at.
 *
 * Only this site and the two web schemes. `javascript:`, `data:` and everything
 * else answer null, and the renderer then shows the text without a link rather
 * than a link that goes nowhere safe.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href === '') return null;
  // Site-relative, and never protocol-relative (`//evil.example` is not ours).
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  return null;
}

const BOLD = '**';

/** Inline marks, scanned left to right. Unclosed markers stay literal text. */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = '';
  let i = 0;

  const flush = () => {
    if (text !== '') {
      nodes.push({ kind: 'text', value: text });
      text = '';
    }
  };

  while (i < source.length) {
    const rest = source.slice(i);

    if (rest.startsWith(BOLD)) {
      const end = source.indexOf(BOLD, i + BOLD.length);
      if (end > i + BOLD.length) {
        flush();
        nodes.push({ kind: 'bold', children: parseInline(source.slice(i + BOLD.length, end)) });
        i = end + BOLD.length;
        continue;
      }
    }

    if (rest.startsWith('*')) {
      const end = source.indexOf('*', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ kind: 'italic', children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (rest.startsWith('[')) {
      const close = source.indexOf(']', i);
      const open = close >= 0 ? source.indexOf('(', close) : -1;
      const finish = open === close + 1 ? source.indexOf(')', open) : -1;
      if (close > i && finish > open) {
        const href = safeHref(source.slice(open + 1, finish));
        const label = source.slice(i + 1, close);
        flush();
        // A refused address keeps its text: the reader still reads the sentence.
        nodes.push(href === null ? { kind: 'text', value: label } : { kind: 'link', href, children: parseInline(label) });
        i = finish + 1;
        continue;
      }
    }

    text += source[i];
    i += 1;
  }

  flush();
  return nodes;
}

const isBullet = (line: string) => /^\s*[-*]\s+/.test(line);
const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line);
const stripMarker = (line: string) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '');

/** The body, as blocks. Paragraphs are separated by a blank line, as before. */
export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;

    if (lines.every(isBullet) || lines.every(isNumbered)) {
      blocks.push({
        kind: 'list',
        ordered: isNumbered(lines[0]!),
        items: lines.map((line) => parseInline(stripMarker(line))),
      });
      continue;
    }

    const first = lines[0]!;
    if (/^###\s+/.test(first)) {
      blocks.push({ kind: 'heading', level: 3, children: parseInline(first.replace(/^###\s+/, '')) });
      if (lines.length > 1) blocks.push({ kind: 'paragraph', children: parseInline(lines.slice(1).join(' ')) });
      continue;
    }
    if (/^##\s+/.test(first)) {
      blocks.push({ kind: 'heading', level: 2, children: parseInline(first.replace(/^##\s+/, '')) });
      if (lines.length > 1) blocks.push({ kind: 'paragraph', children: parseInline(lines.slice(1).join(' ')) });
      continue;
    }
    if (lines.every((line) => line.trimStart().startsWith('>'))) {
      blocks.push({
        kind: 'quote',
        children: parseInline(lines.map((line) => line.trimStart().replace(/^>\s?/, '')).join(' ')),
      });
      continue;
    }

    blocks.push({ kind: 'paragraph', children: parseInline(lines.join(' ')) });
  }
  return blocks;
}

/** The plain words of a body, for a summary or a search index. */
export function richTextToPlain(source: string): string {
  const words = (nodes: readonly InlineNode[]): string =>
    nodes
      .map((node) => (node.kind === 'text' ? node.value : words(node.children)))
      .join('');
  return parseRichText(source)
    .map((block) => (block.kind === 'list' ? block.items.map(words).join(' ') : words(block.children)))
    .join('\n')
    .trim();
}
