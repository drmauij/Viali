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
  const qrSize = 22;
  const margin = 2;

  // QR Code (left side, first element)
  const qrDataUrl = await QRCode.toDataURL(data.patientUrl, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrY = (pageHeight - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", margin, qrY, qrSize, qrSize);

  // Text starts after QR code
  const textX = margin + qrSize + 3;

  // Patient Name (bold, largest text)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.patientName, textX, 10);

  // DOB, Sex, Patient Number (second line)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const infoLine = `${data.birthday}  •  ${data.sex}  •  ${data.patientNumber}`;
  doc.text(infoLine, textX, 18);

  // Download
  const safeName = data.patientName.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`wristband-${safeName}.pdf`);
}
