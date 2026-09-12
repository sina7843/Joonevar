/**
 * The content formatting language.
 *
 * Two things are worth pinning: that authors get the structure they typed, and
 * that nothing they type becomes markup or a dangerous address. The second is
 * the reason this parser exists at all, so it is tested with the payloads people
 * actually paste, not with a comment claiming it is safe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseRichText, richTextToPlain, safeHref } from '../../src/content/rich-text.ts';

test('an author gets the blocks they typed', () => {
  const blocks = parseRichText(
    ['## عنوان بخش', '', 'یک بند ساده.', '', '- مورد اول', '- مورد دوم', '', '> نقل قول', '', '1. گام یک', '2. گام دو'].join('\n'),
  );
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'paragraph', 'list', 'quote', 'list'],
  );
  const heading = blocks[0]!;
  const bullets = blocks[2]!;
  const numbered = blocks[4]!;
  assert.equal(heading.kind === 'heading' && heading.level, 2);
  assert.equal(bullets.kind === 'list' && bullets.ordered, false);
  assert.equal(numbered.kind === 'list' && numbered.ordered, true);
  assert.equal(bullets.kind === 'list' ? bullets.items.length : 0, 2);
});

test('emphasis and links are marks, and an unclosed marker stays a character', () => {
  const nodes = parseInline('متن **پررنگ** و *مورب* و [پیوند](/breeds) و یک ستاره * تنها');
  assert.deepEqual(
    nodes.map((node) => node.kind),
    ['text', 'bold', 'text', 'italic', 'text', 'link', 'text'],
  );
  const link = nodes.find((node) => node.kind === 'link');
  assert.equal(link?.kind === 'link' && link.href, '/breeds');
  // The lone star is text, not the start of something the author did not finish.
  assert.ok(nodes.some((node) => node.kind === 'text' && node.value.includes('*')));
});

test('markup an author pastes stays text', () => {
  const blocks = parseRichText('<script>alert(1)</script> و <img src=x onerror=alert(1)>');
  assert.equal(blocks.length, 1);
  const paragraph = blocks[0]!;
  assert.equal(paragraph.kind, 'paragraph');
  const text = paragraph.kind === 'paragraph' ? paragraph.children.map((n) => (n.kind === 'text' ? n.value : '')).join('') : '';
  // The characters survive exactly; the renderer prints them, it never runs them.
  assert.ok(text.includes('<script>'));
  assert.ok(text.includes('onerror=alert(1)'));
});

test('an address that is not the web or this site is refused', () => {
  assert.equal(safeHref('/places'), '/places');
  assert.equal(safeHref('https://fci.be/standard.pdf'), 'https://fci.be/standard.pdf');
  assert.equal(safeHref('http://example.org'), 'http://example.org');

  for (const refused of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example', ' ']) {
    assert.equal(safeHref(refused), null, refused);
  }
});

test('a refused link keeps its words instead of disappearing', () => {
  const nodes = parseInline('برای اطلاعات [اینجا](javascript:alert(1)) را ببینید');
  assert.equal(
    nodes.some((node) => node.kind === 'link'),
    false,
  );
  const text = nodes.map((node) => (node.kind === 'text' ? node.value : '')).join('');
  assert.ok(text.includes('اینجا'), 'the sentence still reads');
});

test('the plain words can be read back out for a summary or an index', () => {
  const plain = richTextToPlain('## عنوان\n\nمتن **پررنگ** با [پیوند](/x).\n\n- مورد');
  assert.ok(plain.includes('عنوان'));
  assert.ok(plain.includes('پررنگ'));
  assert.ok(plain.includes('مورد'));
  assert.ok(!plain.includes('**'), 'the markers are gone');
  assert.ok(!plain.includes('](/x)'), 'the address is not part of the words');
});
