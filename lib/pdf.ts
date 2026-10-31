import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const NAVY = rgb(0.07, 0.23, 0.42);
const SAFFRON = rgb(0.85, 0.45, 0.04);
const GREY = rgb(0.35, 0.4, 0.46);
const LINE = rgb(0.85, 0.87, 0.9);
export const A4 = { w: 595, h: 842 };
export const A4_WIDE = { w: 842, h: 595 };

// The standard PDF fonts only cover Windows-1252, so anything else is replaced rather than crashing.
export function pdfSafe(text: unknown): string {
  return String(text ?? "").replace(/[✓✔]/g, "OK").replace(/[^\x20-\x7E\xA0-\xFF•–—‘’“”]/g, "?");
}

export interface Fonts { regular: PDFFont; bold: PDFFont }

export async function newPdf(title: string): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("Sutra");
  doc.setCreator("Sutra");
  return { doc, fonts: { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) } };
}

export function brandHeader(page: PDFPage, fonts: Fonts, title: string, subtitle?: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 64, width, height: 64, color: NAVY });
  page.drawRectangle({ x: 0, y: height - 67, width, height: 3, color: SAFFRON });
  page.drawText("Sutra", { x: 36, y: height - 32, size: 18, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText("One thread. Every verified student.", { x: 36, y: height - 50, size: 9, font: fonts.regular, color: rgb(0.85, 0.9, 0.96) });
  page.drawText(pdfSafe(title), { x: 36, y: height - 96, size: 16, font: fonts.bold, color: NAVY, maxWidth: width - 72 });
  if (subtitle) page.drawText(pdfSafe(subtitle), { x: 36, y: height - 114, size: 10, font: fonts.regular, color: GREY, maxWidth: width - 72 });
}

export function pageFooter(page: PDFPage, fonts: Fonts, text: string) {
  page.drawText(pdfSafe(text), { x: 36, y: 22, size: 8, font: fonts.regular, color: GREY, maxWidth: page.getSize().width - 72 });
}

export function keyValues(page: PDFPage, fonts: Fonts, items: [string, string][], startY: number, x = 36): number {
  let y = startY;
  for (const [key, value] of items) {
    page.drawText(pdfSafe(key), { x, y, size: 9, font: fonts.regular, color: GREY });
    page.drawText(pdfSafe(value), { x: x + 130, y, size: 11, font: fonts.bold, color: NAVY, maxWidth: page.getSize().width - x - 170 });
    y -= 22;
  }
  return y;
}

export async function drawQr(doc: PDFDocument, page: PDFPage, url: string, x: number, y: number, size: number) {
  const png = await QRCode.toBuffer(url, { margin: 1, width: 300 });
  page.drawImage(await doc.embedPng(png), { x, y, width: size, height: size });
}

export interface PdfTable {
  heading?: string;
  columns: { key: string; header: string; width?: number }[];
  rows: Record<string, unknown>[];
}

function fit(font: PDFFont, text: string, size: number, width: number): string {
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out, size) > width) out = out.slice(0, -1);
  return out === text ? text : `${out.slice(0, -1)}...`;
}

export function addTable(doc: PDFDocument, fonts: Fonts, table: PdfTable, opts: { title: string; subtitle?: string; size?: { w: number; h: number }; footer: string }) {
  const size = opts.size ?? A4_WIDE;
  let page = doc.addPage([size.w, size.h]);
  brandHeader(page, fonts, opts.title, opts.subtitle);
  pageFooter(page, fonts, opts.footer);
  let y = size.h - 138;
  const usable = size.w - 72;
  const totalWeight = table.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const widths = table.columns.map((c) => ((c.width ?? 1) / totalWeight) * usable);
  const drawHeadRow = () => {
    page.drawRectangle({ x: 36, y: y - 5, width: usable, height: 18, color: NAVY });
    let x = 36;
    table.columns.forEach((c, i) => {
      page.drawText(fit(fonts.bold, pdfSafe(c.header), 8, widths[i]! - 6), { x: x + 3, y, size: 8, font: fonts.bold, color: rgb(1, 1, 1) });
      x += widths[i]!;
    });
    y -= 18;
  };
  if (table.heading) {
    page.drawText(pdfSafe(table.heading), { x: 36, y, size: 11, font: fonts.bold, color: NAVY });
    y -= 18;
  }
  if (!table.rows.length) {
    page.drawText("No records matched these filters.", { x: 36, y, size: 10, font: fonts.regular, color: GREY });
    return;
  }
  drawHeadRow();
  for (const row of table.rows) {
    if (y < 44) {
      page = doc.addPage([size.w, size.h]);
      brandHeader(page, fonts, opts.title, opts.subtitle);
      pageFooter(page, fonts, opts.footer);
      y = size.h - 138;
      drawHeadRow();
    }
    let x = 36;
    table.columns.forEach((c, i) => {
      page.drawText(fit(fonts.regular, pdfSafe(row[c.key]), 8, widths[i]! - 6), { x: x + 3, y, size: 8, font: fonts.regular, color: rgb(0.1, 0.13, 0.2) });
      x += widths[i]!;
    });
    page.drawLine({ start: { x: 36, y: y - 4 }, end: { x: 36 + usable, y: y - 4 }, thickness: 0.5, color: LINE });
    y -= 15;
  }
}
