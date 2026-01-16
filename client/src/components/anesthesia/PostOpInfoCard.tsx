import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, FileText, AlertTriangle, Pill, Stethoscope, Check, Bed } from "lucide-react";
import { useTranslation } from "react-i18next";

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
}

export function PostOpInfoCard({ postOpData, pacuBedName }: PostOpInfoCardProps) {
  const { t } = useTranslation();

  const hasPostOpInfo = postOpData?.postOpDestination || postOpData?.postOpNotes || postOpData?.complications ||
    (postOpData?.ponvProphylaxis && Object.values(postOpData.ponvProphylaxis).some(v => v)) ||
    (postOpData?.ambulatoryCare && Object.entries(postOpData.ambulatoryCare).some(([k, v]) => k !== 'notes' && v));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {t('anesthesia.op.postOperativeInformation')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {/* Left column - PACU Bed compact square */}
          {pacuBedName && (
            <div className="flex-shrink-0 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center min-w-[100px] self-start">
              <Bed className="h-10 w-10 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-pacu-bed-name">{pacuBedName}</p>
            </div>
          )}

          {/* Right column - Post-operative information */}
          <div className="flex-1 space-y-4">
            {/* Destination */}
            {postOpData?.postOpDestination && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t('anesthesia.op.destination')}</h4>
                <Badge className={
                  postOpData.postOpDestination === 'pacu' ? 'bg-blue-500 text-white' :
                  postOpData.postOpDestination === 'icu' ? 'bg-red-500 text-white' :
                  postOpData.postOpDestination === 'ward' ? 'bg-green-500 text-white' :
                  postOpData.postOpDestination === 'home' ? 'bg-gray-500 text-white' :
                  'bg-gray-500 text-white'
                }>
                  {postOpData.postOpDestination.toUpperCase()}
                </Badge>
              </div>
            )}

            {/* Post-Op Notes */}
            {postOpData?.postOpNotes && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t('anesthesia.op.postOperativeNotes')}
                  </h4>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md" data-testid="text-pacu-postop-notes">
                    {postOpData.postOpNotes}
                  </p>
                </div>
              </>
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

            {/* Empty state - only show if no bed and no post-op info */}
            {!hasPostOpInfo && !pacuBedName && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No post-operative information recorded yet.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
