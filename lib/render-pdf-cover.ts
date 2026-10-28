import type * as PdfJs from "pdfjs-dist";

export type CoverFormat = "image/png" | "image/jpeg" | "image/webp";

let pdfjsPromise: Promise<{ pdfjs: typeof PdfJs; worker: PdfJs.PDFWorker }> | null = null;

// Loads pdfjs-dist lazily so it only ever runs in the browser. One worker is
// created and passed to every document explicitly: pdf.js then never tears it
// down when a document is destroyed, so several PDFs can render at once.
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      const port = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), {
        type: "module",
      });
      return { pdfjs, worker: pdfjs.PDFWorker.create({ port }) };
    });
  }
  return pdfjsPromise;
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: CoverFormat, quality = 0.92): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      format,
      quality,
    ),
  );
}

/**
 * Renders page 1 of a PDF to a canvas. The scale is at least `minScale`, and high
 * enough for the result to be `minWidth` pixels wide when that's given.
 */
export async function renderPdfFirstPage(
  file: File,
  { minScale = 1, minWidth = 0 }: { minScale?: number; minWidth?: number } = {},
): Promise<{ canvas: HTMLCanvasElement; pageCount: number }> {
  const { pdfjs, worker } = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, worker });
  const pdf = await task.promise;

  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(minScale, minWidth / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // JPEG has no alpha channel, so paint white instead of transparent black.
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    page.cleanup();
    return { canvas, pageCount: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

export async function renderPdfCover(
  file: File,
  { scale = 2, format = "image/png" as CoverFormat, quality = 0.92 } = {},
): Promise<{ blob: Blob; width: number; height: number; pageCount: number }> {
  const { canvas, pageCount } = await renderPdfFirstPage(file, { minScale: scale });
  const blob = await canvasToBlob(canvas, format, quality);
  return { blob, width: canvas.width, height: canvas.height, pageCount };
}
