import { useActiveHospital } from '@/hooks/useActiveHospital';
import { Redirect } from 'wouter';
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel';

export default function Recovery() {
  const activeHospital = useActiveHospital();

  // Same role gating as the leads / funnels surfaces (isMarketingOrManager
  // on the API side requires admin/manager/marketing/nurse/group_admin).
  const isManager =
    activeHospital?.role === 'admin' ||
    activeHospital?.role === 'group_admin' ||
    activeHospital?.role === 'manager' ||
    activeHospital?.role === 'marketing' ||
    activeHospital?.role === 'nurse';

  if (activeHospital && !isManager) {
    return <Redirect to="/business/administration" />;
  }

  if (!activeHospital?.id) {
    return null;
  }

  return (
    <div className="container mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Recovery</h1>
        <p className="text-sm text-muted-foreground">
          Win-back follow-up for no-shows and cancellations that haven't rebooked.
        </p>
      </header>
      <RecoveryPanel hospitalId={activeHospital.id} />
    </div>
  );
}
