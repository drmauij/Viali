import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ServiceGroupComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function ServiceGroupCombobox({
  value,
  onChange,
  suggestions,
  placeholder = "Select or type a group...",
  disabled,
}: ServiceGroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const exactMatch = suggestions.some(s => s.toLowerCase() === query.toLowerCase());
  const showCreateOption = query.trim().length > 0 && !exactMatch;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or create group..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No existing groups.</CommandEmpty>
            {suggestions.length > 0 && (
              <CommandGroup heading="Existing groups">
                {suggestions.map(group => (
                  <CommandItem
                    key={group}
                    value={group}
                    onSelect={() => {
                      onChange(group);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === group ? "opacity-100" : "opacity-0")} />
                    {group}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreateOption && (
              <CommandGroup heading="Create new">
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => {
                    onChange(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  Create "{query.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
