import { useState } from "react";
import { TemplatesList } from "./TemplatesList";
import { FlowBuilderDemo } from "./FlowBuilderDemo";

export function AutomationsTab() {
  const [view, setView] = useState<"list" | "demo">("list");

  if (view === "demo") {
    return <FlowBuilderDemo onBack={() => setView("list")} />;
  }

  return <TemplatesList onOpenDemo={() => setView("demo")} />;
}
