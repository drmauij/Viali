import { TISSUE_SAMPLE_TYPES, type TissueSampleType } from "@shared/tissueSampleTypes";

export class MissingSampleCodePrefixError extends Error {
  constructor() {
    super("Set the clinic's sample code prefix in admin settings.");
    this.name = "MissingSampleCodePrefixError";
  }
}

export class TissueSampleCodeRetryExhaustedError extends Error {
  constructor() {
    super("Could not generate a unique tissue sample code after 5 retries.");
    this.name = "TissueSampleCodeRetryExhaustedError";
  }
}

export interface BuildCodeInput {
  prefix: string;
  typeCode: string;
  date: Date;
  timezone: string;
  sequence: number;
}

export function buildTissueSampleCode(input: BuildCodeInput): string {
  if (input.sequence < 1 || input.sequence > 999) {
    throw new Error(
      `sequence overflow: ${input.sequence} does not fit in 3 digits`,
    );
  }
  // Format date as YYYYMMDD in the requested timezone (not UTC).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(input.date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const date = `${y}${m}${d}`;
  const seq = String(input.sequence).padStart(3, "0");
  return `${input.prefix}-${input.typeCode}-${date}-${seq}`;
}

export interface GenerateCodeArgs {
  hospitalId: string;
  sampleType: TissueSampleType | string;
}

export interface GenerateCodeDeps {
  readHospitalConfig: (
    hospitalId: string,
  ) => Promise<{ sampleCodePrefix: string | null; timezone: string }>;
  readNextSequence: (
    hospitalId: string,
    sampleType: string,
  ) => Promise<number>;
  tryInsertCode: (code: string) => Promise<void>;
  now: () => Date;
}

const MAX_RETRIES = 5;

export async function generateTissueSampleCode(
  args: GenerateCodeArgs,
  deps: GenerateCodeDeps,
): Promise<string> {
  const config = await deps.readHospitalConfig(args.hospitalId);
  if (!config.sampleCodePrefix) {
    throw new MissingSampleCodePrefixError();
  }

  const typeConfig = TISSUE_SAMPLE_TYPES[args.sampleType as TissueSampleType];
  if (!typeConfig) {
    throw new Error(`Unknown tissue sample type: ${args.sampleType}`);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const sequence = await deps.readNextSequence(args.hospitalId, args.sampleType);
    const code = buildTissueSampleCode({
      prefix: config.sampleCodePrefix,
      typeCode: typeConfig.code,
      date: deps.now(),
      timezone: config.timezone,
      sequence,
    });
    try {
      await deps.tryInsertCode(code);
      return code;
    } catch (err: any) {
      if (err?.code !== "23505") throw err;
      // unique-violation → retry with a fresh sequence
    }
  }
  throw new TissueSampleCodeRetryExhaustedError();
}
