import mammoth from "mammoth";
import {
  diffSummary,
  leftHighlightRanges,
  rightHighlightRanges,
} from "./diffRanges";
import {
  applyCharHighlights,
  parseHtmlFragment,
  serializeFragment,
} from "./domHighlight";

export type DocxCompareResult = {
  kind: "docx";
  htmlLeft: string;
  htmlRight: string;
  plainLeft: string;
  plainRight: string;
  summary: ReturnType<typeof diffSummary>;
};

export async function compareDocxBuffers(
  left: ArrayBuffer,
  right: ArrayBuffer,
): Promise<DocxCompareResult> {
  const [convL, convR] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer: left }),
    mammoth.convertToHtml({ arrayBuffer: right }),
  ]);

  const rootL = parseHtmlFragment(convL.value);
  const rootR = parseHtmlFragment(convR.value);
  const plainL = rootL.textContent ?? "";
  const plainR = rootR.textContent ?? "";

  const leftRanges = leftHighlightRanges(plainL, plainR);
  const rightRanges = rightHighlightRanges(plainL, plainR);
  const summary = diffSummary(plainL, plainR);

  const outL = parseHtmlFragment(convL.value);
  const outR = parseHtmlFragment(convR.value);
  applyCharHighlights(outL, plainL.length, leftRanges);
  applyCharHighlights(outR, plainR.length, rightRanges);

  return {
    kind: "docx",
    htmlLeft: serializeFragment(outL),
    htmlRight: serializeFragment(outR),
    plainLeft: plainL,
    plainRight: plainR,
    summary,
  };
}
