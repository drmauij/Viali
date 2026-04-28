import { useRoute } from "wouter";
import { TemplateGallery } from "@/components/contracts/TemplateGallery";
import { TemplateEditor } from "@/components/contracts/TemplateEditor";
import { useActiveHospital } from "@/hooks/useActiveHospital";

export default function ContractTemplatesPage() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [match, params] = useRoute<{ id: string }>("/business/contracts/templates/:id");
  if (!hospitalId) return null;
  return match
    ? <TemplateEditor templateId={params.id} scope="hospital" ownerId={hospitalId} />
    : <TemplateGallery scope="hospital" ownerId={hospitalId} />;
}
