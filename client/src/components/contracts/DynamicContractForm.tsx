import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  VariablesSchema,
  SimpleVariable,
  SelectableListVariable,
  SelectableListOption,
} from "@shared/contractTemplates/types";

interface Props {
  variables: VariablesSchema;
  initial?: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

function setByPath(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(obj);
  const parts = key.split(".");
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] =
      (cur[parts[i]] as Record<string, unknown> | undefined) ?? {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

function getByPath(obj: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (acc, p) =>
      acc != null && typeof acc === "object"
        ? (acc as Record<string, unknown>)[p]
        : undefined,
    obj,
  );
}

export function DynamicContractForm({
  variables,
  initial = {},
  onChange,
}: Props) {
  const [data, setData] = React.useState<Record<string, unknown>>(initial);

  // Stable onChange ref so the effect only re-runs when data changes.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  React.useEffect(() => {
    onChangeRef.current(data);
  }, [data]);

  function patch(key: string, value: unknown) {
    setData((d) => setByPath(d, key, value));
  }

  // Only render user-editable simple variables (source vars are injected server-side).
  const editableSimple = variables.simple.filter((v) => !v.source);

  return (
    <div className="space-y-6">
      {variables.selectableLists.map((l) => (
        <SelectableListPicker
          key={l.key}
          variable={l}
          value={
            (getByPath(data, l.key) as Record<string, unknown> | undefined) ??
            null
          }
          onChange={(v) => patch(l.key, v)}
        />
      ))}
      {editableSimple.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {editableSimple.map((v) => (
            <SimpleField
              key={v.key}
              variable={v}
              value={String(getByPath(data, v.key) ?? "")}
              onChange={(val) => patch(v.key, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleField({
  variable,
  value,
  onChange,
}: {
  variable: SimpleVariable;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputType =
    variable.type === "date"
      ? "date"
      : variable.type === "email"
        ? "email"
        : variable.type === "phone"
          ? "tel"
          : variable.type === "number"
            ? "number"
            : "text";

  return (
    <div className="space-y-1">
      <Label>
        {variable.label}
        {variable.required && " *"}
      </Label>
      <Input
        type={inputType}
        required={variable.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={variable.default ?? ""}
      />
    </div>
  );
}

function SelectableListPicker({
  variable,
  value,
  onChange,
}: {
  variable: SelectableListVariable;
  value: Record<string, unknown> | null;
  onChange: (v: SelectableListOption) => void;
}) {
  // The first field after "id" is used as the card title.
  // Subsequent fields are rendered as secondary lines.
  const displayFields = variable.fields.filter((f) => f.key !== "id");
  const [titleField, ...restFields] = displayFields;

  return (
    <div className="space-y-2">
      <Label className="text-base font-medium">{variable.label}</Label>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {variable.options.map((opt) => {
          const selected = value?.id === opt.id;
          return (
            <button
              type="button"
              key={opt.id}
              onClick={() => onChange(opt)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              {titleField && (
                <div className="font-semibold text-sm">
                  {String(opt[titleField.key] ?? "")}
                </div>
              )}
              {restFields.map((f) => (
                <div key={f.key} className="text-xs text-muted-foreground mt-0.5">
                  {String(opt[f.key] ?? "")}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
