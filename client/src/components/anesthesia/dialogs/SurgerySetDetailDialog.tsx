import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Download, Package, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";

type SurgerySetData = {
  id: string;
  name: string;
  description: string | null;
  hospitalId: string;
  intraOpData: Record<string, any> | null;
  isActive: boolean;
  createdAt: string;
  inventoryItems: { id: string; itemId: string; quantity: number; sortOrder: number; itemName: string; imageUrl?: string | null }[];
};

interface SurgerySetDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  set: SurgerySetData | null;
}

export function SurgerySetDetailDialog({ open, onOpenChange, set }: SurgerySetDetailDialogProps) {
  const { t } = useTranslation();
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  if (!set) return null;

  const intraOp = set.intraOpData || {};
  const hasInventory = set.inventoryItems.length > 0;

  // Label maps for boolean sections
  const positioningLabels: Record<string, string> = {
    _title: t('surgery.intraop.positioning'),
    RL: t('surgery.intraop.positions.supine'),
    SL: t('surgery.intraop.positions.lateral'),
    BL: t('surgery.intraop.positions.prone'),
    SSL: t('surgery.intraop.positions.lithotomy'),
    EXT: t('surgery.intraop.positions.extension'),
  };
  const disinfectionLabels: Record<string, string> = {
    _title: t('surgery.intraop.disinfection'),
    kodanColored: t('surgery.intraop.kodanColored'),
    kodanColorless: t('surgery.intraop.kodanColorless'),
    octanisept: t('surgery.intraop.octanisept'),
    betadine: t('surgery.intraop.betadine'),
  };
  const irrigationLabels: Record<string, string> = {
    _title: t('surgery.intraop.irrigation'),
    nacl: t('surgery.intraop.irrigationOptions.nacl'),
    ringerSolution: t('surgery.intraop.irrigationOptions.ringerSolution'),
  };
  const infiltrationLabels: Record<string, string> = {
    _title: t('surgery.intraop.infiltrationMedications'),
    tumorSolution: t('surgery.intraop.infiltrationOptions.tumorSolution'),
    epinephrine: t('surgery.intraop.epinephrine'),
  };
  const medicationLabels: Record<string, string> = {
    _title: t('surgery.intraop.infiltrationMedications'),
    rapidocain1: t('surgery.intraop.medicationOptions.rapidocain1'),
    ropivacainEpinephrine: t('surgery.intraop.medicationOptions.ropivacainEpinephrine'),
    ropivacain05: t('surgery.intraop.medicationOptions.ropivacain05'),
    ropivacain075: t('surgery.intraop.medicationOptions.ropivacain075'),
    ropivacain1: t('surgery.intraop.medicationOptions.ropivacain1'),
    bupivacain: t('surgery.intraop.medicationOptions.bupivacain'),
    bupivacain025: t('surgery.intraop.medicationOptions.bupivacain025'),
    bupivacain05: t('surgery.intraop.medicationOptions.bupivacain05'),
    vancomycinImplant: t('surgery.intraop.medicationOptions.vancomycinImplant'),
    contrast: t('surgery.intraop.medicationOptions.contrast'),
    ointments: t('surgery.intraop.medicationOptions.ointments'),
  };
  const dressingLabels: Record<string, string> = {
    _title: t('surgery.intraop.dressing'),
    elasticBandage: t('surgery.intraop.dressingOptions.elasticBandage'),
    abdominalBelt: t('surgery.intraop.dressingOptions.abdominalBelt'),
    bra: t('surgery.intraop.dressingOptions.bra'),
    faceLiftMask: t('surgery.intraop.dressingOptions.faceLiftMask'),
    steristrips: t('surgery.intraop.dressingOptions.steristrips'),
    comfeel: t('surgery.intraop.dressingOptions.comfeel'),
    opsite: t('surgery.intraop.dressingOptions.opsite'),
    compresses: t('surgery.intraop.dressingOptions.compresses'),
    mefix: t('surgery.intraop.dressingOptions.mefix'),
  };

  // Helper: get active boolean fields from a section
  const getBooleanItems = (sectionData: Record<string, any>, labelMap: Record<string, string>) => {
    return Object.entries(sectionData)
      .filter(([, v]) => v === true)
      .map(([key]) => ({ key, label: labelMap[key] || key }));
  };

  // Collect sections data for rendering and PDF
  type SectionData = {
    title: string;
    checkItems: { key: string; label: string }[];
    details: { label: string; value: string }[];
    column?: 'left' | 'right';
  };

  const buildSections = (): SectionData[] => {
    const sections: SectionData[] = [];

    if (intraOp.positioning) {
      const items = getBooleanItems(intraOp.positioning, positioningLabels);
      const details: { label: string; value: string }[] = [];
      if (intraOp.positioning.notes) details.push({ label: t('surgery.sets.detail.notes'), value: intraOp.positioning.notes });
      if (items.length > 0 || details.length > 0) {
        sections.push({ title: positioningLabels._title, checkItems: items, details });
      }
    }

    if (intraOp.disinfection) {
      const items = getBooleanItems(intraOp.disinfection, disinfectionLabels);
      const details: { label: string; value: string }[] = [];
      if (intraOp.disinfection.performedBy) details.push({ label: t('surgery.intraop.performedBy'), value: intraOp.disinfection.performedBy });
      if (intraOp.disinfection.notes) details.push({ label: t('surgery.sets.detail.notes'), value: intraOp.disinfection.notes });
      if (items.length > 0 || details.length > 0) {
        sections.push({ title: disinfectionLabels._title, checkItems: items, details });
      }
    }

    if (intraOp.equipment) {
      const eq = intraOp.equipment;
      const checkItems: { key: string; label: string }[] = [];
      const details: { label: string; value: string }[] = [];

      if (eq.monopolar) checkItems.push({ key: 'monopolar', label: `${t('surgery.intraop.koagulation')} - Monopolar` });
      if (eq.bipolar) checkItems.push({ key: 'bipolar', label: `${t('surgery.intraop.koagulation')} - Bipolar` });
      if (eq.pathology?.histology) checkItems.push({ key: 'histology', label: t('surgery.intraop.histologie') });
      if (eq.pathology?.microbiology) checkItems.push({ key: 'microbiology', label: t('surgery.intraop.mikrobio') });
      if (eq.neutralElectrodeLocation) details.push({ label: t('surgery.intraop.neutralElectrode'), value: String(t(`surgery.intraop.${eq.neutralElectrodeLocation}`, eq.neutralElectrodeLocation)) });
      if (eq.neutralElectrodeSide) details.push({ label: t('surgery.intraop.bodySide'), value: String(t(`surgery.intraop.${eq.neutralElectrodeSide}`, eq.neutralElectrodeSide)) });
      if (eq.devices) details.push({ label: t('surgery.intraop.devices'), value: eq.devices });
      if (eq.notes) details.push({ label: t('surgery.sets.detail.notes'), value: eq.notes });

      if (checkItems.length > 0 || details.length > 0) {
        sections.push({ title: t('surgery.intraop.equipment'), checkItems, details });
      }
    }

    // Irrigation (standalone)
    if (intraOp.irrigation) {
      const items = getBooleanItems(intraOp.irrigation, irrigationLabels);
      if (items.length > 0) {
        sections.push({ title: irrigationLabels._title, checkItems: items, details: [] });
      }
    }

    // Infiltration & Medications (merged into one section)
    {
      const checkItems: { key: string; label: string }[] = [];
      const details: { label: string; value: string }[] = [];

      if (intraOp.infiltration) {
        const inf = intraOp.infiltration;
        if (inf.carrier) details.push({ label: t('surgery.intraop.carrier'), value: t(`surgery.intraop.carrierOptions.${inf.carrier}`) + (inf.carrierVolume ? ` ${inf.carrierVolume} ${t('surgery.intraop.mlUnit')}` : '') });
        // backward compat: old tumorSolution boolean
        if (inf.tumorSolution) checkItems.push({ key: 'tumorSolution', label: infiltrationLabels.tumorSolution });
        if (inf.epinephrine) checkItems.push({ key: 'epinephrine', label: t('surgery.intraop.epinephrine') + (inf.epinephrineAmount ? ` ${inf.epinephrineAmount} ${t('surgery.intraop.mlUnit')}` : '') });
        if (inf.totalVolume) details.push({ label: t('surgery.intraop.totalVolume'), value: `${inf.totalVolume} ${t('surgery.intraop.mlUnit')}` });
        if (inf.other) details.push({ label: t('surgery.intraop.infiltrationOther'), value: inf.other });
      }

      if (intraOp.medications) {
        const meds = intraOp.medications;
        // All medication booleans with optional volume
        for (const [key, label] of Object.entries(medicationLabels)) {
          if (key === '_title') continue;
          if (meds[key] === true) {
            const vol = meds[`${key}Volume`];
            checkItems.push({ key, label: label + (vol ? ` ${vol} ${t('surgery.intraop.mlUnit')}` : '') });
          }
        }
        if (meds.other) details.push({ label: t('surgery.intraop.medicationsOther'), value: meds.other });
        // Custom medications from inventory
        if (meds.customMedications && Array.isArray(meds.customMedications)) {
          for (const cm of meds.customMedications) {
            checkItems.push({ key: `custom-${cm.itemId}`, label: cm.name + (cm.volume ? ` ${cm.volume} ${t('surgery.intraop.mlUnit')}` : '') });
          }
        }
      }

      if (checkItems.length > 0 || details.length > 0) {
        sections.push({ title: t('surgery.intraop.infiltrationMedications'), checkItems, details, column: 'right' });
      }
    }

    // Dressing
    if (intraOp.dressing) {
      const items = getBooleanItems(intraOp.dressing, dressingLabels);
      if (items.length > 0) {
        sections.push({ title: dressingLabels._title, checkItems: items, details: [] });
      }
    }

    if (intraOp.co2Pressure) {
      const co2 = intraOp.co2Pressure;
      const details: { label: string; value: string }[] = [];
      if (co2.pressure != null) details.push({ label: `${t('surgery.sets.detail.pressure')} (mmHg)`, value: String(co2.pressure) });
      if (co2.notes) details.push({ label: t('surgery.sets.detail.notes'), value: co2.notes });
      if (details.length > 0) {
        sections.push({ title: 'CO2 / Laparoskopie', checkItems: [], details });
      }
    }

    if (intraOp.tourniquet) {
      const tq = intraOp.tourniquet;
      const details: { label: string; value: string }[] = [];
      if (tq.position) details.push({ label: 'Position', value: tq.position === 'arm' ? 'Arm' : 'Bein' });
      if (tq.side) details.push({ label: t('surgery.intraop.bodySide'), value: tq.side === 'left' ? t('surgery.intraop.left') : t('surgery.intraop.right') });
      if (tq.pressure != null) details.push({ label: `${t('surgery.sets.detail.pressure')} (mmHg)`, value: String(tq.pressure) });
      if (tq.duration != null) details.push({ label: `${t('surgery.sets.detail.duration')} (Min.)`, value: String(tq.duration) });
      if (tq.notes) details.push({ label: t('surgery.sets.detail.notes'), value: tq.notes });
      if (details.length > 0) {
        sections.push({ title: 'Blutsperre / Tourniquet', checkItems: [], details });
      }
    }

    // Dynamic drainages (new format)
    if (intraOp.drainages && intraOp.drainages.length > 0) {
      const details: { label: string; value: string }[] = [];
      intraOp.drainages.forEach((drain: any, i: number) => {
        const typeName = drain.type === 'Other' && drain.typeOther ? drain.typeOther : drain.type;
        const parts = [typeName, drain.size, drain.position].filter(Boolean);
        details.push({ label: `#${i + 1}`, value: parts.join(' — ') });
      });
      sections.push({ title: t('surgery.intraop.drainage'), checkItems: [], details });
    } else if (intraOp.drainage) {
      // Legacy format fallback
      const dr = intraOp.drainage;
      const checkItems: { key: string; label: string }[] = [];
      const details: { label: string; value: string }[] = [];
      if (dr.redon) checkItems.push({ key: 'redon', label: t('surgery.intraop.drainageOptions.redonCH') });
      if (dr.redonCount) details.push({ label: t('surgery.intraop.drainageOptions.redonCount'), value: String(dr.redonCount) });
      if (checkItems.length > 0 || details.length > 0) {
        sections.push({ title: t('surgery.intraop.drainage'), checkItems, details });
      }
    }

    // X-Ray / Fluoroscopy
    if (intraOp.xray?.used) {
      const details: { label: string; value: string }[] = [];
      if (intraOp.xray.imageCount != null) details.push({ label: t('surgery.intraop.xrayImageCount'), value: String(intraOp.xray.imageCount) });
      if (intraOp.xray.bodyRegion) details.push({ label: t('surgery.intraop.xrayBodyRegion'), value: intraOp.xray.bodyRegion });
      if (intraOp.xray.notes) details.push({ label: t('surgery.intraop.xrayNotes'), value: intraOp.xray.notes });
      if (details.length > 0) {
        sections.push({ title: t('surgery.intraop.xray'), checkItems: [], details });
      }
    }

    if (intraOp.intraoperativeNotes) {
      sections.push({
        title: t('surgery.sets.detail.intraoperativeNotes'),
        checkItems: [],
        details: [{ label: '', value: intraOp.intraoperativeNotes }],
      });
    }

    return sections;
  };

  const sections = buildSections();
  const leftSections = sections.filter(s => s.column !== 'right');
  const rightSections = sections.filter(s => s.column === 'right');
  const hasRightColumn = hasInventory || rightSections.length > 0;
  const hasAnything = hasInventory || sections.length > 0;

  // PDF generation
  const generatePdf = async () => {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.text(set.name, 14, 20);

    if (set.description) {
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(set.description, 14, 28);
      doc.setTextColor(0, 0, 0);
    }

    let y = set.description ? 36 : 30;

    // Inventory items table
    if (hasInventory) {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(t('surgery.sets.inventorySection'), 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['#', t('surgery.sets.detail.item', 'Item'), t('surgery.sets.quantity')]],
        body: set.inventoryItems.map((item, i) => [
          String(i + 1),
          item.itemName,
          `x${item.quantity}`,
        ]),
        styles: { fontSize: 11, cellPadding: 3 },
        headStyles: { fillColor: [60, 60, 60], fontSize: 11 },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          2: { cellWidth: 25, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // IntraOp sections
    for (const section of sections) {
      // Check if we need a new page
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(section.title, 14, y);
      y += 6;
      doc.setFont("helvetica", "normal");

      // Checkmark items
      for (const item of section.checkItems) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        // Draw a checkmark square
        doc.setDrawColor(34, 197, 94);
        doc.setFillColor(34, 197, 94);
        doc.rect(16, y - 3.5, 4, 4, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text('\u2713', 16.8, y);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.text(item.label, 24, y);
        y += 6;
      }

      // Detail items
      for (const detail of section.details) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        if (detail.label) {
          doc.setFont("helvetica", "bold");
          doc.text(`${detail.label}:`, 16, y);
          const labelWidth = doc.getTextWidth(`${detail.label}: `);
          doc.setFont("helvetica", "normal");
          // Wrap long values
          const maxWidth = pageWidth - 16 - labelWidth - 14;
          const lines = doc.splitTextToSize(detail.value, maxWidth);
          doc.text(lines[0], 16 + labelWidth, y);
          for (let i = 1; i < lines.length; i++) {
            y += 5;
            if (y > 275) { doc.addPage(); y = 20; }
            doc.text(lines[i], 16 + labelWidth, y);
          }
        } else {
          // Free-form text (e.g., intraoperative notes)
          const lines = doc.splitTextToSize(detail.value, pageWidth - 28);
          for (const line of lines) {
            if (y > 275) { doc.addPage(); y = 20; }
            doc.text(line, 16, y);
            y += 5;
          }
        }
        y += 4;
      }

      y += 4;
    }

    const fileName = `OP-Set_${set.name.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g, '').replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] max-w-4xl h-[90vh] flex flex-col p-0"
        data-testid="dialog-surgery-set-detail-fullscreen"
      >
        <DialogTitle className="sr-only">{set.name}</DialogTitle>

        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0 pr-12 space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold truncate">{set.name}</h2>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={generatePdf}
              data-testid="button-download-set-pdf"
            >
              <Download className="h-4 w-4 mr-1.5" />
              PDF
            </Button>
          </div>
          {set.description && (
            <p className="text-sm text-muted-foreground">{set.description}</p>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5">
            {!hasAnything ? (
              <div className="text-center py-16 space-y-3">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-lg text-muted-foreground">{t('surgery.sets.detail.empty')}</p>
              </div>
            ) : (
              <div className={`${hasRightColumn ? 'lg:grid lg:grid-cols-2 lg:gap-6' : ''} space-y-4 lg:space-y-0`}>
                {/* Left column: IntraOp documentation */}
                <div className="space-y-4">
                  {leftSections.map((section, idx) => (
                    <div key={idx} className="space-y-2">
                      <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
                        {section.title}
                      </h3>

                      {section.checkItems.length > 0 && (
                        <div className="space-y-1.5">
                          {section.checkItems.map((item) => (
                            <div key={item.key} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                              <div className="h-6 w-6 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                              </div>
                              <span className="text-base">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {section.details.length > 0 && (
                        <div className="space-y-2">
                          {section.details.map((detail, i) => (
                            <div key={i} className="text-base">
                              {detail.label ? (
                                <>
                                  <span className="text-muted-foreground">{detail.label}:</span>{' '}
                                  <span className="font-medium">{detail.value}</span>
                                </>
                              ) : (
                                <p className="whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{detail.value}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Right column: Medications + Inventory Items */}
                {hasRightColumn && (
                  <div className="space-y-4">
                    {rightSections.map((section, idx) => (
                      <div key={idx} className="space-y-2">
                        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
                          {section.title}
                        </h3>
                        {section.checkItems.length > 0 && (
                          <div className="space-y-1.5">
                            {section.checkItems.map((item) => (
                              <div key={item.key} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                                <div className="h-6 w-6 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                                </div>
                                <span className="text-base">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {section.details.length > 0 && (
                          <div className="space-y-2">
                            {section.details.map((detail, i) => (
                              <div key={i} className="text-base">
                                {detail.label ? (
                                  <>
                                    <span className="text-muted-foreground">{detail.label}:</span>{' '}
                                    <span className="font-medium">{detail.value}</span>
                                  </>
                                ) : (
                                  <p className="whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{detail.value}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {hasInventory && (
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('surgery.sets.inventorySection')}
                        </h3>
                        <div className="space-y-1.5">
                          {set.inventoryItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                            >
                              {item.imageUrl ? (
                                <button
                                  type="button"
                                  className="relative w-8 h-8 rounded border border-border overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
                                  onClick={() => setZoomImageUrl(item.imageUrl!)}
                                  title={t('inventory.viewImage', 'View image')}
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt={item.itemName}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <span className="flex-1 text-base font-medium truncate">{item.itemName}</span>
                              <Badge variant="secondary" className="text-sm px-2.5 py-0.5 font-semibold">
                                x{item.quantity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Image zoom dialog */}
    <Dialog open={!!zoomImageUrl} onOpenChange={() => setZoomImageUrl(null)}>
      <DialogContent className="max-w-lg p-2">
        <DialogTitle className="sr-only">Image</DialogTitle>
        {zoomImageUrl && (
          <img
            src={zoomImageUrl}
            alt=""
            className="w-full h-auto rounded-lg object-contain max-h-[70vh]"
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
