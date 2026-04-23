import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";

/**
 * Platform-admin surface for managing hospital groups (chains / brands).
 * Gated client-side by user.isPlatformAdmin; server-side by requirePlatformAdmin.
 * See spec: 2026-04-22-multi-location-groups-design.md — "Group management UI".
 */

type GroupRow = {
  id: string;
  name: string;
  bookingToken: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  memberCount: number;
  patientCount: number;
};

type HospitalRow = {
  id: string;
  name: string;
  groupId: string | null;
};

export default function GroupsList() {
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups = [] } = useQuery<GroupRow[]>({
    queryKey: ["/api/admin/groups"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/groups").then((r) => r.json()),
    enabled: !!user?.isPlatformAdmin,
  });
  const { data: hospitalsList = [] } = useQuery<HospitalRow[]>({
    queryKey: ["/api/admin/hospitals"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/hospitals").then((r) => r.json()),
    enabled: !!user?.isPlatformAdmin,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const createGroup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/groups", {
        name,
        hospitalIds: selected,
      });
      return res.json() as Promise<{
        id: string;
        name: string;
        skippedHospitalIds: string[];
      }>;
    },
    onSuccess: (body) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/groups"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/hospitals"] });
      setOpen(false);
      setName("");
      setSelected([]);
      // Let the admin know if the server silently dropped any hospital IDs
      // because they're already in another group.
      const skipped = body.skippedHospitalIds ?? [];
      if (skipped.length > 0) {
        toast({
          title: "Group created",
          description: `${skipped.length} hospital${skipped.length === 1 ? "" : "s"} ${skipped.length === 1 ? "was" : "were"} skipped because ${skipped.length === 1 ? "it already belongs" : "they already belong"} to another group.`,
        });
      }
    },
  });

  if (isLoading) {
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
    // Defence in depth: server-side already returns 403 — just redirect away.
    return <Redirect to="/" />;
  }

  const ungroupedHospitals = hospitalsList.filter((h) => !h.groupId);

  return (
    <div className="p-6 space-y-4" data-testid="admin-groups-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hospital Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chain-level groupings for multi-location brands. Platform admin
            only.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-group">Create Group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                placeholder="Group name (e.g. beauty2go)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-group-name"
              />
              {ungroupedHospitals.length > 0 ? (
                <div>
                  <div className="text-sm font-medium mb-1">
                    Add hospitals (optional)
                  </div>
                  <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
                    {ungroupedHospitals.map((h) => (
                      <label
                        key={h.id}
                        className="flex items-center gap-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(h.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, h.id]
                                : s.filter((x) => x !== h.id),
                            )
                          }
                        />
                        <span>{h.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No un-grouped hospitals available.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={!name.trim() || createGroup.isPending}
                onClick={() => createGroup.mutate()}
                data-testid="button-submit-create-group"
              >
                {createGroup.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Members</th>
              <th className="text-left px-3 py-2 font-medium">Patients</th>
              <th className="text-left px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No groups yet. Create one to get started.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/groups/${g.id}`}
                      className="text-primary hover:underline"
                      data-testid={`link-group-${g.id}`}
                    >
                      {g.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{g.memberCount}</td>
                  <td className="px-3 py-2">{g.patientCount}</td>
                  <td className="px-3 py-2">
                    {g.createdAt ? formatDate(g.createdAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
