import {
  type LucideIcon,
  Settings,
  Users,
  Stethoscope,
  Package,
  Calendar,
  FileText,
  Shield,
  FlaskConical,
  DoorOpen,
  ClipboardCheck,
  Plug,
  CreditCard,
  UserPlus,
  PlusCircle,
  Truck,
  MessageSquare,
  Camera,
  Globe,
  Link,
  Layers,
  NotepadText,
} from "lucide-react";

export interface CommandPaletteItem {
  id: string;
  labelKey: string;
  sectionKey: string;
  icon: LucideIcon;
  keywords: string[];
  action:
    | { type: "navigate"; path: string; tab?: string }
    | { type: "callback"; key: string; targetPath?: string };
  requiredRole?: "admin" | "doctor" | "nurse" | "manager" | "staff";
  requiredAddon?: string;
}

export const COMMAND_PALETTE_ITEMS: CommandPaletteItem[] = [
  // ── Pages ──────────────────────────────────────────────
  {
    id: "page-patients",
    labelKey: "commandPalette.items.patients",
    sectionKey: "commandPalette.sections.pages",
    icon: Users,
    keywords: ["patients", "patienten", "list"],
    action: { type: "navigate", path: "/patients" },
  },
  {
    id: "page-appointments",
    labelKey: "commandPalette.items.appointments",
    sectionKey: "commandPalette.sections.pages",
    icon: Calendar,
    keywords: ["appointments", "termine", "calendar", "kalender"],
    action: { type: "navigate", path: "/clinic" },
  },
  {
    id: "page-surgeries",
    labelKey: "commandPalette.items.surgeries",
    sectionKey: "commandPalette.sections.pages",
    icon: Stethoscope,
    keywords: ["surgeries", "surgery", "operationen", "op"],
    action: { type: "navigate", path: "/surgery" },
  },
  {
    id: "page-inventory",
    labelKey: "commandPalette.items.inventory",
    sectionKey: "commandPalette.sections.pages",
    icon: Package,
    keywords: ["inventory", "lager", "items", "artikel"],
    action: { type: "navigate", path: "/inventory" },
  },

  // ── Admin — Settings ───────────────────────────────────
  {
    id: "admin-settings",
    labelKey: "commandPalette.items.settings",
    sectionKey: "commandPalette.sections.adminSettings",
    icon: Settings,
    keywords: ["settings", "einstellungen", "company"],
    action: { type: "navigate", path: "/admin", tab: "settings" },
    requiredRole: "admin",
  },
  {
    id: "admin-closures",
    labelKey: "commandPalette.items.closures",
    sectionKey: "commandPalette.sections.adminSettings",
    icon: Calendar,
    keywords: ["closures", "schliessungen", "holidays", "feiertage"],
    action: { type: "navigate", path: "/admin", tab: "settings" },
    requiredRole: "admin",
  },
  {
    id: "admin-regional",
    labelKey: "commandPalette.items.regionalPreferences",
    sectionKey: "commandPalette.sections.adminSettings",
    icon: Globe,
    keywords: ["regional", "preferences", "currency", "timezone"],
    action: { type: "navigate", path: "/admin", tab: "settings" },
    requiredRole: "admin",
  },
  {
    id: "admin-links",
    labelKey: "commandPalette.items.links",
    sectionKey: "commandPalette.sections.adminSettings",
    icon: Link,
    keywords: ["links", "booking", "questionnaire"],
    action: { type: "navigate", path: "/admin", tab: "links" },
    requiredRole: "admin",
  },
  {
    id: "admin-security",
    labelKey: "commandPalette.items.security",
    sectionKey: "commandPalette.sections.adminSettings",
    icon: Shield,
    keywords: ["security", "sicherheit", "audit", "login"],
    action: { type: "navigate", path: "/admin", tab: "security" },
    requiredRole: "admin",
  },

  // ── Admin — Clinical ───────────────────────────────────
  {
    id: "admin-units",
    labelKey: "commandPalette.items.units",
    sectionKey: "commandPalette.sections.adminClinical",
    icon: Layers,
    keywords: ["units", "einheiten", "departments"],
    action: { type: "navigate", path: "/admin/clinical", tab: "units" },
    requiredRole: "admin",
  },
  {
    id: "admin-rooms",
    labelKey: "commandPalette.items.rooms",
    sectionKey: "commandPalette.sections.adminClinical",
    icon: DoorOpen,
    keywords: ["rooms", "räume", "surgery rooms"],
    action: { type: "navigate", path: "/admin/clinical", tab: "rooms" },
    requiredRole: "admin",
  },
  {
    id: "admin-checklists",
    labelKey: "commandPalette.items.checklists",
    sectionKey: "commandPalette.sections.adminClinical",
    icon: ClipboardCheck,
    keywords: ["checklists", "checklisten", "templates"],
    action: { type: "navigate", path: "/admin/clinical", tab: "checklists" },
    requiredRole: "admin",
  },
  {
    id: "admin-templates",
    labelKey: "commandPalette.items.templates",
    sectionKey: "commandPalette.sections.adminClinical",
    icon: NotepadText,
    keywords: ["templates", "vorlagen", "discharge"],
    action: { type: "navigate", path: "/admin/clinical", tab: "templates" },
    requiredRole: "admin",
  },

  // ── Admin — Integrations ───────────────────────────────
  {
    id: "admin-galexis",
    labelKey: "commandPalette.items.galexis",
    sectionKey: "commandPalette.sections.adminIntegrations",
    icon: Truck,
    keywords: ["galexis", "supplier", "lieferant", "catalog"],
    action: { type: "navigate", path: "/admin/integrations", tab: "galexis" },
    requiredRole: "admin",
  },
  {
    id: "admin-sms",
    labelKey: "commandPalette.items.sms",
    sectionKey: "commandPalette.sections.adminIntegrations",
    icon: MessageSquare,
    keywords: ["sms", "aspsms", "messages"],
    action: { type: "navigate", path: "/admin/integrations", tab: "sms" },
    requiredRole: "admin",
  },
  {
    id: "admin-cameras",
    labelKey: "commandPalette.items.cameras",
    sectionKey: "commandPalette.sections.adminIntegrations",
    icon: Camera,
    keywords: ["cameras", "kameras", "devices"],
    action: { type: "navigate", path: "/admin/integrations", tab: "cameras" },
    requiredRole: "admin",
  },
  {
    id: "admin-cardreader",
    labelKey: "commandPalette.items.cardReader",
    sectionKey: "commandPalette.sections.adminIntegrations",
    icon: CreditCard,
    keywords: ["card reader", "kartenleser"],
    action: { type: "navigate", path: "/admin/integrations", tab: "cardreader" },
    requiredRole: "admin",
  },
  {
    id: "admin-tardoc",
    labelKey: "commandPalette.items.tardoc",
    sectionKey: "commandPalette.sections.adminIntegrations",
    icon: FileText,
    keywords: ["tardoc", "tarif", "billing", "gln", "zsr"],
    action: { type: "navigate", path: "/admin/integrations", tab: "tardoc" },
    requiredRole: "admin",
  },

  // ── Admin — Users & Billing ────────────────────────────
  {
    id: "admin-users",
    labelKey: "commandPalette.items.users",
    sectionKey: "commandPalette.sections.admin",
    icon: Users,
    keywords: ["users", "benutzer"],
    action: { type: "navigate", path: "/admin/users" },
    requiredRole: "admin",
  },
  {
    id: "admin-billing",
    labelKey: "commandPalette.items.billing",
    sectionKey: "commandPalette.sections.admin",
    icon: CreditCard,
    keywords: ["billing", "abrechnung", "license", "lizenz", "invoices"],
    action: { type: "navigate", path: "/admin/billing" },
    requiredRole: "admin",
  },

  // ── Actions ────────────────────────────────────────────
  {
    id: "action-create-patient",
    labelKey: "commandPalette.items.createPatient",
    sectionKey: "commandPalette.sections.actions",
    icon: PlusCircle,
    keywords: ["create", "new", "patient", "erstellen", "neu"],
    action: { type: "callback", key: "createPatient", targetPath: "/patients" },
  },
  {
    id: "action-schedule-surgery",
    labelKey: "commandPalette.items.scheduleSurgery",
    sectionKey: "commandPalette.sections.actions",
    icon: Stethoscope,
    keywords: ["schedule", "surgery", "planen", "operation"],
    action: { type: "callback", key: "scheduleSurgery", targetPath: "/surgery" },
  },
  {
    id: "action-add-inventory",
    labelKey: "commandPalette.items.addInventoryItem",
    sectionKey: "commandPalette.sections.actions",
    icon: Package,
    keywords: ["add", "inventory", "item", "hinzufügen", "artikel"],
    action: { type: "callback", key: "addInventoryItem", targetPath: "/inventory" },
  },
  {
    id: "action-add-user",
    labelKey: "commandPalette.items.addUser",
    sectionKey: "commandPalette.sections.actions",
    icon: UserPlus,
    keywords: ["add", "user", "benutzer", "hinzufügen"],
    action: { type: "callback", key: "addUser", targetPath: "/admin/users" },
    requiredRole: "admin",
  },
];
