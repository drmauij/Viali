import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface CalendarSearchResult {
  id: string;
  patientId: string | null;
  patientName: string;
  date: string;
  time: string | null;
  context: string; // provider name for appointments, procedure + room for surgeries
}

interface CalendarSearchProps {
  type: "appointments" | "surgeries";
  hospitalId: string;
  onSelect: (result: CalendarSearchResult) => void;
  onClear: () => void;
}

export default function CalendarSearch({ type, hospitalId, onSelect, onClear }: CalendarSearchProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedQuery]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const searchUrl = type === "surgeries"
    ? `/api/anesthesia/surgeries/search?hospitalId=${hospitalId}&q=${encodeURIComponent(debouncedQuery)}`
    : `/api/clinic/${hospitalId}/appointments/search?q=${encodeURIComponent(debouncedQuery)}`;

  const { data: rawResults = [], isLoading } = useQuery<any[]>({
    queryKey: [searchUrl],
    enabled: debouncedQuery.length >= 2,
  });

  // Map raw API results to CalendarSearchResult
  const results: CalendarSearchResult[] = rawResults.map((r: any) => ({
    id: r.id,
    patientId: r.patientId ?? null,
    patientName: r.patientName,
    date: r.date,
    time: r.time || r.startTime || null,
    context: type === "surgeries"
      ? [r.procedure, r.room].filter(Boolean).join(" · ")
      : [r.providerName, r.serviceName].filter(Boolean).join(" · "),
  }));

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
    onClear();
  }, [onClear]);

  const handleSelect = useCallback((result: CalendarSearchResult) => {
    onSelect(result);
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, handleClose, handleSelect]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div ref={containerRef} data-testid="calendar-search">
      {/* Search icon button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("h-8 w-8 sm:h-9 sm:w-9 p-0", isOpen && "invisible")}
        data-testid="button-calendar-search"
      >
        <Search className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>

      {/* Full-width overlay — anchored to the nearest `relative` parent (the header row) */}
      {isOpen && (
        <div className="absolute inset-0 z-40 flex items-center px-3 sm:px-4 bg-background animate-in fade-in duration-150">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('calendarSearch.placeholder', 'Search patient...')}
              className="h-9 w-full pl-9 pr-9 text-sm"
              data-testid="input-calendar-search"
            />
            <button
              onClick={handleClose}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-calendar-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && debouncedQuery.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 mx-3 sm:mx-4 bg-popover border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
             data-testid="calendar-search-results">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-4 px-3 text-sm text-muted-foreground text-center">
              {t('calendarSearch.noResults', 'No results found')}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b last:border-b-0",
                  selectedIndex === index && "bg-accent"
                )}
                data-testid={`search-result-${index}`}
              >
                <div className="font-medium text-sm">{result.patientName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(result.date)}
                  {result.time && ` · ${result.time}`}
                  {result.context && ` — ${result.context}`}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
