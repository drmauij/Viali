import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StammblattForm, StammblattData } from "@/components/stammblatt/StammblattForm";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ProfileStammblatt() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<StammblattData & { submittedAt?: string | null }>({
    queryKey: ["/api/me/stammblatt"],
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<StammblattData>) => {
      const res = await apiRequest("PATCH", "/api/me/stammblatt", patch);
      return res.json();
    },
    onSuccess: (res: { submittedAt?: string | null }) => {
      if (res.submittedAt) {
        toast({
          title: t("stammblatt.submitted", "Personalstammblatt vollständig — vielen Dank."),
        });
      } else {
        toast({ title: t("stammblatt.saved", "Gespeichert") });
      }
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  const initial: StammblattData = {
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    profession: data.profession ?? "",
    address: data.address ?? "",
    city: data.city ?? "",
    zip: data.zip ?? "",
    dateOfBirth: data.dateOfBirth ?? "",
    maritalStatus: data.maritalStatus ?? "",
    nationality: data.nationality ?? "",
    religion: data.religion ?? "",
    mobile: data.mobile ?? "",
    ahvNumber: data.ahvNumber ?? "",
    hasChildBenefits: data.hasChildBenefits ?? false,
    numberOfChildren: data.numberOfChildren ?? 0,
    childBenefitsRecipient: data.childBenefitsRecipient ?? "",
    childBenefitsRegistration: data.childBenefitsRegistration ?? "",
    hasResidencePermit: data.hasResidencePermit ?? false,
    residencePermitType: data.residencePermitType ?? "",
    residencePermitValidUntil: data.residencePermitValidUntil ?? "",
    residencePermitFrontImage: data.residencePermitFrontImage ?? "",
    residencePermitBackImage: data.residencePermitBackImage ?? "",
    bankName: data.bankName ?? "",
    bankAddress: data.bankAddress ?? "",
    bankAccount: data.bankAccount ?? "",
    hasOwnVehicle: data.hasOwnVehicle ?? false,
  };

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">
        {t("stammblatt.title", "Personalstammblatt")}
      </h1>
      <StammblattForm
        initialData={initial}
        onSave={async (d) => { await save.mutateAsync(d); }}
        uploadPermitImage={async (_side, _file) => {
          // Permit image upload on the in-app self-fill path is deferred (spec §8).
          // The form catches this rejection and shows an error toast — the page does not crash.
          throw new Error(
            t(
              "stammblatt.permitUploadUnavailable",
              "Dokument-Upload steht hier noch nicht zur Verfügung. Bitte nutzen Sie den Link aus Ihrer E-Mail.",
            ),
          );
        }}
        loadPermitImageUrl={async (_side) => {
          // No signed-URL endpoint on the in-app path yet — return null so the
          // form skips the image preview (shows the "uploaded" checkmark instead
          // if a storage key is already set).
          return null;
        }}
      />
    </div>
  );
}
