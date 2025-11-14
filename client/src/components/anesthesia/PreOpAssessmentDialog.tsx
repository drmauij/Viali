import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PreopTab from "@/components/anesthesia/PreopTab";

interface PreOpAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgeryId: string;
  hospitalId: string;
}

export default function PreOpAssessmentDialog({
  open,
  onOpenChange,
  surgeryId,
  hospitalId,
}: PreOpAssessmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pre-OP Assessment</DialogTitle>
        </DialogHeader>
        <PreopTab surgeryId={surgeryId} hospitalId={hospitalId} />
      </DialogContent>
    </Dialog>
  );
}
