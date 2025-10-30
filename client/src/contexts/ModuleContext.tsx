import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type Module = "inventory" | "anesthesia" | "admin";

export interface ModuleContextType {
  activeModule: Module;
  setActiveModule: (module: Module) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [units?] = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [activeModule, setActiveModuleState] = useState<Module>(() => {
    const saved = localStorage.getItem("activeModule");
    if (saved === "anesthesia") return "anesthesia";
    if (saved === "admin") return "admin";
    return "inventory";
  });

  useEffect(() => {
    // Don't switch modules on unauthenticated pages or home page (which handles its own redirect)
    const excludedPages = ["/", "/reset-password", "/signup"];
    if (excludedPages.includes(units?)) {
      return;
    }

    if (units?.startsWith("/anesthesia")) {
      setActiveModuleState("anesthesia");
      localStorage.setItem("activeModule", "anesthesia");
    } else if (units?.startsWith("/admin")) {
      setActiveModuleState("admin");
      localStorage.setItem("activeModule", "admin");
    } else if (units?.startsWith("/inventory")) {
      setActiveModuleState("inventory");
      localStorage.setItem("activeModule", "inventory");
    }
    // Note: old routes like /items, /orders will be redirected or removed
  }, [units?]);

  const setActiveModule = (module: Module) => {
    setActiveModuleState(module);
    localStorage.setItem("activeModule", module);
  };

  return (
    <ModuleContext.Provider value={{ activeModule, setActiveModule, isDrawerOpen, setIsDrawerOpen }}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModule() {
  const context = useContext(ModuleContext);
  if (context === undefined) {
    throw new Error("useModule must be used within a ModuleProvider");
  }
  return context;
}
