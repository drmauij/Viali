// Inline editor cell for an illness item's scoringConcept. Three states:
//   - confirmed:  green chip showing the concept; pencil to override / dropdown to change
//   - suggested:  amber chip showing a heuristic/AI suggestion; ✓ to confirm or dropdown to override
//   - unmapped:   gray "— Set concept" with dropdown
// Suggestions are NEVER auto-applied to scoring; only `scoringConcept` field counts.

import { useState } from "react";
import { Check, Tags, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCORING_CONCEPTS, SCORING_CONCEPT_LABELS, type ScoringConcept } from "@shared/scoring/concepts";

const NONE_VALUE = "__none__";

interface Props {
  /** The currently confirmed concept (from item.scoringConcept). */
  confirmedConcept?: string | null;
  /** A pending suggestion (heuristic or AI) when not yet confirmed. */
  suggestion?: ScoringConcept | null;
  /** Whether the suggestion came from AI (controls icon). */
  suggestionFromAi?: boolean;
  /** Persist a new confirmed value (or null to clear). */
  onConfirm: (concept: ScoringConcept | null) => void;
  disabled?: boolean;
}

export function IllnessConceptCell({
  confirmedConcept,
  suggestion,
  suggestionFromAi = false,
  onConfirm,
  disabled = false,
}: Props) {
  const [editing, setEditing] = useState(false);

  // --- Confirmed state ---
  if (confirmedConcept && !editing) {
    const label = SCORING_CONCEPT_LABELS[confirmedConcept as ScoringConcept] ?? confirmedConcept;
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900"
          data-testid="concept-confirmed"
        >
          <Check className="h-3 w-3" />
          {label}
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => setEditing(true)}
            data-testid="concept-edit-btn"
            title="Change concept"
          >
            <Tags className="h-3 w-3" />
          </Button>
        )}
      </span>
    );
  }

  // --- Editing dropdown (override existing OR set new) ---
  if (editing) {
    // Leave the Select's value undefined when nothing is confirmed yet so that
    // picking "— None" is treated as a real value change by Radix (which skips
    // onValueChange when the new value equals the current one). Without this,
    // a user editing an unmapped row could not clear or dismiss the dropdown.
    return (
      <Select
        value={confirmedConcept ?? undefined}
        onValueChange={(v) => {
          onConfirm(v === NONE_VALUE ? null : (v as ScoringConcept));
          setEditing(false);
        }}
        open
        onOpenChange={(open) => { if (!open) setEditing(false); }}
      >
        <SelectTrigger className="h-7 text-xs w-[220px]" data-testid="concept-select">
          <SelectValue placeholder="— None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— None</SelectItem>
          {SCORING_CONCEPTS.map((c) => (
            <SelectItem key={c} value={c}>
              {SCORING_CONCEPT_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // --- Suggested state (no confirmation yet) ---
  if (suggestion) {
    const label = SCORING_CONCEPT_LABELS[suggestion] ?? suggestion;
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-900"
          data-testid="concept-suggested"
          title={suggestionFromAi ? "AI suggestion — confirm to activate" : "Suggestion — confirm to activate"}
        >
          {suggestionFromAi ? <Sparkles className="h-3 w-3" /> : null}
          {label}
        </span>
        {!disabled && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-green-700 dark:text-green-400"
              onClick={() => onConfirm(suggestion)}
              data-testid="concept-confirm-btn"
              title="Confirm suggestion"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setEditing(true)}
              data-testid="concept-override-btn"
              title="Override suggestion"
            >
              <Tags className="h-3 w-3" />
            </Button>
          </>
        )}
      </span>
    );
  }

  // --- Unmapped state ---
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="px-2 py-0.5 rounded-full bg-muted">— No concept</span>
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => setEditing(true)}
          data-testid="concept-set-btn"
          title="Set concept"
        >
          <Tags className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}
