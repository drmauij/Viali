import { useTheme } from "./ThemeProvider";
import { useLanguage } from "./LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ChangePasswordDialog from "./ChangePasswordDialog";
import { useModule } from "@/contexts/ModuleContext";
import { MessageCircle } from "lucide-react";
import ChatDock from "./chat/ChatDock";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  isAnesthesiaModule?: boolean;
  isSurgeryModule?: boolean;
  isBusinessModule?: boolean;
  isClinicModule?: boolean;
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
  const [, setLocation] = useLocation();
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  // Handle deep link URL params for opening chat
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const openChat = urlParams.get('openChat');
    const conversationId = urlParams.get('conversationId');
    
    if (openChat === '1') {
      setShowChatPanel(true);
      if (conversationId) {
        setInitialConversationId(conversationId);
      }
      // Clean up only chat-specific params while preserving others
      urlParams.delete('openChat');
      urlParams.delete('conversationId');
      const remainingParams = urlParams.toString();
      const newUrl = window.location.pathname + (remainingParams ? `?${remainingParams}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const handleOpenPatientInline = useCallback((patientId: string) => {
    // Navigate to the patient detail page for the current module
    if (activeHospital?.isClinicModule) {
      setLocation(`/clinic/patients/${patientId}`);
    } else if (activeHospital?.isSurgeryModule) {
      setLocation(`/surgery/patients/${patientId}`);
    } else if (activeHospital?.isBusinessModule) {
      // Business module can view patients via clinic route
      setLocation(`/clinic/patients/${patientId}`);
    } else {
      // Default to anesthesia
      setLocation(`/anesthesia/patients/${patientId}`);
    }
  }, [setLocation, activeHospital]);
  
  const hospitalDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Group hospitals by hospital ID for multi-hospital users
  const groupedHospitals = useMemo(() => {
    const grouped = new Map<string, { hospitalName: string; hospitalId: string; roles: Hospital[] }>();
    
    hospitals.forEach(hospital => {
      const key = hospital.id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          hospitalName: hospital.name,
          hospitalId: hospital.id,
          roles: []
        });
      }
      grouped.get(key)!.roles.push(hospital);
    });
    
    return Array.from(grouped.values());
  }, [hospitals]);

  // Check if user has multiple hospitals (not just multiple roles in same hospital)
  const hasMultipleHospitals = groupedHospitals.length > 1;

  const { data: notifications = [] } = useQuery<Array<{ id: string }>>({
    queryKey: ['/api/chat', activeHospital?.id, 'notifications'],
    queryFn: async () => {
      if (!activeHospital?.id) return [];
      const response = await fetch(`/api/chat/${activeHospital.id}/notifications`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.length;

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Close hospital dropdown if clicking outside
      if (showHospitalDropdown && hospitalDropdownRef.current && 
          !hospitalDropdownRef.current.contains(event.target as Node)) {
        setShowHospitalDropdown(false);
      }
      // Close user menu if clicking outside
      if (showUserMenu && userMenuRef.current && 
          !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHospitalDropdown, showUserMenu]);

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
          <div className="relative" ref={hospitalDropdownRef}>
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
              <div className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[60vh] overflow-y-auto">
                {hasMultipleHospitals ? (
                  // Grouped view for multi-hospital users
                  groupedHospitals.map((group, groupIndex) => (
                    <div key={group.hospitalId}>
                      {/* Hospital header */}
                      <div className="px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
                        <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                          <i className="fas fa-hospital text-xs text-primary"></i>
                          {group.hospitalName}
                        </div>
                      </div>
                      {/* Roles within this hospital */}
                      {group.roles.map((hospital, roleIndex) => {
                        const isActive = activeHospital?.id === hospital.id && 
                                        activeHospital?.unitId === hospital.unitId && 
                                        activeHospital?.role === hospital.role;
                        return (
                          <button
                            key={`${hospital.id}-${hospital.unitId}-${hospital.role}`}
                            className={`w-full px-4 py-2.5 pl-8 text-left hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0 ${isActive ? 'bg-accent/50' : ''}`}
                            onClick={() => {
                              onHospitalChange?.(hospital);
                              setShowHospitalDropdown(false);
                            }}
                            data-testid={`hospital-option-${hospital.id}-${hospital.unitId}`}
                          >
                            <div className="text-sm font-medium">{hospital.unitName}</div>
                            <div className="text-xs text-muted-foreground">{hospital.role}</div>
                          </button>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  // Simple view for single hospital with multiple roles
                  hospitals.map((hospital) => {
                    const isActive = activeHospital?.id === hospital.id && 
                                    activeHospital?.unitId === hospital.unitId && 
                                    activeHospital?.role === hospital.role;
                    return (
                      <button
                        key={`${hospital.id}-${hospital.unitId}-${hospital.role}`}
                        className={`w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0 ${isActive ? 'bg-accent/50' : ''}`}
                        onClick={() => {
                          onHospitalChange?.(hospital);
                          setShowHospitalDropdown(false);
                        }}
                        data-testid={`hospital-option-${hospital.id}-${hospital.unitId}`}
                      >
                        <div className="font-medium">{hospital.unitName}</div>
                        <div className="text-xs text-muted-foreground">{hospital.role}</div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Chat Panel Toggle */}
          <button
            onClick={() => setShowChatPanel(!showChatPanel)}
            className="w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center transition-colors relative"
            data-testid="button-chat"
          >
            <MessageCircle className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span 
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center px-1"
                data-testid="badge-unread-count"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
                      </button>

          <div className="relative" ref={userMenuRef}>
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

      <ChatDock 
        isOpen={showChatPanel}
        onClose={() => setShowChatPanel(false)}
        activeHospital={activeHospital}
        onOpenPatientInline={handleOpenPatientInline}
        initialConversationId={initialConversationId}
        onInitialConversationHandled={() => setInitialConversationId(null)}
      />
    </div>
  );
}
