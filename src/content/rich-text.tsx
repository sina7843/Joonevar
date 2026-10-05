import type { ReactNode } from 'react';
import { parseRichText, type Block, type InlineNode } from './rich-text.ts';

/**
 * Renders a content body.
 *
 * Every node becomes a React element, never a string of markup, so there is no
 * point in this file where author text could turn into HTML (DEC-0184).
 */
function inline(nodes: readonly InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === 'text') return <span key={index}>{node.value}</span>;
    if (node.kind === 'bold') return <strong key={index}>{inline(node.children)}</strong>;
    if (node.kind !== 'link') return <em key={index}>{inline(node.children)}</em>;
    const external = node.href.startsWith('http');
    return (
      <a
        key={index}
        href={node.href}
       
        // An address a reader supplied is never vouched for by the site.
        {...(external ? { rel: 'nofollow noopener noreferrer', target: '_blank' } : {})}
      >
        {inline(node.children)}
      </a>
    );
  });
}

function block(item: Block, index: number): ReactNode {
  if (item.kind === 'heading') {
    return item.level === 2 ? (
      <h2 key={index}>
        {inline(item.children)}
      </h2>
    ) : (
      <h3 key={index}>
        {inline(item.children)}
      </h3>
    );
  }
  if (item.kind === 'quote') {
    return (
      <blockquote key={index}>
        {inline(item.children)}
      </blockquote>
    );
  }
  if (item.kind === 'list') {
    const items = item.items.map((entry, i) => <li key={i}>{inline(entry)}</li>);
    return item.ordered ? (
      <ol key={index}>
        {items}
      </ol>
    ) : (
      <ul key={index} className="list-disc">
        {items}
      </ul>
    );
  }
  return <p key={index}>{inline(item.children)}</p>;
}

export function RichText({ source, className = '' }: { source: string; className?: string }) {
  return <div className={('hz-prose ' + className).trim()}>{parseRichText(source).map(block)}</div>;
}
