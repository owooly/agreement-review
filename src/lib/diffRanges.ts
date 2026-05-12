import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

export type CharRange = { start: number; end: number };

export function mergeRanges(ranges: CharRange[]): CharRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: CharRange[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n.start <= cur.end) cur.end = Math.max(cur.end, n.end);
    else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

/** 왼쪽 문서: 삭제·변경(삭제된 부분) 구간 */
export function leftHighlightRanges(
  plainLeft: string,
  plainRight: string,
): CharRange[] {
  const diffs = dmp.diff_main(plainLeft, plainRight);
  dmp.diff_cleanupSemantic(diffs);
  const ranges: CharRange[] = [];
  let leftIndex = 0;
  for (const [op, text] of diffs) {
    const len = text.length;
    if (op === DIFF_EQUAL) leftIndex += len;
    else if (op === DIFF_DELETE) {
      ranges.push({ start: leftIndex, end: leftIndex + len });
      leftIndex += len;
    }
    // DIFF_INSERT: 왼쪽 문자열에 없음
  }
  return mergeRanges(ranges);
}

/** 오른쪽 문서: 삽입·변경(추가된 부분) 구간 */
export function rightHighlightRanges(
  plainLeft: string,
  plainRight: string,
): CharRange[] {
  const diffs = dmp.diff_main(plainLeft, plainRight);
  dmp.diff_cleanupSemantic(diffs);
  const ranges: CharRange[] = [];
  let rightIndex = 0;
  for (const [op, text] of diffs) {
    const len = text.length;
    if (op === DIFF_EQUAL) rightIndex += len;
    else if (op === DIFF_INSERT) {
      ranges.push({ start: rightIndex, end: rightIndex + len });
      rightIndex += len;
    }
    // DIFF_DELETE: 오른쪽에 없음
  }
  return mergeRanges(ranges);
}

export function diffSummary(
  plainLeft: string,
  plainRight: string,
): { equalChars: number; changedLeftChars: number; changedRightChars: number } {
  const diffs = dmp.diff_main(plainLeft, plainRight);
  dmp.diff_cleanupSemantic(diffs);
  let equalChars = 0;
  let changedLeftChars = 0;
  let changedRightChars = 0;
  for (const [op, text] of diffs) {
    const len = text.length;
    if (op === DIFF_EQUAL) equalChars += len;
    else if (op === DIFF_DELETE) changedLeftChars += len;
    else if (op === DIFF_INSERT) changedRightChars += len;
  }
  return { equalChars, changedLeftChars, changedRightChars };
}
