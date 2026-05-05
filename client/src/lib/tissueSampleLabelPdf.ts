export interface TissueSampleLabelData {
  code: string;
  dateText: string;
}

export async function printTissueSampleLabel(
  data: TissueSampleLabelData,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [29, 90],
  });

  const marginX = 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(18);
  doc.text(data.code, marginX, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.dateText, marginX, 22);

  if (typeof window === "undefined") return;

  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  const opened = window.open(blobUrl, "_blank");
  if (!opened) {
    const safe = data.code.replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`label-${safe}.pdf`);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
