import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CheckCircle, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type AllergyOption = { id: string; label: string };

interface EditableAllergiesProps {
  allergies: string[] | undefined;
  noAllergies: boolean | undefined;
  canWrite: boolean;
  allergyList: AllergyOption[];
  onAllergiesChange: (allergies: string[]) => void;
  onNoAllergiesChange: (val: boolean) => void;
}

export function EditableAllergies({
  allergies,
  noAllergies,
  canWrite,
  allergyList,
  onAllergiesChange,
  onNoAllergiesChange,
}: EditableAllergiesProps) {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const currentAllergies = allergies || [];

  // Read-only mode
  if (!canWrite) {
    if (noAllergies) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
      );
    }
    if (currentAllergies.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          {t("questionnaireTab.noData", "No data provided")}
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {currentAllergies.map((a, i) => (
          <Badge key={i} variant="secondary">{a}</Badge>
        ))}
      </div>
    );
  }

  // None confirmed + add button
  if (noAllergies) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onNoAllergiesChange(false)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("questionnaireTab.addItems", "Add items")}
        </Button>
      </div>
    );
  }

  const addAllergy = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (currentAllergies.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return;
    onAllergiesChange([...currentAllergies, trimmed]);
  };

  const removeAllergy = (index: number) => {
    onAllergiesChange(currentAllergies.filter((_, i) => i !== index));
  };

  const handleAddCustom = () => {
    if (customInput.trim()) {
      addAllergy(customInput.trim());
      setCustomInput("");
    }
  };

  return (
    <div className="space-y-3">
      {/* Current allergies as dismissible badges */}
      {currentAllergies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {currentAllergies.map((a, i) => (
            <Badge key={i} variant="secondary" className="pr-1 gap-1">
              {a}
              <button
                onClick={() => removeAllergy(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add from list + custom input */}
      <div className="flex items-center gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              {t("questionnaireTab.addFromList", "Add from list")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder={t("questionnaireTab.searchAllergies", "Search allergies...")}
              />
              <CommandList>
                <CommandEmpty>
                  {t("questionnaireTab.noResults", "No results")}
                </CommandEmpty>
                <CommandGroup>
                  {allergyList.map((item) => {
                    const isSelected = currentAllergies.some(
                      (a) => a.toLowerCase() === item.label.toLowerCase()
                    );
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.label}
                        onSelect={() => {
                          if (isSelected) {
                            // Remove it
                            onAllergiesChange(
                              currentAllergies.filter(
                                (a) => a.toLowerCase() !== item.label.toLowerCase()
                              )
                            );
                          } else {
                            addAllergy(item.label);
                          }
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {item.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Custom free-text entry */}
        <div className="flex items-center gap-1">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder={t("questionnaireTab.customAllergy", "Custom allergy...")}
            className="h-8 text-xs w-40"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Confirm none checkbox when empty */}
      {currentAllergies.length === 0 && (
        <div className="flex items-center space-x-2 pt-1">
          <input
            type="checkbox"
            id="allergy-none"
            checked={false}
            onChange={() => onNoAllergiesChange(true)}
            className="rounded border-input"
          />
          <label htmlFor="allergy-none" className="text-sm text-muted-foreground cursor-pointer">
            {t("questionnaireTab.confirmNone", "Confirm none")}
          </label>
        </div>
      )}
    </div>
  );
}
