import { ContractDocument } from "@/lib/contractTemplates/ContractDocument";
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";
import type { Block, VariablesSchema, ContractData } from "@shared/contractTemplates/types";

function setByPath(obj: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = (cur[parts[i]] as Record<string, unknown> | undefined) ?? {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function sampleData(variables: VariablesSchema): ContractData {
  const out: Record<string, unknown> = {};
  for (const v of variables.simple) {
    if (v.source) continue;
    setByPath(out, v.key, v.default ?? `[${v.label}]`);
  }
  for (const l of variables.selectableLists) {
    setByPath(out, l.key, l.options[0] ?? {});
  }
  return out;
}

interface Props {
  blocks: Block[];
  variables: VariablesSchema;
}

export function TemplatePreview({ blocks, variables }: Props) {
  const data = sampleData(variables);
  async function downloadPdf() {
    const blob = await pdf(
      <ContractDocumentPdf
        blocks={blocks}
        data={data}
        workerSignaturePng={null}
        managerSignaturePng={null}
      />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    window.open(url);
  }
  return (
    <div className="space-y-2">
      <button onClick={downloadPdf} className="text-sm underline">
        Download sample PDF
      </button>
      <div className="rounded border bg-white">
        <ContractDocument
          blocks={blocks}
          data={data}
          workerSignaturePng={null}
          managerSignaturePng={null}
        />
      </div>
    </div>
  );
}
