import type { CharRange } from "./diffRanges";
import { mergeRanges } from "./diffRanges";

type TextRun = {
  node: Text;
  globalStart: number;
  globalEnd: number;
};

function collectTextRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let global = 0;
  let n = walker.nextNode();
  while (n) {
    const textNode = n as Text;
    const len = textNode.length;
    if (len > 0) {
      runs.push({
        node: textNode,
        globalStart: global,
        globalEnd: global + len,
      });
      global += len;
    }
    n = walker.nextNode();
  }
  return runs;
}

function rangeToLocalSlices(
  runs: TextRun[],
  range: CharRange,
): { node: Text; start: number; end: number }[] {
  const { start, end } = range;
  if (start >= end) return [];
  const slices: { node: Text; start: number; end: number }[] = [];
  for (const run of runs) {
    if (run.globalEnd <= start) continue;
    if (run.globalStart >= end) break;
    const ls = Math.max(start, run.globalStart);
    const le = Math.min(end, run.globalEnd);
    slices.push({
      node: run.node,
      start: ls - run.globalStart,
      end: le - run.globalStart,
    });
  }
  return slices;
}

function wrapSlice(node: Text, start: number, end: number, className: string) {
  if (start >= end) return;
  const parent = node.parentNode;
  if (!parent) return;
  const tail = start > 0 ? node.splitText(start) : node;
  const middle = tail.splitText(end - start);
  const mark = document.createElement("mark");
  mark.className = className;
  parent.insertBefore(mark, middle);
  mark.appendChild(middle);
}

function globalOffsetFor(root: HTMLElement, node: Text, offsetInNode: number): number {
  let g = 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cur = w.nextNode() as Text | null;
  while (cur) {
    if (cur === node) return g + offsetInNode;
    g += cur.length;
    cur = w.nextNode() as Text | null;
  }
  return g;
}

/**
 * 동일한 문자열 기준 오프셋으로 root 이하 텍스트에 mark 적용.
 */
export function applyCharHighlights(
  root: HTMLElement,
  plainLength: number,
  ranges: CharRange[],
  className = "diff-highlight",
): void {
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return;

  const runs = collectTextRuns(root);
  const actualLen = runs.reduce((acc, r) => acc + (r.globalEnd - r.globalStart), 0);
  if (actualLen !== plainLength) {
    console.warn(
      `domHighlight: 길이 불일치 (DOM 텍스트 ${actualLen}, 비교용 ${plainLength}) — 하이라이트가 어긋날 수 있습니다.`,
    );
  }

  const slices: { node: Text; start: number; end: number }[] = [];
  for (const range of merged) {
    slices.push(...rangeToLocalSlices(runs, range));
  }

  slices.sort((a, b) => {
    const endB = globalOffsetFor(root, b.node, b.end);
    const endA = globalOffsetFor(root, a.node, a.end);
    if (endB !== endA) return endB - endA;
    return globalOffsetFor(root, b.node, b.start) - globalOffsetFor(root, a.node, a.start);
  });

  for (const s of slices) {
    if (!s.node.parentNode) continue;
    if (s.start >= s.end) continue;
    wrapSlice(s.node, s.start, s.end, className);
  }
}

export function parseHtmlFragment(html: string): HTMLElement {
  const wrapped = `<!DOCTYPE html><meta charset="utf-8"><div id="__m">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const el = doc.querySelector("#__m") as HTMLElement | null;
  if (!el) throw new Error("HTML 파싱 실패");
  return el;
}

export function serializeFragment(root: HTMLElement): string {
  return root.innerHTML;
}
