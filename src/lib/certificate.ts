import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import type { Certificate } from "@prisma/client";
export async function certificatePdf(c: Certificate) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [background, fontBytes, tamilBytes] = await Promise.all([
    readFile(
      path.join(process.cwd(), "public/assets/certificate-template.png"),
    ),
    readFile(path.join(process.cwd(), "public/assets/NotoSans-Regular.ttf")),
    readFile(
      path.join(process.cwd(), "public/assets/NotoSansTamil-Regular.ttf"),
    ),
  ]);
  const normal = await pdf.embedFont(fontBytes, { subset: true });
  const tamil = await pdf.embedFont(tamilBytes, { subset: true });
  const page = pdf.addPage([1536, 1024]);
  page.drawImage(await pdf.embedPng(background), {
    x: 0,
    y: 0,
    width: 1536,
    height: 1024,
  });
  const ink = rgb(0.02, 0.12, 0.23),
    gold = rgb(0.61, 0.42, 0.15);
  const clear = (x: number, top: number, width: number, height: number) =>
    page.drawRectangle({
      x,
      y: 1024 - top - height,
      width,
      height,
      color: rgb(1, 1, 1),
    });
  function line(
    text: string,
    top: number,
    size: number,
    maxWidth = 780,
    color = ink,
  ) {
    const font = /[\u0B80-\u0BFF]/.test(text) ? tamil : normal;
    while (font.widthOfTextAtSize(text, size) > maxWidth && size > 9)
      size -= 0.5;
    page.drawText(text, {
      x: 768 - font.widthOfTextAtSize(text, size) / 2,
      y: 1024 - top - size,
      size,
      font,
      color,
    });
  }
  clear(395, 407, 745, 84);
  line(c.participantName, 416, 54, 735);
  clear(390, 516, 758, 184);
  line("has successfully participated in the workshop", 525, 24, 730);
  line(c.workshopTitle, 564, 30, 730);
  line(`Organizer / Speaker: ${c.speaker}`, 606, 22, 730);
  const date = (d: Date) =>
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  line(`Workshop date: ${date(c.workshopDate)}`, 638, 21, 730);
  line(
    `Verified attendance: ${c.attendancePercentage.toFixed(2)}%`,
    670,
    20,
    730,
    gold,
  );
  clear(389, 704, 745, 30);
  line(`${c.certificateNumber}  |  Issued ${date(c.issuedAt)}`, 709, 12, 735);
  const qr = await QRCode.toBuffer(
    `${process.env.NEXT_PUBLIC_APP_URL}/certificate/verify/${c.id}`,
    { width: 240, margin: 2, errorCorrectionLevel: "M" },
  );
  clear(1173, 716, 128, 151);
  page.drawImage(await pdf.embedPng(qr), {
    x: 1177,
    y: 1024 - 716 - 120,
    width: 120,
    height: 120,
  });
  page.drawText("Scan to verify", {
    x: 1186,
    y: 1024 - 852,
    size: 12,
    font: normal,
    color: ink,
  });
  pdf.setTitle(`Certificate of Participation - ${c.participantName}`);
  pdf.setAuthor("OSW - Semmozhi Connect");
  return pdf.save();
}
