import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddScorePoint, useUpdateScorePoint, useDeleteScorePoint } from "@/hooks/useVitalsQuery";
import type { AldreteScore, PARSAPScore } from "@/hooks/useEventState";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EditingScore {
  id: string;
  time: number;
  scoreType: 'aldrete' | 'parsap';
  totalScore: number;
  aldreteScore?: AldreteScore;
  parsapScore?: PARSAPScore;
  index: number;
}

interface PendingScore {
  time: number;
}

interface ScoresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingScore: EditingScore | null;
  pendingScore: PendingScore | null;
  onScoreCreated?: () => void;
  onScoreUpdated?: () => void;
  onScoreDeleted?: () => void;
  readOnly?: boolean;
}

const ALDRETE_CRITERIA = [
  { key: 'activity' as const, i18nKey: 'activity' },
  { key: 'respiration' as const, i18nKey: 'respiration' },
  { key: 'circulation' as const, i18nKey: 'circulation' },
  { key: 'consciousness' as const, i18nKey: 'consciousness' },
  { key: 'oxygenSaturation' as const, i18nKey: 'oxygenSaturation' },
];

const PARSAP_CRITERIA = [
  { key: 'vitals' as const, i18nKey: 'vitals' },
  { key: 'ambulation' as const, i18nKey: 'ambulation' },
  { key: 'nauseaVomiting' as const, i18nKey: 'nauseaVomiting' },
  { key: 'pain' as const, i18nKey: 'pain' },
  { key: 'surgicalBleeding' as const, i18nKey: 'surgicalBleeding' },
];

const OPTION_VALUES = [2, 1, 0] as const;

const DEFAULT_ALDRETE: AldreteScore = {
  activity: 2,
  respiration: 2,
  circulation: 2,
  consciousness: 2,
  oxygenSaturation: 2,
};

const DEFAULT_PARSAP: PARSAPScore = {
  vitals: 2,
  ambulation: 2,
  nauseaVomiting: 2,
  pain: 2,
  surgicalBleeding: 2,
};

export function ScoresDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingScore,
  pendingScore,
  onScoreCreated,
  onScoreUpdated,
  onScoreDeleted,
  readOnly = false,
}: ScoresDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'aldrete' | 'parsap'>('aldrete');
  const [aldreteScore, setAldreteScore] = useState<AldreteScore>(DEFAULT_ALDRETE);
  const [parsapScore, setParsapScore] = useState<PARSAPScore>(DEFAULT_PARSAP);
  const [scoreEditTime, setScoreEditTime] = useState<number>(0);

  const addScorePoint = useAddScorePoint(anesthesiaRecordId || undefined);
  const updateScorePoint = useUpdateScorePoint(anesthesiaRecordId || undefined);
  const deleteScorePoint = useDeleteScorePoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingScore) {
      setActiveTab(editingScore.scoreType);
      setScoreEditTime(editingScore.time);
      if (editingScore.aldreteScore) {
        setAldreteScore(editingScore.aldreteScore);
      }
      if (editingScore.parsapScore) {
        setParsapScore(editingScore.parsapScore);
      }
    } else {
      setAldreteScore(DEFAULT_ALDRETE);
      setParsapScore(DEFAULT_PARSAP);
      setScoreEditTime(0);
    }
  }, [editingScore]);

  const aldreteTotal = Object.values(aldreteScore).reduce((sum, val) => sum + val, 0);
  const parsapTotal = Object.values(parsapScore).reduce((sum, val) => sum + val, 0);
  const currentTotal = activeTab === 'aldrete' ? aldreteTotal : parsapTotal;
  const isDischargeReady = currentTotal >= 9;

  const handleSave = () => {
    if (!anesthesiaRecordId) return;

    const scoreData = {
      scoreType: activeTab,
      totalScore: currentTotal,
      ...(activeTab === 'aldrete' 
        ? { aldreteScore } 
        : { parsapScore }
      ),
    };

    if (editingScore) {
      updateScorePoint.mutate(
        {
          pointId: editingScore.id,
          timestamp: new Date(scoreEditTime).toISOString(),
          ...scoreData,
        },
        {
          onSuccess: () => {
            onScoreUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingScore) {
      addScorePoint.mutate(
        {
          timestamp: new Date(pendingScore.time).toISOString(),
          ...scoreData,
        },
        {
          onSuccess: () => {
            onScoreCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingScore) return;
    if (!anesthesiaRecordId) return;

    deleteScorePoint.mutate(editingScore.id, {
      onSuccess: () => {
        onScoreDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setAldreteScore(DEFAULT_ALDRETE);
    setParsapScore(DEFAULT_PARSAP);
    setActiveTab('aldrete');
  };

  const renderCriteriaButtons = (
    criteria: typeof ALDRETE_CRITERIA | typeof PARSAP_CRITERIA,
    i18nNamespace: 'aldreteCriteria' | 'parsapCriteria',
    score: AldreteScore | PARSAPScore,
    setScore: (fn: (prev: any) => any) => void
  ) => (
    <div className="space-y-4">
      {criteria.map((criterion) => (
        <div key={criterion.key} className="space-y-2">
          <Label className="text-sm font-medium">
            {t(`dialogs.${i18nNamespace}.${criterion.i18nKey}.label`)}
          </Label>
          <div className="grid gap-1">
            {OPTION_VALUES.map((value) => {
              const isSelected = score[criterion.key as keyof typeof score] === value;
              return (
                <Button
                  key={value}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className={`justify-start h-auto py-2 px-3 text-left whitespace-normal ${
                    isSelected ? '' : 'hover:bg-muted'
                  }`}
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    setScore((prev: any) => ({
                      ...prev,
                      [criterion.key]: value,
                    }));
                  }}
                  data-testid={`button-${criterion.key}-${value}`}
                >
                  <span className="font-bold mr-2 shrink-0">{value}</span>
                  <span className="text-xs">
                    {t(`dialogs.${i18nNamespace}.${criterion.i18nKey}.opt${value}`)}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.scoresTitle')}
      description={editingScore ? t('dialogs.scoresEditDesc') : t('dialogs.scoresDesc')}
      className="sm:max-w-[600px] max-h-[90vh]"
      testId="dialog-scores"
      time={editingScore ? scoreEditTime : pendingScore?.time}
      onTimeChange={editingScore ? setScoreEditTime : undefined}
      showDelete={!!editingScore && !readOnly}
      onDelete={editingScore && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={readOnly}
      saveLabel={editingScore ? t('common.save') : t('common.add')}
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'aldrete' | 'parsap')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="aldrete" data-testid="tab-aldrete">
            {t('dialogs.aldreteScore')}
          </TabsTrigger>
          <TabsTrigger value="parsap" data-testid="tab-parsap">
            {t('dialogs.parsapScore')}
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
          <TabsContent value="aldrete" className="mt-0">
            {renderCriteriaButtons(ALDRETE_CRITERIA, 'aldreteCriteria', aldreteScore, setAldreteScore)}
          </TabsContent>

          <TabsContent value="parsap" className="mt-0">
            {renderCriteriaButtons(PARSAP_CRITERIA, 'parsapCriteria', parsapScore, setParsapScore)}
          </TabsContent>
        </div>
      </Tabs>

      <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg ${
        isDischargeReady
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          : 'bg-muted text-muted-foreground'
      }`}>
        {isDischargeReady && <CheckCircle2 className="h-5 w-5" />}
        <span className="font-bold text-lg">
          {t('dialogs.scoresTotal')}: {currentTotal}/10
        </span>
        {isDischargeReady && (
          <span className="text-sm font-medium">
            - {t('dialogs.dischargeReady')}
          </span>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
