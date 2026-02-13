import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info, FileText, AlertTriangle, Pill, Stethoscope, Check, Bed, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PacuBedSelector } from "./PacuBedSelector";

interface PostOpInfoCardProps {
  postOpData: {
    postOpDestination?: string;
    postOpNotes?: string;
    complications?: string;
    ponvProphylaxis?: {
      ondansetron?: boolean;
      droperidol?: boolean;
      haloperidol?: boolean;
      dexamethasone?: boolean;
    };
    ambulatoryCare?: {
      repeatAntibioticAfter4h?: boolean;
      osasObservation?: boolean;
      escortRequired?: boolean;
      postBlockMotorCheck?: boolean;
      extendedObservation?: boolean;
      noOralAnticoagulants24h?: boolean;
      notes?: string;
    };
  };
  pacuBedName?: string | null;
  pacuBedId?: string | null;
  surgeryId?: string;
  hideBedSquare?: boolean;
}

export function PostOpInfoCard({ postOpData, pacuBedName, pacuBedId, surgeryId, hideBedSquare = false }: PostOpInfoCardProps) {
  const { t } = useTranslation();
  const [bedSelectorOpen, setBedSelectorOpen] = useState(false);

  const hasPostOpInfo = postOpData?.postOpDestination || postOpData?.postOpNotes || postOpData?.complications ||
    (postOpData?.ponvProphylaxis && Object.values(postOpData.ponvProphylaxis).some(v => v)) ||
    (postOpData?.ambulatoryCare && Object.entries(postOpData.ambulatoryCare).some(([k, v]) => k !== 'notes' && v));

  // Clickable bed square component
  const BedSquare = () => (
    <div 
      className="flex-shrink-0 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center min-w-[100px] self-start cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
      onClick={() => setBedSelectorOpen(true)}
      data-testid="button-pacu-bed-square"
    >
      <Bed className="h-10 w-10 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-pacu-bed-name">{pacuBedName}</p>
    </div>
  );

  // Assign bed placeholder when no bed assigned
  const AssignBedSquare = () => (
    <div 
      className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center min-w-[100px] self-start cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      onClick={() => setBedSelectorOpen(true)}
      data-testid="button-assign-pacu-bed"
    >
      <Plus className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('anesthesia.pacu.assignBed', 'Assign Bed')}</p>
    </div>
  );

  // If hideBedSquare is true and no post-op info, don't render anything
  if (hideBedSquare && !hasPostOpInfo) {
    return null;
  }

  // If only bed assigned but no post-op info, show compact layout without card (only when bed square not hidden)
  if (!hideBedSquare && pacuBedName && !hasPostOpInfo) {
    return (
      <>
        <BedSquare />
        {surgeryId && (
          <PacuBedSelector
            surgeryId={surgeryId}
            currentBedId={pacuBedId || undefined}
            currentBedName={pacuBedName || undefined}
            open={bedSelectorOpen}
            onOpenChange={setBedSelectorOpen}
            hideTrigger
          />
        )}
      </>
    );
  }

  // If no bed and no post-op info, show assign bed option (only when bed square not hidden)
  if (!hideBedSquare && !pacuBedName && !hasPostOpInfo && surgeryId) {
    return (
      <>
        <AssignBedSquare />
        <PacuBedSelector
          surgeryId={surgeryId}
          open={bedSelectorOpen}
          onOpenChange={setBedSelectorOpen}
          hideTrigger
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            {t('anesthesia.op.postOperativeInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={hideBedSquare ? "" : "flex gap-4"}>
            {/* Left column - PACU Bed compact square (only when not hidden) */}
            {!hideBedSquare && (
              pacuBedName ? (
                <BedSquare />
              ) : surgeryId ? (
                <AssignBedSquare />
              ) : null
            )}

            {/* Right column - Post-operative information */}
            <div className="flex-1 space-y-4">
              {/* Destination and Post-Op Notes on same row - no separate titles */}
              {(postOpData?.postOpDestination || postOpData?.postOpNotes) && (
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                  {/* Destination */}
                  {postOpData?.postOpDestination && (
                    <Badge className={
                      postOpData.postOpDestination === 'pacu' ? 'bg-blue-500 text-white' :
                      postOpData.postOpDestination === 'icu' ? 'bg-red-500 text-white' :
                      postOpData.postOpDestination === 'ward' ? 'bg-green-500 text-white' :
                      postOpData.postOpDestination === 'home' ? 'bg-gray-500 text-white' :
                      'bg-gray-500 text-white'
                    }>
                      {postOpData.postOpDestination.toUpperCase()}
                    </Badge>
                  )}

                  {/* Post-Op Notes */}
                  {postOpData?.postOpNotes && (
                    <p className="flex-1 text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md" data-testid="text-pacu-postop-notes">
                      {postOpData.postOpNotes}
                    </p>
                  )}
                </div>
              )}

              {/* PONV Prophylaxis */}
              {postOpData?.ponvProphylaxis && Object.values(postOpData.ponvProphylaxis).some(v => v) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Pill className="h-4 w-4" />
                      {t('anesthesia.op.ponvProphylaxis')}
                    </h4>
                    <div className="flex flex-wrap gap-2" data-testid="text-pacu-ponv-prophylaxis">
                      {postOpData.ponvProphylaxis.ondansetron && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100">
                          <Check className="h-3 w-3 mr-1" />
                          {t('anesthesia.op.ondansetron')}
                        </Badge>
                      )}
                      {postOpData.ponvProphylaxis.droperidol && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100">
                          <Check className="h-3 w-3 mr-1" />
                          {t('anesthesia.op.droperidol')}
                        </Badge>
                      )}
                      {postOpData.ponvProphylaxis.haloperidol && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100">
                          <Check className="h-3 w-3 mr-1" />
                          {t('anesthesia.op.haloperidol')}
                        </Badge>
                      )}
                      {postOpData.ponvProphylaxis.dexamethasone && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100">
                          <Check className="h-3 w-3 mr-1" />
                          {t('anesthesia.op.dexamethasone')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Ambulatory Care Instructions */}
              {postOpData?.ambulatoryCare && (Object.entries(postOpData.ambulatoryCare).some(([k, v]) => k !== 'notes' && v) || postOpData.ambulatoryCare.notes) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      {t('anesthesia.op.ambulatoryCareInstructions')}
                    </h4>
                    <div className="space-y-1" data-testid="text-pacu-ambulatory-care">
                      {postOpData.ambulatoryCare.repeatAntibioticAfter4h && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.repeatAntibioticAfter4h')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.osasObservation && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.osasObservation')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.escortRequired && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.escortRequired')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.postBlockMotorCheck && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.postBlockMotorCheck')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.extendedObservation && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.extendedObservation')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.noOralAnticoagulants24h && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>{t('anesthesia.op.noOralAnticoagulants24h')}</span>
                        </div>
                      )}
                      {postOpData.ambulatoryCare.notes && (
                        <p className="text-sm whitespace-pre-wrap bg-muted/30 p-2 rounded-md mt-2">
                          {postOpData.ambulatoryCare.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Complications */}
              {postOpData?.complications && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      {t('anesthesia.op.intraoperativeComplications')}
                    </h4>
                    <p className="text-sm whitespace-pre-wrap bg-red-50 dark:bg-red-900/30 p-3 rounded-md border border-red-200 dark:border-red-800" data-testid="text-pacu-complications">
                      {postOpData.complications}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {surgeryId && (
        <PacuBedSelector
          surgeryId={surgeryId}
          currentBedId={pacuBedId || undefined}
          currentBedName={pacuBedName || undefined}
          open={bedSelectorOpen}
          onOpenChange={setBedSelectorOpen}
          hideTrigger
        />
      )}
    </>
  );
}
