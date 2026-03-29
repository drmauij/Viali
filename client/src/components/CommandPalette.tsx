import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { User, Stethoscope, Package, Users } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useDebounce } from "@/hooks/useDebounce";
import {
  COMMAND_PALETTE_ITEMS,
  type CommandPaletteItem,
} from "@/lib/command-palette-items";
import { formatDate } from "@/lib/dateUtils";

// ── Context ─────────────────────────────────────────────

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  registerAction: (key: string, handler: () => void) => void;
  unregisterAction: (key: string) => void;
  pendingAction: string | null;
  clearPendingAction: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return ctx;
}

// ── Provider ────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionsRef = useRef(new Map<string, () => void>());

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const registerAction = useCallback((key: string, handler: () => void) => {
    actionsRef.current.set(key, handler);
  }, []);

  const unregisterAction = useCallback((key: string) => {
    actionsRef.current.delete(key);
  }, []);

  const clearPendingAction = useCallback(() => setPendingAction(null), []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      close,
      isOpen,
      registerAction,
      unregisterAction,
      pendingAction,
      clearPendingAction,
    }),
    [
      open,
      close,
      isOpen,
      registerAction,
      unregisterAction,
      pendingAction,
      clearPendingAction,
    ],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        actionsRef={actionsRef}
        setPendingAction={setPendingAction}
      />
    </CommandPaletteContext.Provider>
  );
}

// ── Palette UI ──────────────────────────────────────────

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  actionsRef: React.MutableRefObject<Map<string, () => void>>;
  setPendingAction: (action: string | null) => void;
}

function CommandPalette({
  isOpen,
  setIsOpen,
  actionsRef,
  setPendingAction,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, setIsOpen]);

  // Reset query when palette closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  // Filter static items by role
  const filteredItems = useMemo(() => {
    const role = activeHospital?.role;
    return COMMAND_PALETTE_ITEMS.filter((item) => {
      if (!item.requiredRole) return true;
      if (role === "admin") return true;
      return role === item.requiredRole;
    });
  }, [activeHospital?.role]);

  // Group filtered items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.sectionKey]) {
        groups[item.sectionKey] = [];
      }
      groups[item.sectionKey].push(item);
    }
    return groups;
  }, [filteredItems]);

  // Live entity search
  const { data: searchResults, isLoading: searchLoading } = useQuery<{
    patients?: Array<{
      id: string;
      name: string;
      patientNumber?: string;
      dob?: string;
    }>;
    surgeries?: Array<{
      id: string;
      procedure?: string;
      patientName?: string;
      date?: string;
    }>;
    inventoryItems?: Array<{ id: string; name: string }>;
    users?: Array<{ id: string; name: string; role?: string; email?: string }>;
  }>({
    queryKey: ["/api/search", activeHospital?.id, debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search/${activeHospital!.id}?q=${encodeURIComponent(debouncedQuery)}&limit=5`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && !!activeHospital?.id,
  });

  function handleSelect(item: CommandPaletteItem) {
    setIsOpen(false);
    setQuery("");

    if (item.action.type === "navigate") {
      const url = item.action.tab
        ? `${item.action.path}?tab=${item.action.tab}`
        : item.action.path;
      navigate(url);
    } else if (item.action.type === "callback") {
      const handler = actionsRef.current.get(item.action.key);
      if (handler) {
        handler();
      } else if (item.action.targetPath) {
        setPendingAction(item.action.key);
        navigate(item.action.targetPath);
      }
    }
  }

  function handleEntitySelect(type: string, id: string) {
    setIsOpen(false);
    setQuery("");
    switch (type) {
      case "patient":
        navigate(`/patients/${id}`);
        break;
      case "surgery":
        navigate(`/surgery/preop/${id}`);
        break;
      case "inventoryItem":
        navigate(`/inventory/items/${id}`);
        break;
      case "user":
        navigate(`/admin/users`);
        break;
    }
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput
        placeholder={t("commandPalette.placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.length < 2
            ? t("commandPalette.typeToSearch")
            : t("commandPalette.noResults")}
        </CommandEmpty>

        {/* Static items grouped by section */}
        {Object.entries(groupedItems).map(([sectionKey, items]) => (
          <CommandGroup key={sectionKey} heading={t(sectionKey)}>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${t(item.labelKey)} ${item.keywords.join(" ")}`}
                onSelect={() => handleSelect(item)}
              >
                <item.icon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <span>{t(item.labelKey)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* Entity search results */}
        {debouncedQuery.length >= 2 && searchResults && (
          <>
            {searchResults.patients && searchResults.patients.length > 0 && (
              <CommandGroup
                heading={t("commandPalette.sections.patients")}
              >
                {searchResults.patients.map((p) => (
                  <CommandItem
                    key={`patient-${p.id}`}
                    value={`patient-${p.name}`}
                    onSelect={() => handleEntitySelect("patient", p.id)}
                  >
                    <User className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.patientNumber ? `#${p.patientNumber}` : ""}
                        {p.patientNumber && p.dob ? " \u00b7 " : ""}
                        {p.dob ? formatDate(p.dob) : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchResults.surgeries && searchResults.surgeries.length > 0 && (
              <CommandGroup
                heading={t("commandPalette.sections.surgeries")}
              >
                {searchResults.surgeries.map((s) => (
                  <CommandItem
                    key={`surgery-${s.id}`}
                    value={`surgery-${s.procedure || "Surgery"} ${s.patientName || ""}`}
                    onSelect={() => handleEntitySelect("surgery", s.id)}
                  >
                    <Stethoscope className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <div className="flex flex-col">
                      <span>{s.procedure || "Surgery"}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.patientName || ""}
                        {s.patientName && s.date ? " \u00b7 " : ""}
                        {s.date ? formatDate(s.date) : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchResults.inventoryItems &&
              searchResults.inventoryItems.length > 0 && (
                <CommandGroup
                  heading={t("commandPalette.sections.inventory")}
                >
                  {searchResults.inventoryItems.map((item) => (
                    <CommandItem
                      key={`inventory-${item.id}`}
                      value={`inventory-${item.name}`}
                      onSelect={() =>
                        handleEntitySelect("inventoryItem", item.id)
                      }
                    >
                      <Package className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <span>{item.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

            {searchResults.users && searchResults.users.length > 0 && (
              <CommandGroup
                heading={t("commandPalette.sections.users")}
              >
                {searchResults.users.map((u) => (
                  <CommandItem
                    key={`user-${u.id}`}
                    value={`user-${u.name}`}
                    onSelect={() => handleEntitySelect("user", u.id)}
                  >
                    <Users className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <div className="flex flex-col">
                      <span>{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.role || ""}
                        {u.role && u.email ? " \u00b7 " : ""}
                        {u.email || ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Loading indicator */}
        {searchLoading && debouncedQuery.length >= 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <i className="fas fa-spinner fa-spin mr-2"></i>
            {t("commandPalette.searching")}
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
