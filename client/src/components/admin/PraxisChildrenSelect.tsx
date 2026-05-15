import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Renders a multi-select of child users (individual surgeons) that can be linked
 * under the given praxis user. Reads current children via
 * `GET /api/admin/users/:userId/praxis-children` and persists selection via
 * `PUT /api/admin/users/:userId/praxis-children`.
 *
 * The candidate list is supplied by the caller (the page already has a query
 * for all hospital users); this component does not refetch that list.
 */
export interface PraxisChildCandidate {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  isPraxis?: boolean | null;
  parentSurgeonId?: string | null;
}

interface PraxisChildrenSelectProps {
  praxisUserId: string;
  hospitalId: string;
  allHospitalUsers: PraxisChildCandidate[];
}

export default function PraxisChildrenSelect({
  praxisUserId,
  hospitalId,
  allHospitalUsers,
}: PraxisChildrenSelectProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Hospital-scoped: only this clinic's slice of the praxis. Children at
  // other clinics aren't shown OR sent in the save payload, so a Kreuzlingen
  // admin can't accidentally drop a Weinberg child.
  const childrenQueryUrl = `/api/admin/users/${praxisUserId}/praxis-children?hospitalId=${encodeURIComponent(hospitalId)}`;
  const childrenQueryKey = [childrenQueryUrl];
  const { data: currentChildren = [] } = useQuery<
    Array<{ id: string; firstName: string; lastName: string; email: string }>
  >({
    queryKey: childrenQueryKey,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set(currentChildren.map((c) => c.id)));
  }, [currentChildren]);

  const eligible = useMemo(
    () =>
      allHospitalUsers.filter(
        (u) =>
          u.id !== praxisUserId &&
          !u.isPraxis &&
          (!u.parentSurgeonId || u.parentSurgeonId === praxisUserId),
      ),
    [allHospitalUsers, praxisUserId],
  );

  const save = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest(
        "PUT",
        `/api/admin/users/${praxisUserId}/praxis-children`,
        { hospitalId, childUserIds: ids },
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: childrenQueryKey });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description:
          error?.message || t("admin.praxisChildrenUpdateFailed", "Failed to update associated doctors"),
        variant: "destructive",
      });
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    save.mutate(Array.from(next));
  };

  return (
    <div
      className="space-y-1 border rounded-md p-2"
      data-testid="praxis-children-select"
    >
      {eligible.length === 0 && (
        <div className="text-sm text-muted-foreground">
          {t("admin.praxisChildrenEmpty", "No eligible doctors in this hospital.")}
        </div>
      )}
      {eligible.map((u) => {
        const checkboxId = `praxis-child-${u.id}`;
        const fullName = `${u.lastName ?? ""}, ${u.firstName ?? ""}`.replace(/^,\s*|,\s*$/g, "");
        return (
          <label
            key={u.id}
            htmlFor={checkboxId}
            className="flex items-center gap-2 text-sm cursor-pointer py-1"
          >
            <Checkbox
              id={checkboxId}
              checked={selectedIds.has(u.id)}
              onCheckedChange={() => toggle(u.id)}
              disabled={save.isPending}
              data-testid={`checkbox-praxis-child-${u.id}`}
            />
            <span>
              {fullName || u.email}
              {u.email && (
                <span className="text-muted-foreground"> ({u.email})</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
