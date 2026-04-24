import { useEffect, useState } from "react";
import { Link, useParams, useLocation, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/**
 * Group detail view. Platform-admin only.
 * Members can be added/removed, admins are read-only here (Phase 1 — promote
 * UI lives at /business/group in Task 13; for the demo Mau can seed via SQL).
 */

type LicenseType = "free" | "basic" | "test";

type Group = {
  id: string;
  name: string;
  bookingToken: string | null;
  defaultLicenseType: LicenseType | null;
  defaultPricePerRecord: string | null;
  logoUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type Hospital = {
  id: string;
  name: string;
  groupId: string | null;
  licenseType: LicenseType;
  pricePerRecord: string | null;
  companyLogoUrl: string | null;
};
type Admin = {
  userId: string;
  hospitalId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

type GroupDetailData = {
  group: Group;
  members: Hospital[];
  admins: Admin[];
};

export default function GroupDetail() {
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const qc = useQueryClient();
  const [, setLoc] = useLocation();
  const { toast } = useToast();
  const [addPick, setAddPick] = useState<string>("");

  const { data, isLoading } = useQuery<GroupDetailData>({
    queryKey: [`/api/admin/groups/${groupId}`],
    queryFn: () =>
      apiRequest("GET", `/api/admin/groups/${groupId}`).then((r) => r.json()),
    enabled: !!groupId && !!user?.isPlatformAdmin,
  });

  const { data: allHospitals = [] } = useQuery<Hospital[]>({
    queryKey: ["/api/admin/hospitals"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/hospitals").then((r) => r.json()),
    enabled: !!user?.isPlatformAdmin,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/admin/groups/${groupId}`] });
    qc.invalidateQueries({ queryKey: ["/api/admin/groups"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/hospitals"] });
  };

  const addMember = useMutation({
    mutationFn: async (hospitalId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/groups/${groupId}/members`,
        { hospitalId },
      );
      return res;
    },
    onSuccess: () => {
      invalidate();
      setAddPick("");
    },
    onError: (err: Error) => {
      toast({
        title: "Could not add hospital",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (hospitalId: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/groups/${groupId}/members/${hospitalId}`,
      );
      // 200 with warning → parse body; 204 → no body.
      if (res.status === 204) return null;
      return res.json();
    },
    onSuccess: (body: any) => {
      invalidate();
      if (body?.warning) {
        toast({
          title: "Hospital removed — with warning",
          description: body.warning,
        });
      }
    },
  });

  // Billing ---------------------------------------------------------------
  const updateGroupBilling = useMutation({
    mutationFn: async (patch: {
      defaultLicenseType?: LicenseType | null;
      defaultPricePerRecord?: string | null;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/groups/${groupId}/billing`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Group billing saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const cascadeBilling = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/groups/${groupId}/cascade-billing`,
      );
      return res.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (body) => {
      invalidate();
      toast({
        title: "Billing cascaded",
        description: `Applied group defaults to ${body.updatedCount} clinic(s).`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Cascade failed", description: err.message, variant: "destructive" });
    },
  });

  const updateClinicBilling = useMutation({
    mutationFn: async (v: {
      hospitalId: string;
      licenseType?: LicenseType;
      pricePerRecord?: string | null;
    }) => {
      const { hospitalId, ...patch } = v;
      const res = await apiRequest(
        "PATCH",
        `/api/admin/hospitals/${hospitalId}/billing`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Clinic billing saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  // Group admin promote / revoke -----------------------------------------
  const promoteAdmin = useMutation({
    mutationFn: async (v: { userId: string; hospitalId: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/groups/${groupId}/admins`,
        v,
      );
      return res.status === 204 ? null : res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Promoted to group admin" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not promote",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const revokeAdmin = useMutation({
    mutationFn: async (v: { userId: string; hospitalId: string }) => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/groups/${groupId}/admins/${v.userId}/${v.hospitalId}`,
      );
      return res.status === 204 ? null : res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Group admin revoked" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not revoke",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const regenToken = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/groups/${groupId}/booking-token`,
      );
      return res.json() as Promise<{ bookingToken: string }>;
    },
    onSuccess: (body, _vars, _ctx) => {
      invalidate();
      // Surface the new URL so the platform admin can copy it immediately.
      toast({
        title: "New booking URL generated",
        description: `/book/g/${body.bookingToken}`,
      });
      // If we just replaced an existing token, warn that the old one is dead.
      if (data?.group.bookingToken) {
        toast({
          title: "Previous URL invalidated",
          description:
            "The previous booking link will no longer work. Update any shared copies.",
          variant: "destructive",
        });
      }
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/groups/${groupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
      }
    },
    onSuccess: () => setLoc("/admin/groups"),
    onError: (err: Error) => {
      toast({
        title: "Could not delete group",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"
          data-testid="loading-spinner"
        />
      </div>
    );
  }
  if (!user?.isPlatformAdmin) {
    return <Redirect to="/" />;
  }
  if (!data) {
    return (
      <div className="p-6 space-y-2">
        <div>Group not found.</div>
        <Link
          href="/admin/groups"
          className="text-sm text-primary hover:underline"
          data-testid="link-back-to-groups"
        >
          ← Back to Groups
        </Link>
      </div>
    );
  }

  const { group, members, admins } = data;
  const memberIds = new Set(members.map((m) => m.id));
  const available = allHospitals.filter(
    (h) => !h.groupId && !memberIds.has(h.id),
  );

  return (
    <div className="p-6 space-y-6" data-testid="admin-group-detail">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            <a href="/admin/groups" className="hover:underline">
              ← All groups
            </a>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{group.name}</h1>
        </div>
        <Button
          variant="destructive"
          disabled={deleteGroup.isPending}
          onClick={() => {
            if (
              confirm(
                `Delete group "${group.name}"? This cannot be undone. Members and group-owned services must be removed first.`,
              )
            ) {
              deleteGroup.mutate();
            }
          }}
          data-testid="button-delete-group"
        >
          {deleteGroup.isPending ? "Deleting…" : "Delete group"}
        </Button>
      </div>

      <Tabs defaultValue="clinics" className="w-full">
        {/* Horizontal scroll on small screens so long labels never clip.
            Flex + overflow-x-auto beats grid-cols-4 on phones. */}
        <div className="w-full overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            <TabsTrigger
              value="clinics"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-clinics"
            >
              Clinics ({members.length})
            </TabsTrigger>
            <TabsTrigger
              value="admins"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-admins"
            >
              Admins ({admins.length})
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-billing"
            >
              Billing & Plan
            </TabsTrigger>
            <TabsTrigger
              value="booking"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-booking"
            >
              Booking
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="clinics" className="mt-4">
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">
          Member Hospitals ({members.length})
        </h2>
        {members.length === 0 ? (
          <div className="text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <ul className="divide-y">
            {members.map((h) => (
              <li
                key={h.id}
                className="flex justify-between items-center py-2"
              >
                <span>{h.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeMember.isPending}
                  onClick={() => {
                    if (confirm(`Remove "${h.name}" from this group?`)) {
                      removeMember.mutate(h.id);
                    }
                  }}
                  data-testid={`button-remove-member-${h.id}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 pt-2 border-t">
          <Select value={addPick} onValueChange={setAddPick}>
            <SelectTrigger
              className="w-64"
              data-testid="select-add-hospital"
            >
              <SelectValue placeholder="— choose a hospital —" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No un-grouped hospitals
                </SelectItem>
              ) : (
                available.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={
              !addPick || addPick === "__none" || addMember.isPending
            }
            onClick={() => addPick && addMember.mutate(addPick)}
            data-testid="button-add-member"
          >
            Add hospital
          </Button>
        </div>
      </section>
        </TabsContent>

        <TabsContent value="admins" className="mt-4 border rounded p-4">
          <AdminsSection
            groupId={group.id}
            admins={admins}
            members={members}
            onPromote={(v) => promoteAdmin.mutate(v)}
            onRevoke={(v) => {
              if (!confirm("Revoke group admin from this user?")) return;
              revokeAdmin.mutate(v);
            }}
            promoting={promoteAdmin.isPending}
            promotingKey={
              promoteAdmin.isPending && promoteAdmin.variables
                ? `${promoteAdmin.variables.userId}-${promoteAdmin.variables.hospitalId}`
                : null
            }
            revoking={revokeAdmin.isPending}
            revokingKey={
              revokeAdmin.isPending && revokeAdmin.variables
                ? `${revokeAdmin.variables.userId}-${revokeAdmin.variables.hospitalId}`
                : null
            }
          />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingSection
        group={group}
        members={members}
        onGroupSave={(patch) => updateGroupBilling.mutate(patch)}
        onCascade={() => {
          if (
            !confirm(
              `Apply group defaults to all ${members.length} clinics? This overwrites the plan and price-per-record on every member clinic.`,
            )
          ) return;
          cascadeBilling.mutate();
        }}
        onClinicSave={(patch) => updateClinicBilling.mutate(patch)}
        groupSaving={updateGroupBilling.isPending}
        cascading={cascadeBilling.isPending}
        clinicSaving={updateClinicBilling.isPending}
            clinicSavingId={
              updateClinicBilling.isPending
                ? (updateClinicBilling.variables?.hospitalId ?? null)
                : null
            }
          />
        </TabsContent>

        <TabsContent value="booking" className="mt-4">
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Group Booking Token</h2>
        {group.bookingToken ? (
          <div>
            <div className="text-sm text-muted-foreground">Public URL</div>
            <div
              className="font-mono text-sm break-all"
              data-testid="text-booking-url"
            >
              /book/g/{group.bookingToken}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No booking token generated yet.
          </div>
        )}
        <Button
          size="sm"
          disabled={regenToken.isPending}
          onClick={() => {
            if (
              group.bookingToken &&
              !confirm("Regenerate token? The previous URL will stop working.")
            ) {
              return;
            }
            regenToken.mutate();
          }}
          data-testid="button-regen-token"
        >
          {regenToken.isPending
            ? "Working…"
            : group.bookingToken
              ? "Regenerate"
              : "Generate"}
        </Button>
      </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Billing & Plan section — group defaults with optional cascade to clinics,
// plus per-clinic override. Inline <select> + <input> auto-save on blur/change.
type BillingSectionProps = {
  group: Group;
  members: Hospital[];
  onGroupSave: (patch: {
    defaultLicenseType?: LicenseType | null;
    defaultPricePerRecord?: string | null;
  }) => void;
  onCascade: () => void;
  onClinicSave: (v: {
    hospitalId: string;
    licenseType?: LicenseType;
    pricePerRecord?: string | null;
  }) => void;
  groupSaving: boolean;
  cascading: boolean;
  clinicSaving: boolean;
  clinicSavingId: string | null;
};

function BillingSection(props: BillingSectionProps) {
  const { group, members, onGroupSave, onCascade } = props;
  const [groupPlan, setGroupPlan] = useState<LicenseType | "">(
    (group.defaultLicenseType ?? "") as LicenseType | "",
  );
  const [groupPrice, setGroupPrice] = useState<string>(
    group.defaultPricePerRecord ?? "",
  );
  // Sync local form state whenever the server-side group data changes
  // (e.g. after Save group defaults or after a mutation elsewhere).
  useEffect(() => {
    setGroupPlan((group.defaultLicenseType ?? "") as LicenseType | "");
    setGroupPrice(group.defaultPricePerRecord ?? "");
  }, [group.defaultLicenseType, group.defaultPricePerRecord]);

  return (
    <section className="border rounded p-4 space-y-4">
      <h2 className="text-lg font-medium">Billing & Plan</h2>

      <div className="space-y-3 bg-muted/40 p-3 rounded">
        <div className="text-sm font-medium">Group defaults</div>
        <p className="text-xs text-muted-foreground">
          Applies to new clinics added to this group, and can be cascaded
          to existing clinics with the button below.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Plan
            </label>
            <Select
              value={groupPlan || "none"}
              onValueChange={(v) => setGroupPlan(v === "none" ? "" : (v as LicenseType))}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-group-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— not set —</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Price per record
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1.50"
              value={groupPrice}
              onChange={(e) => setGroupPrice(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm w-[140px]"
              data-testid="input-group-price"
            />
          </div>
          <Button
            size="sm"
            disabled={props.groupSaving}
            onClick={() =>
              onGroupSave({
                defaultLicenseType: groupPlan === "" ? null : groupPlan,
                defaultPricePerRecord: groupPrice.trim() === "" ? null : groupPrice.trim(),
              })
            }
            data-testid="button-save-group-billing"
          >
            {props.groupSaving ? "Saving…" : "Save group defaults"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={
              props.cascading ||
              (group.defaultLicenseType == null && group.defaultPricePerRecord == null)
            }
            onClick={onCascade}
            data-testid="button-cascade-billing"
          >
            {props.cascading ? "Cascading…" : "Apply to all clinics"}
          </Button>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No clinics in this group yet.
        </div>
      ) : (
        <div>
          <div className="text-sm font-medium mb-2">Per-clinic billing</div>
          <div className="divide-y border rounded">
            {members.map((h) => (
              <ClinicBillingRow
                key={h.id}
                clinic={h}
                saving={props.clinicSavingId === h.id && props.clinicSaving}
                onSave={(patch) =>
                  props.onClinicSave({ hospitalId: h.id, ...patch })
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ClinicBillingRow({
  clinic,
  saving,
  onSave,
}: {
  clinic: Hospital;
  saving: boolean;
  onSave: (patch: { licenseType?: LicenseType; pricePerRecord?: string | null }) => void;
}) {
  const [plan, setPlan] = useState<LicenseType>(clinic.licenseType);
  const [price, setPrice] = useState<string>(clinic.pricePerRecord ?? "");
  // Re-sync when the clinic prop changes (e.g. after cascade-billing or a
  // peer save). Without this the row shows stale local state forever.
  useEffect(() => {
    setPlan(clinic.licenseType);
    setPrice(clinic.pricePerRecord ?? "");
  }, [clinic.licenseType, clinic.pricePerRecord]);

  const dirty =
    plan !== clinic.licenseType ||
    (price.trim() || null) !== (clinic.pricePerRecord ?? null);

  return (
    <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
      <div className="min-w-[160px] text-sm font-medium">{clinic.name}</div>
      <Select value={plan} onValueChange={(v) => setPlan(v as LicenseType)}>
        <SelectTrigger className="w-[140px] h-8" data-testid={`select-clinic-plan-${clinic.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="basic">Basic</SelectItem>
          <SelectItem value="test">Test</SelectItem>
        </SelectContent>
      </Select>
      <input
        type="text"
        inputMode="decimal"
        placeholder="price / record"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="border rounded px-2 py-1 text-sm w-[130px]"
        data-testid={`input-clinic-price-${clinic.id}`}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty || saving}
        onClick={() =>
          onSave({
            licenseType: plan,
            pricePerRecord: price.trim() === "" ? null : price.trim(),
          })
        }
        data-testid={`button-save-clinic-billing-${clinic.id}`}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------
// Admins section: live email search + inline promote per eligible hospital,
// with revoke buttons on existing group admin rows.
// ----------------------------------------------------------------------
type AdminsSectionProps = {
  groupId: string;
  admins: Admin[];
  members: Hospital[];
  onPromote: (v: { userId: string; hospitalId: string }) => void;
  onRevoke: (v: { userId: string; hospitalId: string }) => void;
  promoting: boolean;
  promotingKey: string | null;
  revoking: boolean;
  revokingKey: string | null;
};

type SearchHit = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  hospitalsInGroup: Array<{
    hospitalId: string;
    hospitalName: string;
    role: string;
    isGroupAdmin: boolean;
  }>;
};

function AdminsSection(props: AdminsSectionProps) {
  const { admins, members } = props;
  const [q, setQ] = useState("");
  // Debounce the query so every keystroke doesn't fire a request.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results = [], isFetching } = useQuery<SearchHit[]>({
    queryKey: [
      `/api/admin/groups/${props.groupId}/user-search`,
      debouncedQ,
    ],
    queryFn: async () => {
      if (debouncedQ.trim().length < 2) return [];
      const res = await apiRequest(
        "GET",
        `/api/admin/groups/${props.groupId}/user-search?q=${encodeURIComponent(debouncedQ.trim())}`,
      );
      return res.json();
    },
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 10_000,
  });

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">
        Group Admins ({admins.length})
      </h2>

      {admins.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No group admins yet. Promote someone using the search below.
        </div>
      ) : (
        <ul className="divide-y border rounded">
          {admins.map((a) => {
            const memberName =
              members.find((m) => m.id === a.hospitalId)?.name ?? a.hospitalId;
            const display =
              [a.firstName, a.lastName].filter(Boolean).join(" ") ||
              a.email ||
              a.userId;
            const key = `${a.userId}-${a.hospitalId}`;
            const revokingThis = props.revoking && props.revokingKey === key;
            return (
              <li
                key={key}
                className="py-2 px-3 flex items-center gap-3 flex-wrap"
              >
                <div className="min-w-[200px]">
                  <div className="font-medium text-sm">{display}</div>
                  {a.email && a.email !== display && (
                    <div className="text-xs text-muted-foreground">
                      {a.email}
                    </div>
                  )}
                </div>
                <span className="text-sm text-muted-foreground flex-1">
                  @ {memberName}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revokingThis}
                  onClick={() =>
                    props.onRevoke({
                      userId: a.userId,
                      hospitalId: a.hospitalId,
                    })
                  }
                  data-testid={`button-revoke-${key}`}
                >
                  {revokingThis ? "Revoking…" : "Revoke"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 pt-2 border-t">
        <div className="text-sm font-medium">Promote a user</div>
        <input
          type="search"
          placeholder="Search users by email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full max-w-md"
          data-testid="input-admin-search"
        />
        {debouncedQ.trim().length > 0 && debouncedQ.trim().length < 2 && (
          <div className="text-xs text-muted-foreground">
            Type at least 2 characters to search.
          </div>
        )}
        {isFetching && (
          <div className="text-xs text-muted-foreground">Searching…</div>
        )}
        {debouncedQ.trim().length >= 2 && !isFetching && results.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No users matching that email.
          </div>
        )}
        {results.length > 0 && (
          <ul className="divide-y border rounded">
            {results.map((u) => {
              const display =
                [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                u.email ||
                u.userId;
              const eligibleHospitals = u.hospitalsInGroup.filter(
                (h) => !h.isGroupAdmin,
              );
              return (
                <li
                  key={u.userId}
                  className="py-2 px-3 flex items-center gap-3 flex-wrap"
                >
                  <div className="min-w-[220px]">
                    <div className="font-medium text-sm">{display}</div>
                    {u.email && (
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap flex-1 justify-end">
                    {u.hospitalsInGroup.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        No role at any group clinic — add a role first.
                      </span>
                    ) : eligibleHospitals.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        Already group admin at every clinic they belong to.
                      </span>
                    ) : (
                      eligibleHospitals.map((h) => {
                        const key = `${u.userId}-${h.hospitalId}`;
                        const promotingThis =
                          props.promoting && props.promotingKey === key;
                        return (
                          <Button
                            key={h.hospitalId}
                            size="sm"
                            disabled={promotingThis}
                            onClick={() =>
                              props.onPromote({
                                userId: u.userId,
                                hospitalId: h.hospitalId,
                              })
                            }
                            data-testid={`button-promote-${key}`}
                          >
                            {promotingThis
                              ? "Promoting…"
                              : `Promote @ ${h.hospitalName}`}
                          </Button>
                        );
                      })
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
