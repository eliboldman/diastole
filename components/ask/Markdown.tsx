import Link from "next/link";
import type { ReactNode } from "react";

// A small markdown renderer for Ask Diastole answers: paragraphs, bullet and numbered lists, small
// tables, **bold**, `code`, and links. Builds React elements (never raw HTML). Only in-app links
// ("/athlete/…", "/activity/…") become links; anything else shows as plain text.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={k} className="rounded bg-white/[0.08] px-1 text-[0.92em]">{part.slice(1, -1)}</code>;
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const href = m[2];
      return /^\/[a-z0-9/_#?=&-]*$/i.test(href) ? (
        <Link key={k} href={href} className="text-emerald-200 underline decoration-emerald-200/40 underline-offset-2 hover:decoration-emerald-200">
          {m[1]}
        </Link>
      ) : (
        <span key={k}>{m[1]}</span>
      );
    }
    return part;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    // Table: header row, separator row, body rows
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k} className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-max text-left text-sm tabular-nums">
            <thead className="text-xs text-white/50">
              <tr>{head.map((h, j) => <th key={j} className="py-1.5 pr-4 font-medium">{inline(h, `${k}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-white/[0.08]">
                  {r.map((c, j) => <td key={j} className="py-1.5 pr-4 text-white/85">{inline(c, `${k}r${ri}c${j}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Lists
    const bullet = /^\s*[-*•]\s+/;
    const num = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || num.test(line)) {
      const ordered = num.test(line);
      const re = ordered ? num : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const cls = `space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-white/40`;
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${k}l${j}`)}</li>);
      blocks.push(ordered ? <ol key={k} className={cls}>{lis}</ol> : <ul key={k} className={cls}>{lis}</ul>);
      continue;
    }
    // Headings become bold lines
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push(<p key={k} className="font-semibold text-white">{inline(line.replace(/^#{1,6}\s+/, ""), k)}</p>);
      i++;
      continue;
    }
    // Paragraph: consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !num.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
  }
  return <div className="space-y-3 text-[15px] leading-relaxed text-white/85">{blocks}</div>;
}
