import { useTheme } from "./ThemeProvider";
import { useLanguage } from "./LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ChangePasswordDialog from "./ChangePasswordDialog";
import { useModule } from "@/contexts/ModuleContext";
import { StickyNote } from "lucide-react";
import NotesPanel from "./NotesPanel";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
}

interface TopBarProps {
  hospitals: Hospital[];
  activeHospital?: Hospital;
  onHospitalChange?: (hospital: Hospital) => void;
}

export default function TopBar({ hospitals = [], activeHospital, onHospitalChange }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { setIsDrawerOpen } = useModule();
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const userFirstName = (user as any)?.firstName;
  const userLastName = (user as any)?.lastName;

  return (
    <div className="top-bar">
      <div className="flex items-center justify-between">
        {/* Module Menu and Hospital Switcher */}
        <div className="flex items-center gap-3">
          {/* Module Drawer Toggle */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
            data-testid="module-menu-button"
          >
            <i className="fas fa-bars text-lg text-foreground"></i>
          </button>
          
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <i className="fas fa-hospital text-lg text-primary-foreground"></i>
          </div>
          <div className="relative">
            <button
              className="flex items-center gap-2"
              onClick={() => setShowHospitalDropdown(!showHospitalDropdown)}
              data-testid="hospital-switcher"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {activeHospital?.name || t('topBar.selectHospital')}
                  </span>
                  <i className="fas fa-chevron-down text-xs text-muted-foreground"></i>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeHospital?.unitName || t('topBar.noLocation')} • {activeHospital?.role || t('topBar.noRole')}
                </span>
              </div>
            </button>
            
            {showHospitalDropdown && hospitals.length > 1 && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50">
                {hospitals.map((hospital) => (
                  <button
                    key={hospital.id}
                    className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
                    onClick={() => {
                      onHospitalChange?.(hospital);
                      setShowHospitalDropdown(false);
                    }}
                    data-testid={`hospital-option-${hospital.id}`}
                  >
                    <div className="font-medium">{hospital.name}</div>
                    <div className="text-xs text-muted-foreground">{hospital.unitName} • {hospital.role}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Notes Panel Toggle */}
          <button
            onClick={() => setShowNotesPanel(!showNotesPanel)}
            className="w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
            data-testid="button-notes"
          >
            <StickyNote className="w-5 h-5 text-foreground" />
          </button>

          <div className="relative">
            {/* User Menu Button */}
            <button
              className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm hover:opacity-90 transition-opacity"
              onClick={() => setShowUserMenu(!showUserMenu)}
              data-testid="profile-avatar"
            >
              {getInitials(userFirstName, userLastName)}
            </button>
          
          {/* User Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-50">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-border">
                <div className="font-medium text-foreground">
                  {userFirstName && userLastName ? `${userFirstName} ${userLastName}` : "User"}
                </div>
                <div className="text-xs text-muted-foreground">{(user as any)?.email || ""}</div>
              </div>
              
              {/* Theme Toggle */}
              <button
                className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border flex items-center gap-3"
                onClick={() => {
                  toggleTheme();
                  setShowUserMenu(false);
                }}
                data-testid="theme-toggle"
              >
                <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"} w-4`}></i>
                <span>{theme === "dark" ? t('topBar.lightMode') : t('topBar.darkMode')}</span>
              </button>
              
              {/* Language Selector */}
              <button
                className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border flex items-center gap-3"
                onClick={() => {
                  setLanguage(language === 'en' ? 'de' : 'en');
                  setShowUserMenu(false);
                }}
                data-testid="language-toggle"
              >
                <i className="fas fa-language w-4"></i>
                <span>{language === 'en' ? t('topBar.german') : t('topBar.english')}</span>
              </button>
              
              {/* Change Password - Hidden for demo user */}
              {(user as any)?.email !== 'demo@viali.app' && (
                <button
                  className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border flex items-center gap-3"
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowUserMenu(false);
                  }}
                  data-testid="button-change-password"
                >
                  <i className="fas fa-key w-4"></i>
                  <span>{t('auth.changePassword')}</span>
                </button>
              )}
              
              {/* Logout */}
              <button
                className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-3 text-destructive"
                onClick={() => window.location.href = "/api/logout"}
                data-testid="button-logout"
              >
                <i className="fas fa-sign-out-alt w-4"></i>
                <span>{t('auth.logout')}</span>
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
      
      <ChangePasswordDialog 
        open={showChangePassword} 
        onOpenChange={setShowChangePassword}
      />

      <NotesPanel 
        isOpen={showNotesPanel}
        onClose={() => setShowNotesPanel(false)}
        activeHospital={activeHospital}
      />
    </div>
  );
}
