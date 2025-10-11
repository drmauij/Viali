import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type Module = "inventory" | "anesthesia";

export interface ModuleContextType {
  activeModule: Module;
  setActiveModule: (module: Module) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [activeModule, setActiveModuleState] = useState<Module>(() => {
    const saved = localStorage.getItem("activeModule");
    return (saved === "anesthesia" ? "anesthesia" : "inventory") as Module;
  });

  useEffect(() => {
    // Don't switch modules on unauthenticated pages
    const unauthenticatedPages = ["/reset-password", "/signup"];
    if (unauthenticatedPages.includes(location)) {
      return;
    }

    if (location.startsWith("/anesthesia")) {
      setActiveModuleState("anesthesia");
      localStorage.setItem("activeModule", "anesthesia");
    } else {
      // All other routes default to inventory module
      // This includes: /, /items, /orders, /controlled, /checklists, /admin, /scan, /alerts, etc.
      setActiveModuleState("inventory");
      localStorage.setItem("activeModule", "inventory");
    }
  }, [location]);

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
