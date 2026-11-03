import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatGHS } from "./money";

const BRAND = rgb(0.051, 0.361, 0.271);
const YOLK = rgb(0.961, 0.702, 0.004);
const GREY = rgb(0.32, 0.376, 0.345);
const INK = rgb(0.094, 0.141, 0.118);
const MARGIN = 50;

// PDF standard fonts have no cedi sign, so documents use the GHS code.
export const money = (pesewas: number) => formatGHS(pesewas, "GHS");

export type Pen = { page: PDFPage; y: number; regular: PDFFont; bold: PDFFont; width: number };

export async function startDocument(business: string, title: string, subtitle: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  page.drawText(business, { x: MARGIN, y: height - 70, size: 18, font: bold, color: BRAND });
  page.drawText(title, { x: width - MARGIN - bold.widthOfTextAtSize(title, 15), y: height - 70, size: 15, font: bold, color: BRAND });
  page.drawRectangle({ x: MARGIN, y: height - 88, width: width - MARGIN * 2, height: 2, color: YOLK });

  const pen: Pen = { page, y: height - 112, regular, bold, width };
  page.drawText(subtitle, { x: MARGIN, y: pen.y, size: 10, font: regular, color: GREY });
  pen.y -= 30;
  return { doc, pen };
}

export function row(pen: Pen, label: string, value: string, strong = false) {
  const font = strong ? pen.bold : pen.regular;
  const size = strong ? 13 : 11;
  pen.page.drawText(label, { x: MARGIN, y: pen.y, size, font, color: strong ? BRAND : GREY });
  pen.page.drawText(value, { x: pen.width - MARGIN - font.widthOfTextAtSize(value, size), y: pen.y, size, font, color: strong ? BRAND : INK });
  pen.y -= strong ? 28 : 22;
}

export function heading(pen: Pen, text: string) {
  pen.y -= 8;
  pen.page.drawText(text, { x: MARGIN, y: pen.y, size: 13, font: pen.bold, color: BRAND });
  pen.y -= 8;
  pen.page.drawLine({ start: { x: MARGIN, y: pen.y }, end: { x: pen.width - MARGIN, y: pen.y }, thickness: 1, color: YOLK });
  pen.y -= 20;
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"` },
  });
}
