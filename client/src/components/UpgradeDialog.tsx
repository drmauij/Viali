import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount: number;
  limit: number;
  licenseType: string;
}

export default function UpgradeDialog({
  open,
  onOpenChange,
  currentCount,
  limit,
  licenseType,
}: UpgradeDialogProps) {
  const getUpgradeMessage = () => {
    if (licenseType === "free") {
      return "Upgrade to the Basic plan to manage up to 100 items.";
    }
    return "Contact us to learn about higher tier plans.";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-upgrade">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="text-upgrade-title">
            Upgrade Your Plan
          </AlertDialogTitle>
          <AlertDialogDescription data-testid="text-upgrade-description">
            You have reached the limit of {limit} items for your {licenseType} plan
            ({currentCount}/{limit} items used).
            <br />
            <br />
            {getUpgradeMessage()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-upgrade-cancel">
            Maybe Later
          </AlertDialogCancel>
          <AlertDialogAction data-testid="button-upgrade-confirm">
            Contact Sales
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
