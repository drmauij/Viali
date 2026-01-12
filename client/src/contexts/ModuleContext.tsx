import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type Module = "inventory" | "anesthesia" | "surgery" | "admin" | "business" | "clinic" | "logistic";

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
    if (saved === "anesthesia") return "anesthesia";
    if (saved === "surgery") return "surgery";
    if (saved === "admin") return "admin";
    if (saved === "business") return "business";
    if (saved === "clinic") return "clinic";
    if (saved === "logistic") return "logistic";
    return "inventory";
  });

  useEffect(() => {
    // Don't switch modules on unauthenticated pages or home page (which handles its own redirect)
    const excludedPages = ["/", "/reset-password", "/signup"];
    if (excludedPages.includes(location)) {
      return;
    }

    if (location?.startsWith("/anesthesia")) {
      setActiveModuleState("anesthesia");
      localStorage.setItem("activeModule", "anesthesia");
    } else if (location?.startsWith("/surgery")) {
      setActiveModuleState("surgery");
      localStorage.setItem("activeModule", "surgery");
    } else if (location?.startsWith("/admin")) {
      setActiveModuleState("admin");
      localStorage.setItem("activeModule", "admin");
    } else if (location?.startsWith("/business")) {
      setActiveModuleState("business");
      localStorage.setItem("activeModule", "business");
    } else if (location?.startsWith("/inventory")) {
      setActiveModuleState("inventory");
      localStorage.setItem("activeModule", "inventory");
    } else if (location?.startsWith("/clinic")) {
      setActiveModuleState("clinic");
      localStorage.setItem("activeModule", "clinic");
    } else if (location?.startsWith("/logistic")) {
      setActiveModuleState("logistic");
      localStorage.setItem("activeModule", "logistic");
    }
    // Note: old routes like /items, /orders will be redirected or removed
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
