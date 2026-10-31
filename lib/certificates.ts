import JSZip from "jszip";
import { z } from "zod";
import { drawQr, A4_WIDE, newPdf, pdfSafe } from "@/lib/pdf";
import { rgb } from "pdf-lib";

export const layoutSchema = z.object({
  position: z.enum(["beside-id", "below-name", "footer"]).default("beside-id"),
  showQr: z.boolean().default(true),
  fontSize: z.number().int().min(8).max(16).default(11),
});
export type CertificateLayout = z.infer<typeof layoutSchema>;

export const formatApaarLine = (apaar: string) => `APAAR ID: ${apaar.slice(0, 4)}-${apaar.slice(4, 8)}-${apaar.slice(8)}`;

export interface CertificateData {
  name: string;
  apaarId: string;
  studentCode: string;
  program: string;
  institution: string;
  university: string;
  year: string;
  qrUrl: string;
}

export async function certificatePdf(data: CertificateData, layout: CertificateLayout): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(`Certificate ${data.studentCode}`);
  const page = doc.addPage([A4_WIDE.w, A4_WIDE.h]);
  const { w, h } = A4_WIDE;
  const navy = rgb(0.07, 0.23, 0.42);
  page.drawRectangle({ x: 20, y: 20, width: w - 40, height: h - 40, borderColor: navy, borderWidth: 2 });
  page.drawRectangle({ x: 28, y: 28, width: w - 56, height: h - 56, borderColor: rgb(0.85, 0.45, 0.04), borderWidth: 0.75 });
  const center = (text: string, y: number, size: number, bold = false) => {
    const font = bold ? fonts.bold : fonts.regular;
    const safe = pdfSafe(text);
    page.drawText(safe, { x: (w - font.widthOfTextAtSize(safe, size)) / 2, y, size, font, color: navy });
  };
  center(data.university, h - 90, 22, true);
  center("Certificate of Enrolment", h - 130, 15);
  center("This is to certify that", h - 180, 12);
  center(data.name, h - 215, 24, true);
  const apaarLine = formatApaarLine(data.apaarId);
  const idY = h - 245;
  if (layout.position === "below-name") {
    center(`Student ID: ${data.studentCode}`, idY, 11);
    center(apaarLine, idY - 18, layout.fontSize, true);
  } else if (layout.position === "beside-id") {
    center(`Student ID: ${data.studentCode}     ${apaarLine}`, idY, layout.fontSize);
  } else {
    center(`Student ID: ${data.studentCode}`, idY, 11);
  }
  center("is enrolled in", h - 285, 12);
  center(data.program, h - 312, 17, true);
  center(`at ${data.institution}, ${data.year}`, h - 338, 12);
  if (layout.position === "footer") center(apaarLine, 62, layout.fontSize, true);
  if (layout.showQr) {
    await drawQr(doc, page, data.qrUrl, w - 130, 50, 80);
    page.drawText("Scan to verify", { x: w - 125, y: 40, size: 8, font: fonts.regular, color: navy });
  }
  page.drawText("Sample template for the demonstration", { x: 48, y: 44, size: 8, font: fonts.regular, color: rgb(0.4, 0.45, 0.5) });
  return doc.save();
}

export async function certificateZip(items: { fileName: string; pdf: Uint8Array }[]): Promise<Uint8Array> {
  const zip = new JSZip();
  items.forEach((i) => zip.file(i.fileName, i.pdf));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
