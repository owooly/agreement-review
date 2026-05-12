import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import "./App.css";
import type { DocxCompareResult } from "./lib/docxCompare";
import { compareDocxBuffers } from "./lib/docxCompare";
import type { PdfCompareResult } from "./lib/pdfAnalysis";
import { comparePdfBuffers } from "./lib/pdfAnalysis";

type DocKind = "docx" | "pdf";

function detectKind(file: File): DocKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".pdf")) return "pdf";
  return null;
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error("파일 읽기 실패"));
    fr.readAsArrayBuffer(file);
  });
}

type CompareResult = DocxCompareResult | PdfCompareResult;

function DocxResultView({ result }: { result: DocxCompareResult }) {
  const { summary } = result;
  return (
    <>
      <div className="summaryBar">
        비교 요약: 공통 문자 약 {summary.equalChars.toLocaleString()}자 · 왼쪽만/삭제
        약 {summary.changedLeftChars.toLocaleString()}자 · 오른쪽만/추가 약{" "}
        {summary.changedRightChars.toLocaleString()}자 (문자 단위 추정)
      </div>
      <div className="previewGrid">
        <div className="previewPane">
          <header>왼쪽 (차이 초록)</header>
          <div className="previewBody">
            <div
              className="contract-html"
              dangerouslySetInnerHTML={{ __html: result.htmlLeft }}
            />
          </div>
        </div>
        <div className="previewPane">
          <header>오른쪽 (차이 초록)</header>
          <div className="previewBody">
            <div
              className="contract-html"
              dangerouslySetInnerHTML={{ __html: result.htmlRight }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function PdfResultView({ result }: { result: PdfCompareResult }) {
  const mismatch =
    result.leftPageCount !== result.rightPageCount
      ? ` (페이지 수 다름: 왼쪽 ${result.leftPageCount}, 오른쪽 ${result.rightPageCount})`
      : "";
  return (
    <>
      <div className="summaryBar">
        PDF 페이지별 텍스트를 비교해 겹치는 텍스트 블록 위에 초록 박스를 표시합니다.
        {mismatch}
      </div>
      <div className="pdfGrid">
        <div className="pdfCol">
          {result.leftPages.map((p) => (
            <figure key={p.pageNumber} className="pageFigure">
              <div className="pageWrap">
                <img
                  src={p.dataUrl}
                  alt={`왼쪽 ${p.pageNumber}페이지`}
                  width={Math.round(p.width)}
                  height={Math.round(p.height)}
                />
                {p.overlayRects.map((r, i) => (
                  <div
                    key={i}
                    className="pdfRect"
                    style={{
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    }}
                  />
                ))}
              </div>
              <figcaption>왼쪽 · 페이지 {p.pageNumber}</figcaption>
            </figure>
          ))}
        </div>
        <div className="pdfCol">
          {result.rightPages.map((p) => (
            <figure key={p.pageNumber} className="pageFigure">
              <div className="pageWrap">
                <img
                  src={p.dataUrl}
                  alt={`오른쪽 ${p.pageNumber}페이지`}
                  width={Math.round(p.width)}
                  height={Math.round(p.height)}
                />
                {p.overlayRects.map((r, i) => (
                  <div
                    key={i}
                    className="pdfRect"
                    style={{
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    }}
                  />
                ))}
              </div>
              <figcaption>오른쪽 · 페이지 {p.pageNumber}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}

function FileDrop({
  label,
  file,
  onFile,
  inputId,
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  inputId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    onFile(f);
    e.target.value = "";
  };

  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="uploadCol">
      <h2>{label}</h2>
      <div
        className="dropZone"
        role="button"
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
      >
        <label htmlFor={inputId} style={{ cursor: "pointer" }}>
          클릭하여 선택하거나 파일을 여기로 끌어다 놓기
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          onChange={onChange}
        />
        {file ? (
          <div className="fileName">{file.name}</div>
        ) : (
          <div className="fileName" style={{ color: "#888" }}>
            선택된 파일 없음
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const baseId = useId();
  const leftInputId = `${baseId}-left`;
  const rightInputId = `${baseId}-right`;

  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  const canAnalyze = Boolean(leftFile && rightFile && !loading);

  const clearAll = () => {
    setLeftFile(null);
    setRightFile(null);
    setError(null);
    setResult(null);
  };

  const onAnalyze = async () => {
    setError(null);
    setResult(null);
    if (!leftFile || !rightFile) return;

    const kL = detectKind(leftFile);
    const kR = detectKind(rightFile);
    if (!kL || !kR) {
      setError("지원 형식은 .docx 또는 .pdf 입니다.");
      return;
    }
    if (kL !== kR) {
      setError("좌우 파일 형식이 같아야 합니다. (docx–docx 또는 PDF–PDF)");
      return;
    }

    setLoading(true);
    try {
      const [bufL, bufR] = await Promise.all([
        readAsArrayBuffer(leftFile),
        readAsArrayBuffer(rightFile),
      ]);
      if (kL === "docx") {
        setResult(await compareDocxBuffers(bufL, bufR));
      } else {
        setResult(await comparePdfBuffers(bufL, bufR));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="appHeader">
        <h1>계약서 비교 (로컬 전용)</h1>
        <p className="muted">
          파일은 브라우저 메모리에서만 읽으며, 이 앱은 원문을 서버나 외부로 전송하지
          않습니다.
        </p>
      </header>

      <div className="uploadRow">
        <FileDrop
          label="왼쪽 계약서"
          file={leftFile}
          onFile={setLeftFile}
          inputId={leftInputId}
        />
        <div className="centerActions">
          <button
            type="button"
            className="analyzeBtn"
            disabled={!canAnalyze}
            onClick={() => void onAnalyze()}
          >
            분석
          </button>
          <button type="button" className="clearBtn" onClick={clearAll}>
            초기화
          </button>
        </div>
        <FileDrop
          label="오른쪽 계약서"
          file={rightFile}
          onFile={setRightFile}
          inputId={rightInputId}
        />
      </div>

      {loading ? <div className="loading">분석 중…</div> : null}
      {error ? <div className="errorBox">{error}</div> : null}

      {result ? (
        <section className="resultSection">
          <h2>비교 결과</h2>
          {result.kind === "docx" ? (
            <DocxResultView result={result} />
          ) : (
            <PdfResultView result={result} />
          )}
        </section>
      ) : null}
    </div>
  );
}
