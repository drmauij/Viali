import { useActiveHospital } from "@/hooks/useActiveHospital";
import { TemplateGallery } from "@/components/contracts/TemplateGallery";

export default function ContractTemplatesPage() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  if (!hospitalId) return null;
  return <TemplateGallery scope="hospital" ownerId={hospitalId} />;
}
