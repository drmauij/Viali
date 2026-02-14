import { createContext, useContext, useState, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { formatDateLong, formatShortDate, formatDateTimeLong } from "@/lib/dateUtils";

export type EditableValueType = "text" | "number" | "date" | "time" | "datetime" | "vital-point";

export interface EditValueConfig {
  type: EditableValueType;
  currentValue: any;
  currentTime?: Date | number; // For time-based values
  label: string;
  onSave: (value: any, time?: Date | number) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  allowTimeEdit?: boolean; // Whether to show time editing
  allowDelete?: boolean; // Whether to show delete button
}

interface EditValueContextType {
  openEdit: (config: EditValueConfig) => void;
  closeEdit: () => void;
}

const EditValueContext = createContext<EditValueContextType | null>(null);

export function EditValueProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<EditValueConfig | null>(null);
  const [editedValue, setEditedValue] = useState<any>("");
  const [editedTime, setEditedTime] = useState<Date>(new Date());
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = (newConfig: EditValueConfig) => {
    setConfig(newConfig);
    setEditedValue(newConfig.currentValue);
    
    // Set initial time
    if (newConfig.currentTime) {
      const timeDate = typeof newConfig.currentTime === 'number' 
        ? new Date(newConfig.currentTime) 
        : newConfig.currentTime;
      setEditedTime(timeDate);
    } else {
      setEditedTime(new Date());
    }
    
    setIsOpen(true);
  };

  const closeEdit = () => {
    setIsOpen(false);
    setTimeout(() => {
      setConfig(null);
      setEditedValue("");
      setEditedTime(new Date());
      setIsSaving(false);
    }, 200);
  };

  const handleSave = async () => {
    if (!config) return;
    
    setIsSaving(true);
    try {
      const timeValue = config.allowTimeEdit ? editedTime.getTime() : undefined;
      await config.onSave(editedValue, timeValue);
      closeEdit();
    } catch (error) {
      console.error("Error saving value:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config?.onDelete) return;
    
    setIsSaving(true);
    try {
      await config.onDelete();
      closeEdit();
    } catch (error) {
      console.error("Error deleting value:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimeDisplay = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleTimeChange = (field: 'hours' | 'minutes', value: string) => {
    const newTime = new Date(editedTime);
    const numValue = parseInt(value) || 0;
    
    if (field === 'hours') {
      newTime.setHours(Math.max(0, Math.min(23, numValue)));
    } else {
      newTime.setMinutes(Math.max(0, Math.min(59, numValue)));
    }
    
    setEditedTime(newTime);
  };

  const { t } = useTranslation();

  return (
    <EditValueContext.Provider value={{ openEdit, closeEdit }}>
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-edit-value">
          <DialogHeader>
            <DialogTitle>{t('editableValue.editTitle', { label: config?.label })}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Value Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-value">{t('common.value')}</Label>
              {config?.type === "number" || config?.type === "vital-point" ? (
                <Input
                  id="edit-value"
                  type="number"
                  value={editedValue}
                  onChange={(e) => setEditedValue(parseFloat(e.target.value) || 0)}
                  min={config.min}
                  max={config.max}
                  step={config.step || 1}
                  placeholder={config.placeholder}
                  data-testid="input-edit-value"
                />
              ) : config?.type === "date" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-date-picker"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editedValue ? formatDateLong(new Date(editedValue)) : <span>{t('editableValue.pickDate')}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editedValue ? new Date(editedValue) : undefined}
                      onSelect={(date) => setEditedValue(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <Input
                  id="edit-value"
                  type="text"
                  value={editedValue}
                  onChange={(e) => setEditedValue(e.target.value)}
                  placeholder={config?.placeholder}
                  data-testid="input-edit-value"
                />
              )}
            </div>

            {/* Time Edit Section */}
            {config?.allowTimeEdit && (
              <div className="space-y-2">
                <Label>{t('common.time')}</Label>
                <div className="flex items-center gap-2">
                  {/* Date Picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1 justify-start text-left font-normal"
                        data-testid="button-time-date-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatShortDate(editedTime)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={editedTime}
                        onSelect={(date) => date && setEditedTime(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  
                  {/* Time Input */}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={editedTime.getHours()}
                      onChange={(e) => handleTimeChange('hours', e.target.value)}
                      className="w-16 text-center"
                      data-testid="input-edit-hours"
                    />
                    <span className="text-lg font-semibold">:</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={editedTime.getMinutes().toString().padStart(2, '0')}
                      onChange={(e) => handleTimeChange('minutes', e.target.value)}
                      className="w-16 text-center"
                      data-testid="input-edit-minutes"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {formatDateTimeLong(editedTime)}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-0">
            {config?.allowDelete && config.onDelete && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSaving}
                className="flex-1 sm:flex-initial"
                data-testid="button-delete-value"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            )}
            <div className="flex-1 flex gap-2">
              <Button
                variant="outline"
                onClick={closeEdit}
                disabled={isSaving}
                className="flex-1"
                data-testid="button-cancel-edit"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
                data-testid="button-save-value"
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditValueContext.Provider>
  );
}

export function useEditValue() {
  const context = useContext(EditValueContext);
  if (!context) {
    throw new Error("useEditValue must be used within EditValueProvider");
  }
  return context;
}

// Editable Value Wrapper Component
interface EditableValueProps {
  type: EditableValueType;
  value: any;
  time?: Date | number;
  label: string;
  onSave: (value: any, time?: Date | number) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  allowTimeEdit?: boolean;
  allowDelete?: boolean;
  testId?: string;
}

export function EditableValue({
  type,
  value,
  time,
  label,
  onSave,
  onDelete,
  children,
  className = "",
  min,
  max,
  step,
  placeholder,
  allowTimeEdit = false,
  allowDelete = false,
  testId,
}: EditableValueProps) {
  const { openEdit } = useEditValue();

  const handleClick = () => {
    openEdit({
      type,
      currentValue: value,
      currentTime: time,
      label,
      onSave,
      onDelete,
      min,
      max,
      step,
      placeholder,
      allowTimeEdit,
      allowDelete,
    });
  };

  return (
    <span
      onClick={handleClick}
      className={`cursor-pointer hover:bg-accent hover:text-accent-foreground rounded px-1 transition-colors ${className}`}
      data-testid={testId || "editable-value"}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {children}
    </span>
  );
}
