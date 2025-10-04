import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

interface Hospital {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
}

interface TopBarProps {
  hospitals: Hospital[];
  activeHospital?: Hospital;
  onHospitalChange?: (hospital: Hospital) => void;
}

export default function TopBar({ hospitals = [], activeHospital, onHospitalChange }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const userFirstName = (user as any)?.firstName;
  const userLastName = (user as any)?.lastName;

  return (
    <div className="top-bar">
      <div className="flex items-center justify-between">
        {/* Hospital Switcher */}
        <div className="flex items-center gap-3">
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
                    {activeHospital?.name || "Select Hospital"}
                  </span>
                  <i className="fas fa-chevron-down text-xs text-muted-foreground"></i>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeHospital?.locationName || "No Location"} • {activeHospital?.role || "No Role"}
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
                    <div className="text-xs text-muted-foreground">{hospital.locationName} • {hospital.role}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <button
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleTheme}
            data-testid="theme-toggle"
          >
            <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`}></i>
          </button>
          
          {/* Logout Button */}
          <button
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => window.location.href = "/api/logout"}
            data-testid="button-logout"
            title="Logout"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
          
          {/* Profile */}
          <div
            className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm"
            data-testid="profile-avatar"
          >
            {getInitials(userFirstName, userLastName)}
          </div>
        </div>
      </div>
    </div>
  );
}
