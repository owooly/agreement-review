import * as pdfjs from "pdfjs-dist";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { leftHighlightRanges, rightHighlightRanges } from "./diffRanges";

let workerConfigured = false;

export function ensurePdfWorker(): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

export type PdfRect = { left: number; top: number; width: number; height: number };

export type PdfPageRender = {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
  overlayRects: PdfRect[];
};

type TextPiece = {
  str: string;
  start: number;
  end: number;
  rect: PdfRect;
};

function itemViewportRect(
  item: TextItem,
  viewport: pdfjs.PageViewport,
): PdfRect | null {
  if (!item.str) return null;
  const t = pdfjs.Util.transform(viewport.transform, item.transform);
  const x = t[4];
  const y = t[5];
  const fontHeight = Math.hypot(t[2], t[3]) || item.height || 12;
  const scaleX = Math.hypot(t[0], t[1]) || 1;
  const w = Math.max(item.width * scaleX, 1);
  const h = Math.max(fontHeight, 1);
  return {
    left: x,
    top: y - h * 0.85,
    width: w,
    height: h * 1.15,
  };
}

function collectTextPieces(
  textContent: TextContent,
  viewport: pdfjs.PageViewport,
): TextPiece[] {
  const pieces: TextPiece[] = [];
  let offset = 0;
  for (const raw of textContent.items) {
    if (!("str" in raw)) continue;
    const item = raw as TextItem;
    const str = item.str;
    if (!str) continue;
    const rect = itemViewportRect(item, viewport);
    if (!rect) continue;
    const start = offset;
    const end = offset + str.length;
    pieces.push({ str, start, end, rect });
    offset = end;
  }
  return pieces;
}

function mergeRects(rects: PdfRect[]): PdfRect[] {
  if (rects.length === 0) return [];
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const out: PdfRect[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    const gap = 4;
    const sameLine = Math.abs(r.top - cur.top) < gap && Math.abs(r.height - cur.height) < gap * 2;
    if (sameLine && r.left <= cur.left + cur.width + gap) {
      const right = Math.max(cur.left + cur.width, r.left + r.width);
      cur.width = right - cur.left;
      cur.top = Math.min(cur.top, r.top);
      const bottom = Math.max(cur.top + cur.height, r.top + r.height);
      cur.height = bottom - cur.top;
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out;
}

function rectsForRanges(pieces: TextPiece[], ranges: { start: number; end: number }[]): PdfRect[] {
  const raw: PdfRect[] = [];
  for (const range of ranges) {
    for (const p of pieces) {
      if (p.end <= range.start) continue;
      if (p.start >= range.end) break;
      raw.push({ ...p.rect });
    }
  }
  return mergeRects(raw);
}

const RENDER_SCALE = 1.2;

async function renderPdfPage(
  pdf: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  counterpartPlain: string,
  side: "left" | "right",
): Promise<PdfPageRender> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D를 사용할 수 없습니다.");

  const renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  const textContent = await page.getTextContent();
  const pieces = collectTextPieces(textContent, viewport);
  const plain = pieces.map((p) => p.str).join("");

  const ranges =
    side === "left"
      ? leftHighlightRanges(plain, counterpartPlain)
      : rightHighlightRanges(counterpartPlain, plain);

  const overlayRects = rectsForRanges(pieces, ranges);

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    dataUrl: canvas.toDataURL("image/png"),
    overlayRects,
  };
}

/** 동일 scale·동일 추출 방식으로 상대 페이지의 평문만 먼저 구함 */
async function extractPlainForPage(
  pdf: pdfjs.PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const textContent = await page.getTextContent();
  const pieces = collectTextPieces(textContent, viewport);
  return pieces.map((p) => p.str).join("");
}

export type PdfCompareResult = {
  kind: "pdf";
  leftPages: PdfPageRender[];
  rightPages: PdfPageRender[];
  leftPageCount: number;
  rightPageCount: number;
};

export async function comparePdfBuffers(
  left: ArrayBuffer,
  right: ArrayBuffer,
): Promise<PdfCompareResult> {
  ensurePdfWorker();
  const u8L = new Uint8Array(left);
  const u8R = new Uint8Array(right);

  const [pdfL, pdfR] = await Promise.all([
    pdfjs.getDocument({ data: u8L }).promise,
    pdfjs.getDocument({ data: u8R }).promise,
  ]);

  const maxPages = Math.max(pdfL.numPages, pdfR.numPages);
  const plainByPageL: string[] = [];
  const plainByPageR: string[] = [];

  for (let i = 1; i <= maxPages; i++) {
    const l =
      i <= pdfL.numPages ? await extractPlainForPage(pdfL, i) : "";
    const r =
      i <= pdfR.numPages ? await extractPlainForPage(pdfR, i) : "";
    plainByPageL.push(l);
    plainByPageR.push(r);
  }

  const leftPages: PdfPageRender[] = [];
  const rightPages: PdfPageRender[] = [];

  for (let i = 1; i <= pdfL.numPages; i++) {
    leftPages.push(
      await renderPdfPage(pdfL, i, plainByPageR[i - 1] ?? "", "left"),
    );
  }
  for (let i = 1; i <= pdfR.numPages; i++) {
    rightPages.push(
      await renderPdfPage(pdfR, i, plainByPageL[i - 1] ?? "", "right"),
    );
  }

  return {
    kind: "pdf",
    leftPages,
    rightPages,
    leftPageCount: pdfL.numPages,
    rightPageCount: pdfR.numPages,
  };
}
