import * as React from "react";
import type { VariablesSchema, SimpleVariable, SelectableListVariable, SelectableListField, VariableType } from "@shared/contractTemplates/types";

interface Props {
  value: VariablesSchema;
  onChange: (next: VariablesSchema) => void;
}

const TYPES: VariableType[] = ["text", "number", "date", "money", "iban", "email", "phone"];

export function VariablesPanel({ value, onChange }: Props) {
  function patchSimple(idx: number, p: Partial<SimpleVariable>) {
    const next = [...value.simple];
    next[idx] = { ...next[idx], ...p };
    onChange({ ...value, simple: next });
  }
  function addSimple() {
    onChange({ ...value, simple: [...value.simple, { key: "new.var", type: "text", label: "New" }] });
  }
  function removeSimple(idx: number) {
    onChange({ ...value, simple: value.simple.filter((_, i) => i !== idx) });
  }
  function patchList(idx: number, p: Partial<SelectableListVariable>) {
    const next = [...value.selectableLists];
    next[idx] = { ...next[idx], ...p };
    onChange({ ...value, selectableLists: next });
  }
  function addList() {
    onChange({
      ...value,
      selectableLists: [
        ...value.selectableLists,
        { key: "new_list", label: "New", fields: [{ key: "id", type: "text" }], options: [] },
      ],
    });
  }
  function removeList(idx: number) {
    onChange({ ...value, selectableLists: value.selectableLists.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6 text-sm">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Simple</h3>
          <button onClick={addSimple} className="text-xs underline">+ Add</button>
        </div>
        <div className="space-y-2">
          {value.simple.map((v, i) => (
            <div key={i} className="rounded border bg-card p-2 space-y-1 relative">
              <button
                onClick={() => removeSimple(i)}
                className="absolute right-1 top-1 text-xs text-red-600"
                aria-label="Remove"
              >×</button>
              <input
                className="w-full rounded border bg-background text-foreground px-2 py-1"
                value={v.key}
                onChange={(e) => patchSimple(i, { key: e.target.value })}
                placeholder="key (e.g. worker.iban)"
              />
              <input
                className="w-full rounded border bg-background text-foreground px-2 py-1"
                value={v.label}
                onChange={(e) => patchSimple(i, { label: e.target.value })}
                placeholder="label"
              />
              <select
                className="w-full rounded border bg-background text-foreground px-2 py-1"
                value={v.type}
                onChange={(e) => patchSimple(i, { type: e.target.value as VariableType })}
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!v.required}
                  onChange={(e) => patchSimple(i, { required: e.target.checked })}
                />
                required
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Selectable lists</h3>
          <button onClick={addList} className="text-xs underline">+ Add</button>
        </div>
        <div className="space-y-3">
          {value.selectableLists.map((l, i) => (
            <SelectableListEditor
              key={i}
              value={l}
              onChange={(p) => patchList(i, p)}
              onRemove={() => removeList(i)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SelectableListEditor({
  value,
  onChange,
  onRemove,
}: {
  value: SelectableListVariable;
  onChange: (p: Partial<SelectableListVariable>) => void;
  onRemove: () => void;
}) {
  const fields = value.fields;

  function addField() {
    const existing = new Set(fields.map((f) => f.key));
    let n = fields.length + 1;
    let key = `field${n}`;
    while (existing.has(key)) key = `field${++n}`;
    const newFields = [...fields, { key, type: "text" as VariableType }];
    const newOptions = value.options.map((opt) => ({ ...opt, [key]: "" }));
    onChange({ fields: newFields, options: newOptions });
  }

  function removeField(idx: number) {
    const removedKey = fields[idx].key;
    const newFields = fields.filter((_, i) => i !== idx);
    const newOptions = value.options.map((opt, oi) => {
      const { [removedKey]: _drop, ...rest } = opt;
      // Storage requires id on every option; if user dropped the "id" column, regenerate.
      const id = (rest as { id?: string }).id || (removedKey === "id" ? `opt_${oi + 1}` : "");
      return { ...rest, id } as typeof opt;
    });
    onChange({ fields: newFields, options: newOptions });
  }

  function patchField(idx: number, p: Partial<SelectableListField>) {
    const oldKey = fields[idx].key;
    const newFields = [...fields];
    newFields[idx] = { ...newFields[idx], ...p };
    const newKey = newFields[idx].key;

    if (p.key !== undefined && oldKey !== newKey) {
      const newOptions = value.options.map((opt) => {
        const { [oldKey]: oldVal, ...rest } = opt;
        return { ...rest, [newKey]: oldVal ?? "" } as typeof opt;
      });
      onChange({ fields: newFields, options: newOptions });
    } else {
      onChange({ fields: newFields });
    }
  }

  return (
    <div className="rounded border bg-card p-2 space-y-2 relative">
      <button onClick={onRemove} className="absolute right-1 top-1 text-xs text-red-600" aria-label="Remove">×</button>
      <input
        className="w-full rounded border bg-background text-foreground px-2 py-1 font-medium"
        value={value.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <input
        className="w-full rounded border bg-background text-foreground px-2 py-1 text-xs"
        value={value.key}
        onChange={(e) => onChange({ key: e.target.value })}
      />
      <table className="w-full text-xs">
        <thead>
          <tr>
            {fields.map((f, fi) => (
              <th key={fi} className="text-left p-1 align-top min-w-[90px]">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-0.5">
                    <input
                      className="flex-1 min-w-0 rounded border bg-background text-foreground px-1 py-0.5 font-semibold"
                      value={f.key}
                      onChange={(e) => patchField(fi, { key: e.target.value })}
                      placeholder="key"
                    />
                    <button
                      onClick={() => removeField(fi)}
                      className="text-red-600 px-0.5 leading-none"
                      aria-label="Remove field"
                    >×</button>
                  </div>
                  <select
                    className="w-full rounded border bg-background text-foreground px-1 py-0.5"
                    value={f.type}
                    onChange={(e) => patchField(fi, { type: e.target.value as VariableType })}
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {value.options.map((opt, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={f.key}>
                  <input
                    className="w-full rounded border bg-background text-foreground px-1 py-0.5"
                    value={String(opt[f.key] ?? "")}
                    onChange={(e) => {
                      const next = [...value.options];
                      next[i] = { ...next[i], [f.key]: e.target.value };
                      onChange({ options: next });
                    }}
                  />
                </td>
              ))}
              <td>
                <button
                  onClick={() => onChange({ options: value.options.filter((_, j) => j !== i) })}
                  className="text-xs text-red-600"
                >×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3">
        <button onClick={addField} className="text-xs underline">+ Add field</button>
        <button
          onClick={() =>
            onChange({
              options: [
                ...value.options,
                fields.reduce((a, f) => ({ ...a, [f.key]: "" }), { id: `opt_${value.options.length + 1}` }) as never,
              ],
            })
          }
          className="text-xs underline"
        >
          + Add option
        </button>
      </div>
    </div>
  );
}
