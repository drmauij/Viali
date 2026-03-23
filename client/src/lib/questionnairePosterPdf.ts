import QRCode from "qrcode";
import i18next from "i18next";

interface QuestionnairePosterOptions {
  questionnaireUrl: string;
  hospitalName: string;
  companyLogoUrl?: string;
  language?: string;
}

/**
 * Generates a printable A4 PDF poster with a QR code linking to the patient questionnaire.
 * Intended to be printed and placed at the clinic entrance.
 */
export async function generateQuestionnairePosterPdf(
  options: QuestionnairePosterOptions
): Promise<void> {
  const { questionnaireUrl, hospitalName, companyLogoUrl, language } = options;

  // Temporarily switch language for PDF generation, then restore
  const previousLanguage = i18next.language;
  if (language && language !== previousLanguage) {
    await i18next.changeLanguage(language);
  }
  const t = (key: string) => i18next.t(key);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF("portrait", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const centerX = pageWidth / 2;
  let yPos = 30;

  // --- Hospital Logo ---
  if (companyLogoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "Anonymous";
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject();
        logoImg.src = companyLogoUrl;
      });

      const scaleFactor = 4;
      const canvas = document.createElement("canvas");
      const origWidth = logoImg.naturalWidth || logoImg.width;
      const origHeight = logoImg.naturalHeight || logoImg.height;
      canvas.width = origWidth * scaleFactor;
      canvas.height = origHeight * scaleFactor;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
      }

      const maxLogoWidth = 60;
      const maxLogoHeight = 40;
      const aspectRatio = origWidth / origHeight;
      let logoWidth = maxLogoWidth;
      let logoHeight = logoWidth / aspectRatio;
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * aspectRatio;
      }

      const logoX = (pageWidth - logoWidth) / 2;
      const flattenedLogoUrl = canvas.toDataURL("image/png");
      doc.addImage(flattenedLogoUrl, "PNG", logoX, yPos, logoWidth, logoHeight);
      yPos += logoHeight + 10;
    } catch (e) {
      console.warn("Failed to load hospital logo for QR poster:", e);
    }
  }

  // --- Hospital Name ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(hospitalName, centerX, yPos, { align: "center" });
  yPos += 15;

  // --- Divider line ---
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(50, yPos, pageWidth - 50, yPos);
  yPos += 15;

  // --- Subtitle ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(t("admin.qrPosterTitle"), centerX, yPos, { align: "center" });
  yPos += 20;

  // --- QR Code ---
  const qrSize = 80; // mm
  const qrDataUrl = await QRCode.toDataURL(questionnaireUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  const qrX = (pageWidth - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, yPos, qrSize, qrSize);
  yPos += qrSize + 15;

  // --- Instruction text ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  const instructionText = t("admin.qrPosterInstruction");
  const lines = doc.splitTextToSize(instructionText, 150);
  doc.text(lines, centerX, yPos, { align: "center" });
  yPos += lines.length * 8 + 15;

  // --- URL for reference ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(t("admin.qrPosterUrlLabel"), centerX, yPos, { align: "center" });
  yPos += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(questionnaireUrl, centerX, yPos, { align: "center" });

  // --- Download ---
  doc.save("questionnaire-qr-poster.pdf");

  // Restore previous language
  if (language && language !== previousLanguage) {
    await i18next.changeLanguage(previousLanguage);
  }
}
