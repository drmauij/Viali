import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FlowForm, {
  type FlowFormSubmitPayload,
  type FlowFormTestSendPayload,
} from "@/components/flows/FlowForm";
import MultiLocationSelector from "@/components/flows/MultiLocationSelector";

interface CampaignCreateProps {
  editId?: string;
}

export default function CampaignCreate({ editId }: CampaignCreateProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const hospitalId = activeHospital?.id;

  // Audience state: parent owns it because the slot is rendered here.
  // Default = active hospital only; for edit mode, hydrate from existing flow.
  const [audienceHospitalIds, setAudienceHospitalIds] = useState<string[]>(
    hospitalId ? [hospitalId] : []
  );

  // For edit mode, fetch the flow from the chain flows list (avoids the
  // /api/business/:hospitalId/flows/:flowId 404 trap when active hospital
  // isn't the owning hospital).
  const { data: chainFlowsData } = useQuery<{ flows: any[] }>({
    queryKey: [`/api/chain/${groupId}/flows`],
    enabled: !!editId && !!groupId,
  });
  const existingFlow = editId
    ? chainFlowsData?.flows.find((f) => f.id === editId)
    : undefined;

  // Hydrate audience from existing flow once it loads
  useEffect(() => {
    if (existingFlow?.audienceHospitals && existingFlow.audienceHospitals.length > 0) {
      setAudienceHospitalIds(
        existingFlow.audienceHospitals.map((h: any) => h.hospitalId)
      );
    }
  }, [existingFlow]);

  const buildBody = (payload: FlowFormSubmitPayload) => ({
    ...payload,
    hospitalId, // owning hospital = active clinic
    audienceHospitalIds,
  });

  const handleSaveDraft = async (payload: FlowFormSubmitPayload) => {
    if (!groupId || !hospitalId) return;
    try {
      const path = editId
        ? `/api/chain/${groupId}/flows/${editId}`
        : `/api/chain/${groupId}/flows`;
      const method = editId ? "PATCH" : "POST";
      await apiRequest(method, path, buildBody(payload));
      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/flows`] });
      toast({
        title: t("flows.toast.draftSaved", "Draft saved"),
        description: t(
          "flows.toast.draftSavedDesc",
          "You can continue editing later."
        ),
      });
      navigate("/chain/campaigns");
    } catch (e: any) {
      toast({
        title: t("common.error", "Error"),
        description:
          e?.message ?? t("flows.toast.draftError", "Could not save draft."),
        variant: "destructive",
      });
    }
  };

  const handleSend = async (payload: FlowFormSubmitPayload) => {
    if (!groupId || !hospitalId) return;
    try {
      // Step 1: create or update the flow with explicit audience
      let flowId: string;
      if (editId) {
        await apiRequest(
          "PATCH",
          `/api/chain/${groupId}/flows/${editId}`,
          buildBody(payload)
        );
        flowId = editId;
      } else {
        const flowRes = await apiRequest(
          "POST",
          `/api/chain/${groupId}/flows`,
          buildBody(payload)
        );
        const flow = await flowRes.json();
        flowId = flow.id;
      }

      // Step 2: trigger send. After C1's refactor, the send endpoint reads
      // audience from flow_hospitals — no scope header required.
      await apiRequest("POST", `/api/business/${hospitalId}/flows/${flowId}/send`);

      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/flows`] });
      toast({
        title: t("flows.toast.sent", "Campaign sent"),
        description: t(
          "flows.toast.sentDescription",
          "{{name}} was sent successfully.",
          { name: payload.name }
        ),
      });
      navigate("/chain/campaigns");
    } catch (e: any) {
      toast({
        title: t("common.error", "Error"),
        description:
          e?.message ??
          t("flows.toast.sendError", "The campaign could not be sent."),
        variant: "destructive",
      });
    }
  };

  const handleSendTest = async (payload: FlowFormTestSendPayload) => {
    if (!hospitalId) return;
    try {
      await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/test-send`,
        payload
      );
      toast({
        title: t("flows.toast.testSent", "Test sent"),
        description: t(
          "flows.toast.testSentDesc",
          "Test message sent to {{recipient}}.",
          { recipient: payload.recipient }
        ),
      });
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("flows.toast.testError", "Could not send test."),
        variant: "destructive",
      });
    }
  };

  if (!groupId || !hospitalId) {
    return (
      <div
        className="p-8 text-center text-muted-foreground"
        data-testid="campaign-create-no-group"
      >
        {t("chain.campaigns.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  return (
    <div
      className="p-4 space-y-3 max-w-3xl mx-auto"
      data-testid="chain-campaign-create"
    >
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/chain/campaigns")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {editId
              ? t("chain.campaigns.edit", "Edit campaign")
              : t("chain.campaigns.new", "New campaign")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("flows.create.subtitle", "Configure step by step")}
          </p>
        </div>
      </div>

      <FlowForm
        hospitalId={hospitalId}
        editFlowId={editId}
        audienceSlot={
          <MultiLocationSelector
            groupId={groupId}
            value={audienceHospitalIds}
            onChange={setAudienceHospitalIds}
          />
        }
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
        onSendTest={handleSendTest}
        onCancel={() => navigate("/chain/campaigns")}
      />
    </div>
  );
}
