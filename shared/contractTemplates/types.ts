// shared/contractTemplates/types.ts
// Pure type-only module — no runtime imports.

export type BlockType = "heading" | "paragraph" | "list" | "section" | "signature" | "pageBreak" | "spacer";

export interface BlockBase {
  id: string;             // stable id for editor reorder; generated client-side
  type: BlockType;
}

export interface HeadingBlock extends BlockBase { type: "heading"; level: 1 | 2 | 3; text: string; }
export interface ParagraphBlock extends BlockBase { type: "paragraph"; text: string; }
export interface ListBlock extends BlockBase { type: "list"; ordered: boolean; items: string[]; }
export interface SectionBlock extends BlockBase { type: "section"; title?: string; children: Block[]; }
export interface SignatureBlock extends BlockBase { type: "signature"; party: "worker" | "manager"; label: string; }
export interface PageBreakBlock extends BlockBase { type: "pageBreak"; }
export interface SpacerBlock extends BlockBase { type: "spacer"; height: number; }

export type Block =
  | HeadingBlock | ParagraphBlock | ListBlock | SectionBlock
  | SignatureBlock | PageBreakBlock | SpacerBlock;

// ───────── Variables ─────────

export type VariableType = "text" | "number" | "date" | "money" | "iban" | "email" | "phone";

export interface SimpleVariable {
  key: string;            // dotted path, e.g. "worker.iban"
  type: VariableType;
  label: string;
  required?: boolean;
  default?: string;
  source?: `auto:${string}`;  // server-injected at submit, e.g. "auto:hospital.companyName"
}

export interface SelectableListField {
  key: string;
  type: VariableType;
}

export interface SelectableListOption {
  id: string;
  [field: string]: string | number;
}

export interface SelectableListVariable {
  key: string;
  label: string;
  fields: SelectableListField[];
  options: SelectableListOption[];
}

export interface VariablesSchema {
  simple: SimpleVariable[];
  selectableLists: SelectableListVariable[];
}

// ───────── Template + snapshot ─────────

export interface TemplateBody {
  blocks: Block[];
  variables: VariablesSchema;
}

// Filled values stored in worker_contracts.data
export type ContractData = Record<string, unknown>;
