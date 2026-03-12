import jsPDF from "jspdf";
import QRCode from "qrcode";

interface WristbandData {
  patientName: string;
  birthday: string;
  sex: string;
  patientNumber: string;
  patientUrl: string;
}

export async function generateWristbandPdf(data: WristbandData): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [25.4, 279.4],
  });

  const pageHeight = 25.4;
  const qrSize = 18;
  const margin = 3;
  const xPos = margin;
  const centerY = pageHeight / 2;

  // Patient Name (bold, largest text)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.patientName, xPos, centerY - 3);

  // DOB, Sex, Patient Number (second line)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const infoLine = `${data.birthday}  •  ${data.sex}  •  ${data.patientNumber}`;
  doc.text(infoLine, xPos, centerY + 4);

  // QR Code (right side)
  const qrDataUrl = await QRCode.toDataURL(data.patientUrl, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrX = 279.4 - margin - qrSize;
  const qrY = (pageHeight - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Download
  const safeName = data.patientName.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`wristband-${safeName}.pdf`);
}
