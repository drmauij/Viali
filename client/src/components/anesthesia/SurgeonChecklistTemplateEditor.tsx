import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Save, Loader2, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { placeholderInfo, type PlaceholderInfo } from "@shared/checklistPlaceholders";
import type { SurgeonChecklistTemplate, SurgeonChecklistTemplateItem } from "@shared/schema";

interface TemplateItem {
  id?: string;
  label: string;
  sortOrder: number;
}

interface SurgeonChecklistTemplateEditorProps {
  open: boolean;
  onClose: () => void;
  hospitalId: string;
  templateId?: string | null;
}

export function SurgeonChecklistTemplateEditor({
  open,
  onClose,
  hospitalId,
  templateId,
}: SurgeonChecklistTemplateEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [showPlaceholderPopover, setShowPlaceholderPopover] = useState(false);
  const [placeholderQuery, setPlaceholderQuery] = useState("");
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const { data: template, isLoading } = useQuery<SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }>({
    queryKey: ['/api/surgeon-checklists/templates', templateId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/templates/${templateId}`);
      return res.json();
    },
    enabled: !!templateId && open,
  });

  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setIsShared(template.isShared);
      setItems(template.items.map(i => ({ id: i.id, label: i.label, sortOrder: i.sortOrder })));
    } else if (!templateId && open) {
      setTitle("");
      setIsShared(false);
      setItems([{ label: "", sortOrder: 0 }]);
    }
  }, [template, templateId, open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/surgeon-checklists/templates", {
        hospitalId,
        title,
        isShared,
        items: items.filter(i => i.label.trim()).map((i, idx) => ({ ...i, sortOrder: idx })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/templates'] });
      toast({ title: t('surgeonChecklist.templateCreated', 'Template created') });
      onClose();
    },
    onError: () => {
      toast({ title: t('surgeonChecklist.createFailed', 'Failed to create template'), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/surgeon-checklists/templates/${templateId}`, {
        title,
        isShared,
        items: items.filter(i => i.label.trim()).map((i, idx) => ({ ...i, sortOrder: idx })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/templates'] });
      toast({ title: t('surgeonChecklist.templateUpdated', 'Template updated') });
      onClose();
    },
    onError: () => {
      toast({ title: t('surgeonChecklist.updateFailed', 'Failed to update template'), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/surgeon-checklists/templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/templates'] });
      toast({ title: t('surgeonChecklist.templateDeleted', 'Template deleted') });
      onClose();
    },
    onError: () => {
      toast({ title: t('surgeonChecklist.deleteFailed', 'Failed to delete template'), variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: t('surgeonChecklist.titleRequired', 'Title is required'), variant: "destructive" });
      return;
    }
    if (items.filter(i => i.label.trim()).length === 0) {
      toast({ title: t('surgeonChecklist.itemsRequired', 'At least one checklist item is required'), variant: "destructive" });
      return;
    }
    if (templateId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const addItem = () => {
    setItems([...items, { label: "", sortOrder: items.length }]);
    setTimeout(() => {
      inputRefs.current[items.length]?.focus();
    }, 50);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemLabel = (index: number, label: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], label };
    setItems(newItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const value = items[index].label;
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    
    if (e.key === '#') {
      setActiveItemIndex(index);
      setShowPlaceholderPopover(true);
      setPlaceholderQuery("");
    }
    
    if (e.key === 'Escape' && showPlaceholderPopover) {
      setShowPlaceholderPopover(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    updateItemLabel(index, value);
    
    const lastHashIndex = value.lastIndexOf('#');
    if (lastHashIndex >= 0) {
      const afterHash = value.slice(lastHashIndex + 1);
      if (!afterHash.includes(' ') && afterHash.length < 20) {
        setPlaceholderQuery(afterHash);
        setActiveItemIndex(index);
        setShowPlaceholderPopover(true);
      } else {
        setShowPlaceholderPopover(false);
      }
    } else {
      setShowPlaceholderPopover(false);
    }
  };

  const insertPlaceholder = (placeholder: PlaceholderInfo) => {
    if (activeItemIndex === null) return;
    
    const currentLabel = items[activeItemIndex].label;
    const lastHashIndex = currentLabel.lastIndexOf('#');
    
    if (lastHashIndex >= 0) {
      const newLabel = currentLabel.slice(0, lastHashIndex) + `#${placeholder.token}`;
      updateItemLabel(activeItemIndex, newLabel);
    } else {
      updateItemLabel(activeItemIndex, currentLabel + `#${placeholder.token}`);
    }
    
    setShowPlaceholderPopover(false);
    inputRefs.current[activeItemIndex]?.focus();
  };

  const filteredPlaceholders = placeholderInfo.filter(
    p => p.token.toLowerCase().includes(placeholderQuery.toLowerCase()) ||
         p.label.toLowerCase().includes(placeholderQuery.toLowerCase())
  );

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Sticky Header */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>
            {templateId ? t('surgeonChecklist.editTemplate', 'Edit Checklist Template') : t('surgeonChecklist.createTemplate', 'Create Checklist Template')}
          </DialogTitle>
        </DialogHeader>

        {isLoading && templateId ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-title">{t('surgeonChecklist.templateTitle', 'Template Title')}</Label>
                <Input
                  id="template-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('surgeonChecklist.templateTitlePlaceholder', 'e.g., Standard Pre-Op Checklist')}
                  data-testid="input-template-title"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="template-shared"
                  checked={isShared}
                  onCheckedChange={(checked) => setIsShared(checked === true)}
                  data-testid="checkbox-template-shared"
                />
                <Label htmlFor="template-shared" className="text-sm font-normal cursor-pointer">
                  {t('surgeonChecklist.shareWithTeam', 'Share with team')}
                </Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('surgeonChecklist.checklistItems', 'Checklist Items')}</Label>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span>{t('surgeonChecklist.placeholderHint', 'Type # for dynamic values')}</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 group relative">
                      <GripVertical className="h-4 w-4 mt-2 text-muted-foreground cursor-move shrink-0" />
                      <div className="flex-1 flex items-start gap-2">
                        <Textarea
                          ref={(el) => { inputRefs.current[index] = el; }}
                          value={item.label}
                          onChange={(e) => handleInputChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          placeholder={t('surgeonChecklist.itemPlaceholder', 'Checklist item (use #price, #admissionTime, etc.)')}
                          rows={2}
                          className="resize-none flex-1"
                          data-testid={`textarea-checklist-item-${index}`}
                        />
                        {showPlaceholderPopover && activeItemIndex === index && filteredPlaceholders.length > 0 && (
                          <div className="shrink-0 flex flex-wrap gap-1 max-w-[140px]">
                            {filteredPlaceholders.slice(0, 4).map((p) => (
                              <button
                                key={p.token}
                                onClick={() => insertPlaceholder(p)}
                                className="px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded border border-primary/20 transition-colors"
                                title={p.description}
                                data-testid={`placeholder-option-${p.token}`}
                              >
                                #{p.token}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="w-full"
                  data-testid="button-add-item"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('surgeonChecklist.addItem', 'Add Item')}
                </Button>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 px-6 py-4 border-t bg-background flex gap-2">
              <Button onClick={handleSave} disabled={isPending} className="flex-1" data-testid="button-save-template">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('common.save', 'Save')}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1" data-testid="button-cancel-template">
                {t('common.cancel', 'Cancel')}
              </Button>
              {templateId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" disabled={isPending} data-testid="button-delete-template">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('surgeonChecklist.deleteTemplate', 'Delete Template')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('surgeonChecklist.deleteTemplateConfirm', 'Are you sure you want to delete this template? This action cannot be undone.')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {t('common.delete', 'Delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
