import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, X, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  hospitalId: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ServiceGroupsMultiSelect({ hospitalId, value, onChange, placeholder, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: groupData } = useQuery<{ groups: string[] }>({
    queryKey: ["/api/clinic", hospitalId, "service-groups"],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/service-groups`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: !!hospitalId,
  });
  const existingGroups = groupData?.groups ?? [];

  const lowered = search.trim().toLowerCase();
  const candidateGroups = existingGroups.filter(
    g => !value.includes(g) && (!lowered || g.toLowerCase().includes(lowered))
  );
  const canCreate =
    lowered.length > 0 &&
    !existingGroups.some(g => g.toLowerCase() === lowered) &&
    !value.some(g => g.toLowerCase() === lowered);

  const add = (g: string) => {
    onChange([...value, g]);
    setSearch("");
  };
  const remove = (g: string) => onChange(value.filter(x => x !== g));

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1.5 min-h-[2.5rem]">
      {value.map(g => (
        <Badge key={g} variant="secondary" className="gap-1">
          {g}
          {!disabled && (
            <button type="button" onClick={() => remove(g)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" /> {placeholder ?? t("common.addGroup", "Add group")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-64" align="start">
            <Command>
              <CommandInput
                placeholder={t("common.searchOrCreate", "Search or create...")}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandGroup>
                  {candidateGroups.map(g => (
                    <CommandItem
                      key={g}
                      value={g}
                      onSelect={() => {
                        add(g);
                        setOpen(false);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      {g}
                    </CommandItem>
                  ))}
                  {canCreate && (
                    <CommandItem
                      value={`__create__${lowered}`}
                      onSelect={() => {
                        add(search.trim());
                        setOpen(false);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t("common.create", "Create")} "{search.trim()}"
                    </CommandItem>
                  )}
                </CommandGroup>
                {candidateGroups.length === 0 && !canCreate && (
                  <CommandEmpty>{t("common.noResults", "No results")}</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
