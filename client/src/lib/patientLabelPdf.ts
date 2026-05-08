import QRCode from "qrcode";

export interface PatientLabelData {
  patientName: string;
  birthday: string;
  patientNumber: string;
  patientUrl: string;
}

export async function printPatientLabel(data: PatientLabelData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [29, 90],
  });

  const qrSize = 22;
  const qrX = 3;
  const qrY = (29 - qrSize) / 2;
  const qrDataUrl = await QRCode.toDataURL(data.patientUrl, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  const textX = qrX + qrSize + 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.patientName, textX, 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(data.birthday, textX, 16);
  doc.text(`ID: ${data.patientNumber}`, textX, 22);

  if (typeof window === "undefined") return;

  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  const opened = window.open(blobUrl, "_blank");
  if (!opened) {
    const safe = data.patientName.replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`patient-label-${safe}.pdf`);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
