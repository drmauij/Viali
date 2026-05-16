import { useTranslation } from "react-i18next";
import { FileText, Calendar, CalendarCheck, Download } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { UNIT_TAG_COLORS } from "@/lib/unitTagColors";
import { buildQuickLinks, type QuickLinkData } from "./buildRows";

interface QuickLinkHospital {
  id: string;
  questionnaireToken?: string | null;
  questionnaireAlias?: string | null;
  externalSurgeryToken?: string | null;
  bookingToken?: string | null;
}

interface Props {
  hospital: QuickLinkHospital;
  addons: { questionnaire: boolean };
  hasMedicalAccess: boolean;
}

const QUICK_LINK_ICON: Record<QuickLinkData["id"], JSX.Element> = {
  questionnaire: <FileText className="h-3.5 w-3.5" />,
  externalSurgery: <Calendar className="h-3.5 w-3.5" />,
  booking: <CalendarCheck className="h-3.5 w-3.5" />,
};

export function SidebarQuickLinks({ hospital, addons, hasMedicalAccess }: Props) {
  const { t } = useTranslation();

  const links = buildQuickLinks(hospital, addons, hasMedicalAccess, t);

  if (links.length === 0) return null;

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>{t("sidebar.quickLinksSection")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.map(link => (
              <SidebarMenuItem key={link.id}>
                <div className="flex w-full items-center gap-2 px-2 py-1.5 text-sm">
                  <span
                    className={`h-3 w-1 rounded-sm ${UNIT_TAG_COLORS.public.bg}`}
                    aria-hidden
                  />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center gap-2 truncate text-foreground hover:text-primary"
                  >
                    {QUICK_LINK_ICON[link.id]}
                    <span className="truncate">{link.label}</span>
                  </a>
                  {link.posterUrl && (
                    <a
                      href={link.posterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("sidebar.downloadPoster")}
                      title={t("sidebar.downloadPoster")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Download className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
