import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, FileText, Calendar, CalendarCheck, Download } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { UNIT_TAG_COLORS } from "@/lib/unitTagColors";
import { useToast } from "@/hooks/use-toast";

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

interface QuickLink {
  id: "questionnaire" | "externalSurgery" | "booking";
  label: string;
  url: string;
  icon: JSX.Element;
  posterUrl?: string;
}

export function SidebarQuickLinks({ hospital, addons, hasMedicalAccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const links: QuickLink[] = [];

  if (hospital.questionnaireToken && addons.questionnaire) {
    const url = hospital.questionnaireAlias
      ? `${origin}/q/${hospital.questionnaireAlias}`
      : `${origin}/questionnaire/hospital/${hospital.questionnaireToken}`;
    links.push({
      id: "questionnaire",
      label: t("quickLinks.clinicQuestionnaire"),
      url,
      icon: <FileText className="h-3.5 w-3.5" />,
    });
  }

  if (hospital.externalSurgeryToken && hasMedicalAccess) {
    links.push({
      id: "externalSurgery",
      label: t("quickLinks.externalSurgery", "OP-Terminreservierung"),
      url: `${origin}/external-surgery/${hospital.externalSurgeryToken}`,
      icon: <Calendar className="h-3.5 w-3.5" />,
    });
  }

  if (hospital.bookingToken) {
    links.push({
      id: "booking",
      label: t("quickLinks.bookingPage", "Online-Terminbuchung"),
      url: `${origin}/book/${hospital.bookingToken}`,
      icon: <CalendarCheck className="h-3.5 w-3.5" />,
      posterUrl: `${origin}/api/booking/poster/${hospital.bookingToken}`,
    });
  }

  if (links.length === 0) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: t("quickLinks.copied"),
        description: t("quickLinks.copiedDesc"),
      });
    } catch {
      toast({
        title: t("quickLinks.copyFailed"),
        description: url,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>
          {t("sidebar.quickLinksSection")}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {t("sidebar.shareSubtitle")}
          </span>
        </SidebarGroupLabel>
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
                    {link.icon}
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
                  <button
                    type="button"
                    aria-label={t("sidebar.copyLink")}
                    title={t("sidebar.copyLink")}
                    onClick={() => copy(link.url)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("sidebar.openInNewTab")}
                    title={t("sidebar.openInNewTab")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
