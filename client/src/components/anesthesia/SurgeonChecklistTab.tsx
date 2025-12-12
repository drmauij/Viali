import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, ChevronDown, ChevronUp, Loader2, ClipboardList, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolvePlaceholders, type SurgeryContext } from "@shared/checklistPlaceholders";
import type { SurgeonChecklistTemplate, SurgeonChecklistTemplateItem, SurgeryPreOpChecklistEntry } from "@shared/schema";
import { SurgeonChecklistTemplateEditor } from "./SurgeonChecklistTemplateEditor";

interface ChecklistEntry {
  itemId: string;
  checked: boolean;
  note: string;
}

interface SurgeonChecklistTabProps {
  surgeryId: string;
  hospitalId: string;
  surgeryContext: SurgeryContext;
  canWrite: boolean;
}

export function SurgeonChecklistTab({ surgeryId, hospitalId, surgeryContext, canWrite }: SurgeonChecklistTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<SurgeonChecklistTemplate[]>({
    queryKey: ['/api/surgeon-checklists/templates', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/templates?hospitalId=${hospitalId}`);
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: selectedTemplate, isLoading: templateLoading } = useQuery<SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }>({
    queryKey: ['/api/surgeon-checklists/templates', selectedTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/templates/${selectedTemplateId}`);
      return res.json();
    },
    enabled: !!selectedTemplateId,
  });

  const { data: savedChecklist, isLoading: checklistLoading } = useQuery<{ templateId: string | null; entries: SurgeryPreOpChecklistEntry[] }>({
    queryKey: ['/api/surgeries', surgeryId, 'checklist'],
    queryFn: async () => {
      const res = await fetch(`/api/surgeries/${surgeryId}/checklist`);
      return res.json();
    },
    enabled: !!surgeryId,
  });

  useEffect(() => {
    if (savedChecklist?.templateId && !selectedTemplateId) {
      setSelectedTemplateId(savedChecklist.templateId);
    }
  }, [savedChecklist, selectedTemplateId]);

  useEffect(() => {
    if (selectedTemplate && savedChecklist) {
      const newEntries = selectedTemplate.items.map(item => {
        const existing = savedChecklist.entries.find(e => e.itemId === item.id);
        return {
          itemId: item.id,
          checked: existing?.checked ?? false,
          note: existing?.note ?? "",
        };
      });
      setEntries(newEntries);
    } else if (selectedTemplate) {
      setEntries(selectedTemplate.items.map(item => ({
        itemId: item.id,
        checked: false,
        note: "",
      })));
    }
  }, [selectedTemplate, savedChecklist]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error("No template selected");
      const res = await apiRequest("PUT", `/api/surgeries/${surgeryId}/checklist`, {
        templateId: selectedTemplateId,
        entries: entries.map(e => ({
          itemId: e.itemId,
          checked: e.checked,
          note: e.note || null,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeries', surgeryId, 'checklist'] });
      toast({ title: t('surgeonChecklist.saved', 'Checklist saved') });
    },
    onError: () => {
      toast({ title: t('surgeonChecklist.saveFailed', 'Failed to save checklist'), variant: "destructive" });
    },
  });

  const updateEntry = (itemId: string, updates: Partial<ChecklistEntry>) => {
    setEntries(prev => prev.map(e => e.itemId === itemId ? { ...e, ...updates } : e));
  };

  const toggleNoteExpanded = (itemId: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleTemplateChange = (templateId: string) => {
    if (templateId === "new") {
      setEditingTemplateId(null);
      setShowTemplateEditor(true);
    } else if (templateId === "manage") {
      return;
    } else {
      setSelectedTemplateId(templateId);
    }
  };

  const handleEditTemplate = () => {
    if (selectedTemplateId) {
      setEditingTemplateId(selectedTemplateId);
      setShowTemplateEditor(true);
    }
  };

  const isLoading = templatesLoading || templateLoading || checklistLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select 
            value={selectedTemplateId || ""} 
            onValueChange={handleTemplateChange}
            disabled={!canWrite}
          >
            <SelectTrigger data-testid="select-checklist-template">
              <SelectValue placeholder={t('surgeonChecklist.selectTemplate', 'Select a checklist template...')} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.title} {tpl.isShared && <span className="text-xs text-muted-foreground">(shared)</span>}
                </SelectItem>
              ))}
              {templates.length > 0 && <div className="h-px bg-border my-1" />}
              <SelectItem value="new">
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  {t('surgeonChecklist.createNew', 'Create new template')}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedTemplateId && canWrite && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleEditTemplate}
            title={t('surgeonChecklist.editTemplate', 'Edit template')}
            data-testid="button-edit-template"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {selectedTemplate && selectedTemplate.items.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {selectedTemplate.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedTemplate.items.map((item, index) => {
              const entry = entries.find(e => e.itemId === item.id);
              const resolvedLabel = resolvePlaceholders(item.label, surgeryContext);
              const isExpanded = expandedNotes.has(item.id);
              
              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`checklist-item-${item.id}`}
                      checked={entry?.checked ?? false}
                      onCheckedChange={(checked) => {
                        updateEntry(item.id, { checked: checked === true });
                      }}
                      disabled={!canWrite}
                      data-testid={`checkbox-checklist-${index}`}
                    />
                    <Label 
                      htmlFor={`checklist-item-${item.id}`} 
                      className="flex-1 text-sm leading-relaxed cursor-pointer"
                    >
                      {resolvedLabel}
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleNoteExpanded(item.id)}
                      className="h-6 px-2"
                      data-testid={`button-toggle-note-${index}`}
                    >
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>
                  
                  {isExpanded && (
                    <div className="pl-7">
                      <Textarea
                        value={entry?.note ?? ""}
                        onChange={(e) => updateEntry(item.id, { note: e.target.value })}
                        placeholder={t('surgeonChecklist.addNote', 'Add a note...')}
                        rows={2}
                        className="text-sm resize-none"
                        disabled={!canWrite}
                        data-testid={`textarea-note-${index}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {canWrite && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full mt-4"
                data-testid="button-save-checklist"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t('surgeonChecklist.saveChecklist', 'Save Checklist')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : selectedTemplateId ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('surgeonChecklist.noItems', 'This template has no items.')}</p>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('surgeonChecklist.noTemplate', 'Select a template or create a new one to start your checklist.')}</p>
        </div>
      )}

      <SurgeonChecklistTemplateEditor
        open={showTemplateEditor}
        onClose={() => {
          setShowTemplateEditor(false);
          setEditingTemplateId(null);
        }}
        hospitalId={hospitalId}
        templateId={editingTemplateId}
      />
    </div>
  );
}
