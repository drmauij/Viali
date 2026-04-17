import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export function ZonesChipInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
}: Props) {
  const [text, setText] = useState("");

  const filtered = useMemo(
    () =>
      suggestions
        .filter(
          (s) =>
            s.toLowerCase().includes(text.toLowerCase()) &&
            !value.includes(s),
        )
        .slice(0, 8),
    [suggestions, text, value],
  );

  const addZone = (z: string) => {
    const trimmed = z.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setText("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((z) => (
          <Badge key={z} variant="secondary" className="gap-1">
            {z}
            <button
              type="button"
              aria-label={`Remove ${z}`}
              onClick={() => onChange(value.filter((v) => v !== z))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Command className="border rounded-md">
        <CommandInput
          placeholder={placeholder ?? "Add zone…"}
          value={text}
          onValueChange={setText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              e.preventDefault();
              addZone(text);
            }
          }}
        />
        <CommandList>
          {filtered.length === 0 && text && (
            <CommandItem onSelect={() => addZone(text)}>
              Add &quot;{text}&quot;
            </CommandItem>
          )}
          {filtered.map((s) => (
            <CommandItem key={s} onSelect={() => addZone(s)}>
              {s}
            </CommandItem>
          ))}
          {filtered.length === 0 && !text && (
            <CommandEmpty>Type to search or add…</CommandEmpty>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
