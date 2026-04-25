import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useScopeToggle } from "@/hooks/useScopeToggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FlowForm, {
  type FlowFormSubmitPayload,
  type FlowFormTestSendPayload,
} from "@/components/flows/FlowForm";

/**
 * Clinic-scoped Flow create/edit page. Thin shell around the shared
 * `<FlowForm>` — owns:
 *   - the page header (back button, title, scope toggle)
 *   - the API endpoints (`/api/business/:hospitalId/flows[...]`)
 *   - the toast + nav side effects
 *
 * The chain equivalent (Phase C `/chain/campaigns/new`) reuses `<FlowForm>`
 * with an `audienceSlot` and routes its submits to `/api/chain/:groupId/flows`.
 */
export default function FlowCreate({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const { toast } = useToast();

  // Scope toggle — "This clinic" (default) vs. "All locations". Only available
  // to group_admins on a grouped hospital; widens the audience across the chain
  // when the user picks "All locations". Passed down to FlowForm so segment
  // count + (eventual) send call reflect the wider audience.
  const { data: groupInfo } = useQuery<{
    groupId: string | null;
    groupName: string | null;
    isGroupAdmin: boolean;
  }>({
    queryKey: ["/api/clinic", hospitalId, "group-info"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic/${hospitalId}/group-info`).then((r) => r.json()),
    enabled: !!hospitalId,
  });
  const canUseGroupScope = !!groupInfo?.groupId && !!groupInfo?.isGroupAdmin;
  const { scope, setScope } = useScopeToggle({ available: canUseGroupScope });

  const handleSaveDraft = async (payload: FlowFormSubmitPayload) => {
    if (!hospitalId) return;
    try {
      if (editId) {
        await apiRequest("PATCH", `/api/business/${hospitalId}/flows/${editId}`, payload);
      } else {
        await apiRequest("POST", `/api/business/${hospitalId}/flows`, payload);
      }
      queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] });
      toast({
        title: t("flows.toast.draftSaved", "Draft saved"),
        description: t("flows.toast.draftSavedDesc", "You can continue editing later."),
      });
      navigate("/business/flows");
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("flows.toast.draftError", "Could not save draft."),
        variant: "destructive",
      });
    }
  };

  const handleSend = async (payload: FlowFormSubmitPayload) => {
    if (!hospitalId) return;
    try {
      // Flow record always belongs to the initiating hospital. The group
      // scope only widens the AUDIENCE — not the ownership — so we don't
      // thread `scope` onto the create call, only onto the send call where
      // it picks which patients to target.
      const flowRes = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows`,
        payload,
      );
      const flow = await flowRes.json();
      await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/${flow.id}/send`,
        undefined,
        scope === "group" ? { scope: "group" } : undefined,
      );
      toast({
        title: t("flows.toast.sent", "Campaign sent"),
        description: t("flows.toast.sentDescription", "{{name}} was sent successfully.", {
          name: payload.name,
        }),
      });
      navigate("/business/flows");
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("flows.toast.sendError", "The campaign could not be sent."),
        variant: "destructive",
      });
    }
  };

  const handleSendTest = async (payload: FlowFormTestSendPayload) => {
    if (!hospitalId) return;
    try {
      await apiRequest("POST", `/api/business/${hospitalId}/flows/test-send`, payload);
      toast({
        title: t("flows.toast.testSent", "Test sent"),
        description: t("flows.toast.testSentDesc", "Test message sent to {{recipient}}.", {
          recipient: payload.recipient,
        }),
      });
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("flows.toast.testError", "Could not send test."),
        variant: "destructive",
      });
    }
  };

  if (!hospitalId) return null;

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      {/* Page chrome — back button, title, scope toggle */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{t("flows.newCampaign", "New Campaign")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("flows.create.subtitle", "Configure step by step")}
          </p>
        </div>
        {canUseGroupScope && (
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(value) => {
              if (value === "hospital" || value === "group") setScope(value);
            }}
            variant="outline"
            size="sm"
            data-testid="toggle-flow-create-scope"
          >
            <ToggleGroupItem
              value="hospital"
              aria-label="This clinic"
              data-testid="toggle-flow-create-scope-hospital"
            >
              {t("flows.scope.thisClinic", "This clinic")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="group"
              aria-label="All locations"
              data-testid="toggle-flow-create-scope-group"
            >
              {t("flows.scope.allLocations", "All locations")}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      <FlowForm
        hospitalId={hospitalId}
        editFlowId={editId}
        audienceSlot={null}
        scope={scope}
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
        onSendTest={handleSendTest}
        onCancel={() => navigate("/business/flows")}
      />
    </div>
  );
}
