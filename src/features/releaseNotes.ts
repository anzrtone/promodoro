/**
 * GitHub release notes are markdown. We only draw a small safe subset (headings, bullets, paragraphs, **bold**
 * and `code`) as plain React text, so a release body can never inject markup or links into the app.
 */
export type NoteBlock = { type: 'h' | 'li' | 'p'; text: string };
export type Inline = { text: string; bold?: boolean; code?: boolean };

export function parseNotes(md: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const li = /^(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (h) (flush(), out.push({ type: 'h', text: h[1] }));
    else if (li) (flush(), out.push({ type: 'li', text: li[1] }));
    else para.push(line);
  }
  flush();
  return out;
}

/** Split a line into plain / bold / code runs. Links and images are reduced to their text. */
export function parseInline(text: string): Inline[] {
  const clean = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    if (m.index > last) out.push({ text: clean.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], code: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) out.push({ text: clean.slice(last) });
  return out;
}
