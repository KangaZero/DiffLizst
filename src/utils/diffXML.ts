export type DiffLineType = 'add' | 'remove' | 'context';

export type DiffLine = {
  type: DiffLineType;
  content: string;
};

export type ElementDiff = {
  changeType: 'add' | 'remove' | 'change';
  label: string; // e.g. "measure 5" or "credit 0"
  lines: DiffLine[];
};

export type XMLDiffResult = {
  measures: Map<number, ElementDiff>; // keyed by measure number
  credits: Map<number, ElementDiff>;  // keyed by index
};

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const dp = lcs(oldLines, newLines);
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'context', content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', content: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'remove', content: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

// Trim to changed lines + N surrounding context lines, like git diff -UN
function trimContext(lines: DiffLine[], context = 2): DiffLine[] {
  const changedIndices = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== 'context') changedIndices.add(i);
  });

  const keep = new Set<number>();
  for (const idx of changedIndices) {
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
      keep.add(k);
    }
  }

  const result: DiffLine[] = [];
  let prev = -1;
  for (const idx of [...keep].sort((a, b) => a - b)) {
    if (prev !== -1 && idx > prev + 1) {
      result.push({ type: 'context', content: '...' });
    }
    result.push(lines[idx]);
    prev = idx;
  }
  return result;
}

function elementDiff(old: Element, next: Element, label: string): ElementDiff | null {
  const s1 = new XMLSerializer().serializeToString(old);
  const s2 = new XMLSerializer().serializeToString(next);
  if (s1 === s2) return null;

  const lines1 = s1.split('\n').map(l => l.trimEnd());
  const lines2 = s2.split('\n').map(l => l.trimEnd());
  const all = diffLines(lines1, lines2);
  return { changeType: 'change', label, lines: trimContext(all, 2) };
}

export function diffXML(xml1: string, xml2: string): XMLDiffResult {
  const parser = new DOMParser();
  const doc1 = parser.parseFromString(xml1, 'application/xml');
  const doc2 = parser.parseFromString(xml2, 'application/xml');

  const measures = new Map<number, ElementDiff>();
  const credits = new Map<number, ElementDiff>();

  const measureMap1 = new Map<number, Element>();
  const measureMap2 = new Map<number, Element>();

  doc1.querySelectorAll('measure').forEach(m => {
    measureMap1.set(parseInt(m.getAttribute('number') ?? '0', 10), m);
  });
  doc2.querySelectorAll('measure').forEach(m => {
    measureMap2.set(parseInt(m.getAttribute('number') ?? '0', 10), m);
  });

  for (const num of new Set([...measureMap1.keys(), ...measureMap2.keys()])) {
    const m1 = measureMap1.get(num);
    const m2 = measureMap2.get(num);

    if (m1 && m2) {
      const d = elementDiff(m1, m2, `measure ${num}`);
      if (d) measures.set(num, d);
    } else if (m1) {
      const lines = new XMLSerializer().serializeToString(m1).split('\n')
        .filter(l => l.trim()).map(l => ({ type: 'remove' as const, content: l }));
      measures.set(num, { changeType: 'remove', label: `measure ${num}`, lines });
    } else if (m2) {
      const lines = new XMLSerializer().serializeToString(m2).split('\n')
        .filter(l => l.trim()).map(l => ({ type: 'add' as const, content: l }));
      measures.set(num, { changeType: 'add', label: `measure ${num}`, lines });
    }
  }

  const credits1 = Array.from(doc1.querySelectorAll('credit'));
  const credits2 = Array.from(doc2.querySelectorAll('credit'));

  for (let i = 0; i < Math.max(credits1.length, credits2.length); i++) {
    const c1 = credits1[i];
    const c2 = credits2[i];

    if (c1 && c2) {
      const d = elementDiff(c1, c2, `credit ${i}`);
      if (d) credits.set(i, d);
    } else if (c1) {
      const lines = new XMLSerializer().serializeToString(c1).split('\n')
        .filter(l => l.trim()).map(l => ({ type: 'remove' as const, content: l }));
      credits.set(i, { changeType: 'remove', label: `credit ${i}`, lines });
    } else if (c2) {
      const lines = new XMLSerializer().serializeToString(c2).split('\n')
        .filter(l => l.trim()).map(l => ({ type: 'add' as const, content: l }));
      credits.set(i, { changeType: 'add', label: `credit ${i}`, lines });
    }
  }

  return { measures, credits };
}
