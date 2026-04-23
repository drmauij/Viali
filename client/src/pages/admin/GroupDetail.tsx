import { useState } from "react";
import { useParams, useLocation, Redirect } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/**
 * Group detail view. Platform-admin only.
 * Members can be added/removed, admins are read-only here (Phase 1 — promote
 * UI lives at /business/group in Task 13; for the demo Mau can seed via SQL).
 */

type Group = {
  id: string;
  name: string;
  bookingToken: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type Hospital = { id: string; name: string; groupId: string | null };
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
    enabled: !!groupId && !!(user as any)?.isPlatformAdmin,
  });

  const { data: allHospitals = [] } = useQuery<Hospital[]>({
    queryKey: ["/api/admin/hospitals"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/hospitals").then((r) => r.json()),
    enabled: !!(user as any)?.isPlatformAdmin,
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

  const regenToken = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/groups/${groupId}/booking-token`,
      );
      return res.json();
    },
    onSuccess: () => invalidate(),
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
  if (!(user as any)?.isPlatformAdmin) {
    return <Redirect to="/" />;
  }
  if (!data) {
    return <div className="p-6">Group not found.</div>;
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

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Group Admins ({admins.length})</h2>
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
                  className="py-2 flex justify-between"
                >
                  <span>{display}</span>
                  <span className="text-sm text-muted-foreground">
                    @ {memberName}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {/*
          Promote/revoke UI is deferred to Task 13 (/business/group). For the
          Phase 1 demo, platform admin can promote via SQL or the existing
          POST /api/admin/groups/:id/admins endpoint directly.
        */}
        <p className="text-xs text-muted-foreground">
          To promote a user as group admin, call{" "}
          <code>POST /api/admin/groups/{group.id}/admins</code> with{" "}
          <code>{`{ userId, hospitalId }`}</code>. A UI will land with the
          Business → Manage Group surface (Task 13).
        </p>
      </section>

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
    </div>
  );
}
