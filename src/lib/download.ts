// Client-side downloads for agent results and images (no server, nothing stored).
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'nts';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadMarkdown(title: string, text: string) {
  save(new Blob([`# ${title}\n\n${text}\n`], { type: 'text/markdown;charset=utf-8' }), `${slug(title)}.md`);
}

/** Plain, readable PDF (jsPDF is loaded only when needed). Markdown marks are cleaned. */
export async function downloadPdf(title: string, text: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  // core PDF fonts are Latin-1 only: drop emoji / other scripts instead of printing garbage
  const clean = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|\s)[*_](.+?)[*_](?=\s|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
  let y = M;
  const line = (t: string, size: number, bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(t, W - 2 * M) as string[]) {
      if (y > H - M) {
        doc.addPage();
        y = M;
      }
      doc.text(l, M, y);
      y += size + gap;
    }
  };
  doc.setTextColor(23, 25, 29);
  line(clean(title), 16, true, 6);
  doc.setTextColor(120, 120, 120);
  line(`NIKHILs TECH STUDIO · ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`, 9, false, 14);
  doc.setTextColor(23, 25, 29);
  for (const raw of text.split('\n')) {
    const h = raw.match(/^#{1,6}\s+(.*)/);
    if (h) line(clean(h[1]), 12.5, true, 5);
    else if (!raw.trim()) y += 6;
    else if (/^\s*\|?\s*:?-{3,}/.test(raw)) continue;
    else line(clean(raw.replace(/^\s*[-*]\s+/, '• ')), 10.5);
  }
  doc.save(`${slug(title)}.pdf`);
}

export function downloadImage(title: string, mime: string, b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  save(new Blob([bytes], { type: mime }), `${slug(title)}.${ext}`);
}
