import { useState } from "react";
import { Link, useLocation } from "wouter";
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
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";

/**
 * `/business/group` — group admin surface (Task 13).
 *
 * Aimed at Patrick's (group_admin) persona: a light "Manage Group" landing
 * page that summarises the chain and lets them promote/revoke peer group
 * admins. Scoped entirely to the currently-active hospital's group via
 * the `X-Active-Hospital-Id` header — no group ID appears in the URL.
 *
 * Things group admins explicitly CANNOT do from here (platform-admin only):
 *   - add/remove member hospitals
 *   - rename the group
 *   - regenerate the booking token
 *
 * A friendly hint points those to support.
 */

type Overview = {
  group: { id: string; name: string; bookingToken: string | null };
  members: Array<{ id: string; name: string; address: string | null }>;
  counts: {
    patientCount: number;
    treatmentsThisMonth: number;
    bookingsThisWeek: number;
  };
};

type Admin = {
  userId: string;
  hospitalId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

type GroupUser = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  hospitalId: string;
};


export default function BusinessGroup() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Click a clinic pill → switch the active hospital to that clinic and
  // land on its Admin page. Mirrors the handleHospitalChange in Layout.tsx
  // (localStorage + hospital-changed event), but goes straight to /admin
  // instead of preserving the current page.
  const jumpToClinicAdmin = (hospitalId: string) => {
    const userHospitals = (user as any)?.hospitals ?? [];
    // Prefer an admin row, then group_admin, then any role at this hospital.
    const candidates = userHospitals.filter((h: any) => h.id === hospitalId);
    const target =
      candidates.find((h: any) => h.role === "admin") ??
      candidates.find((h: any) => h.role === "group_admin") ??
      candidates[0];
    if (!target) {
      toast({
        title: "Cannot switch",
        description: "You have no role at this clinic.",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem(
      "activeHospital",
      `${target.id}-${target.unitId}-${target.role}`,
    );
    window.dispatchEvent(new CustomEvent("hospital-changed"));
    navigate("/admin");
  };

  const { data: overview, isLoading: overviewLoading, error: overviewError } =
    useQuery<Overview>({
      queryKey: ["/api/business/group/overview"],
      queryFn: () =>
        apiRequest("GET", "/api/business/group/overview").then((r) => r.json()),
      enabled: !!activeHospital?.id,
    });

  const { data: admins = [] } = useQuery<Admin[]>({
    queryKey: ["/api/business/group/admins"],
    queryFn: () =>
      apiRequest("GET", "/api/business/group/admins").then((r) => r.json()),
    enabled: !!overview,
  });

  const { data: groupUsers = [] } = useQuery<GroupUser[]>({
    queryKey: ["/api/business/group/users"],
    queryFn: () =>
      apiRequest("GET", "/api/business/group/users").then((r) => r.json()),
    enabled: !!overview,
  });

  const [promoteUserId, setPromoteUserId] = useState<string>("");
  const [promoteHospitalId, setPromoteHospitalId] = useState<string>("");

  const invalidateAdmins = () => {
    qc.invalidateQueries({ queryKey: ["/api/business/group/admins"] });
  };

  const promote = useMutation({
    mutationFn: async (vars: { userId: string; hospitalId: string }) => {
      await apiRequest("POST", "/api/business/group/admins", vars);
    },
    onSuccess: () => {
      invalidateAdmins();
      setPromoteUserId("");
      setPromoteHospitalId("");
      toast({ title: "User promoted to group admin" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not promote user",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const revoke = useMutation({
    mutationFn: async (vars: { userId: string; hospitalId: string }) => {
      await apiRequest(
        "DELETE",
        `/api/business/group/admins/${vars.userId}/${vars.hospitalId}`,
      );
    },
    onSuccess: () => {
      invalidateAdmins();
      toast({ title: "Group admin revoked" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not revoke group admin",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (overviewLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"
          data-testid="loading-spinner"
        />
      </div>
    );
  }

  if (overviewError || !overview) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Manage Group</h1>
        <p className="text-sm text-muted-foreground mt-2">
          You don&apos;t have group admin access for the active location, or
          this location isn&apos;t part of a group yet. Contact Viali support if
          you believe this is a mistake.
        </p>
      </div>
    );
  }

  const { group, members } = overview;

  // Build user picker options: unique users (by userId) from any group hospital.
  const uniqueUsers = Array.from(
    new Map(groupUsers.map((u) => [u.userId, u])).values(),
  );

  return (
    <div className="p-6 space-y-6" data-testid="business-group-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Managing {group.name}</h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="w-full overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            <TabsTrigger
              value="overview"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-overview"
            >
              Shortcuts
            </TabsTrigger>
            <TabsTrigger
              value="admins"
              className="whitespace-nowrap flex-shrink-0"
              data-testid="tab-admins"
            >
              Admins ({admins.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
      {/* All three shortcut cards in one grid, same styling / padding /
          border so they read as equal-weight peers. Quick admin spans both
          columns on desktop because it holds N clinic pills; the two
          link-out cards each take one column below. On mobile everything
          stacks. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="sm:col-span-2 border rounded p-4 space-y-3">
          <div>
            <h2 className="text-lg font-medium">Quick admin</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Jump into any clinic's admin area in one click — switches the
              active location for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpToClinicAdmin(m.id)}
                className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                title={`Switch to ${m.name} and open Admin`}
                data-testid={`member-chip-${m.id}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => navigate("/clinic/services?scope=group")}
          className="text-left border rounded p-4 hover:bg-accent transition-colors"
          data-testid="link-group-services"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Group service catalog</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Edit the service catalog shared across every clinic in the
                chain. Prices apply everywhere.
              </p>
            </div>
            <span className="text-muted-foreground text-xl shrink-0" aria-hidden>
              →
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/business/funnels?scope=group")}
          className="text-left border rounded p-4 hover:bg-accent transition-colors"
          data-testid="link-chain-marketing"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Chain marketing</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Run newsletters and automations across every location at
                once.
              </p>
            </div>
            <span className="text-muted-foreground text-xl shrink-0" aria-hidden>
              →
            </span>
          </div>
        </button>
      </div>
        </TabsContent>

        <TabsContent value="admins" className="mt-4 space-y-6">
      {/* Group admins section */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">
          Group Admins ({admins.length})
        </h2>
        {admins.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No group admins yet.
          </div>
        ) : (
          <ul className="divide-y">
            {admins.map((a) => {
              const memberName =
                members.find((m) => m.id === a.hospitalId)?.name ??
                a.hospitalId;
              const display =
                [a.firstName, a.lastName].filter(Boolean).join(" ") ||
                a.email ||
                a.userId;
              return (
                <li
                  key={`${a.userId}-${a.hospitalId}`}
                  className="py-2 flex justify-between items-center"
                >
                  <div>
                    <div className="text-sm">{display}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.email ? `${a.email} · ` : ""}@ {memberName}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Revoke group_admin role for ${display} at ${memberName}?`,
                        )
                      ) {
                        revoke.mutate({
                          userId: a.userId,
                          hospitalId: a.hospitalId,
                        });
                      }
                    }}
                    data-testid={`button-revoke-${a.userId}-${a.hospitalId}`}
                  >
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Promote form */}
        <div className="pt-3 border-t space-y-2">
          <div className="text-sm font-medium">Promote new group admin</div>
          <div className="text-xs text-muted-foreground">
            The user must already have a role at the chosen location — they
            get an additional <code>group_admin</code> row there. Their other
            roles stay untouched.
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={promoteUserId}
              onValueChange={setPromoteUserId}
            >
              <SelectTrigger
                className="w-64"
                data-testid="select-promote-user"
              >
                <SelectValue placeholder="— choose a user —" />
              </SelectTrigger>
              <SelectContent>
                {uniqueUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No users in this group
                  </SelectItem>
                ) : (
                  uniqueUsers.map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") ||
                        u.email ||
                        u.userId}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Select
              value={promoteHospitalId}
              onValueChange={setPromoteHospitalId}
            >
              <SelectTrigger
                className="w-64"
                data-testid="select-promote-hospital"
              >
                <SelectValue placeholder="— choose a location —" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={
                !promoteUserId ||
                !promoteHospitalId ||
                promote.isPending
              }
              onClick={() =>
                promote.mutate({
                  userId: promoteUserId,
                  hospitalId: promoteHospitalId,
                })
              }
              data-testid="button-promote"
            >
              {promote.isPending ? "Promoting…" : "Promote"}
            </Button>
          </div>
        </div>
      </section>

      {/* Platform-only hint */}
      <section className="border border-dashed rounded p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">Need more changes?</div>
        <div>
          Adding or removing locations, renaming the group, and regenerating
          the booking link are platform-admin actions. Contact Viali support
          or your platform admin for those.
        </div>
      </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
