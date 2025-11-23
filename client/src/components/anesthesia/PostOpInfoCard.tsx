import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, FileText, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PostOpInfoCardProps {
  postOpData: {
    postOpDestination?: string;
    postOpNotes?: string;
    complications?: string;
  };
}

export function PostOpInfoCard({ postOpData }: PostOpInfoCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {t('anesthesia.op.postOperativeInformation')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Complications */}
        {postOpData?.complications && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {t('anesthesia.op.complications')}
              </h4>
              <p className="text-sm whitespace-pre-wrap bg-red-50 p-3 rounded-md border border-red-200" data-testid="text-pacu-complications">
                {postOpData.complications}
              </p>
            </div>
          </>
        )}

        {/* Empty state */}
        {!postOpData?.postOpDestination && !postOpData?.postOpNotes && !postOpData?.complications && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No post-operative information recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
