import OpenAI from "openai";
import { findStandardParameter } from "@shared/monitorParameters";
import { getVisionAiClient, getVisionModel, VisionAiProvider } from "./visionAiFactory";
import logger from "../logger";

interface RawParameter {
  detectedName: string;
  value: number;
  unit: string;
}

interface MappedParameter {
  detectedName: string;
  standardName: string;
  value: number;
  unit: string;
  category: string;
}

interface MonitorAnalysisResult {
  monitorType: 'vitals' | 'ventilation' | 'mixed' | 'tof' | 'perfusor' | 'unknown';
  monitorBrand: 'GE' | 'Dräger' | 'Philips' | 'Mindray' | 'unknown';
  detectionMethod: 'ai_vision';
  confidence: 'high' | 'medium' | 'low';
  parameters: MappedParameter[];
  timestamp: number;
}

interface DrugCommand {
  drug: string;
  dose: string;
  confidence: 'high' | 'medium' | 'low';
}

const MONITOR_ANALYSIS_PROMPT = `You are an expert medical monitor OCR AI. Your task is to extract ALL visible numeric parameters from this anesthesia/ICU monitor screenshot with 99%+ accuracy.

STEP 1: IDENTIFY MONITOR BRAND AND TYPE
Look for brand indicators:
- GE (General Electric): Logo with "GE" text, model names like B125M, B450, B650, B850, Carescape
- Dräger/IBW: "Dräger" logo, "IBW" header, modes like S-IMV, PC-BIPAP, yellow/green interface
- Philips: "Philips" logo, IntelliVue series, blue interface
- Mindray: "Mindray" text, BeneView series
- Nihon Kohden: "NK" logo

STEP 2: IDENTIFY MONITOR TYPE
- "vitals": Patient monitor with ECG traces, SpO2, blood pressure, heart rate
- "ventilation": Ventilator/anesthesia machine with flow curves, pressure waveforms, CO2 capnography
- "mixed": Shows both vitals and ventilation parameters
- "tof": Train-of-Four neuromuscular monitoring
- "perfusor": Infusion pump display

STEP 3: SYSTEMATIC REGION-BASED EXTRACTION
Extract parameters by scanning these regions:

FOR VITALS MONITORS (e.g., GE B-series):
- RIGHT PANEL: Large colored numbers (green=HR, yellow/cyan=SpO2, red=BP, blue=CVP)
- BOTTOM BAR: Blood pressure sys/dia (MAP), secondary vitals
- WAVEFORM LABELS: Parameters next to each trace
- STATUS AREAS: PI (perfusion index), ST segment, temperature

FOR VENTILATION MONITORS (e.g., Dräger/IBW):
- TOP LEFT: Gas measurements - CO2 (Insp/Exp columns), O2 percentages, MAC value
- LEFT SIDE: Gas supply pressures (O2, Air in kPa), flow indicators
- RIGHT PANEL ("Monitoring" section): MV, VTe, Ppeak, Freq, PEEP, Pplateau, Cdyn, Resist
- BOTTOM BAR: Settings row - O2%, Fluss, Freq, TInsp, Plateau, VTi, PMax, PEEP, Trigger
- MODE TABS: Current ventilation mode (S-IMV, PCV, PSV, etc.)

COMPLETE PARAMETER REFERENCE:

VITALS PARAMETERS:
- HF/HR → Heart Rate (20-240 bpm)
- Pleth → Plethysmograph pulse rate from SpO2 sensor (20-240 /min) - may differ from HR
- SpO2 → Oxygen Saturation (50-100%)
- PI → Perfusion Index (0-20%)
- ST → ST Segment deviation (-10 to +10 mm)
- SYS/DIA → Blood Pressure systolic/diastolic (40-250 / 20-180 mmHg)
- NIBD/NBP → Non-Invasive Blood Pressure, same as SYS/DIA (extract as SYS, DIA, MAP)
- MAP/MAD/MD → Mean Arterial Pressure (30-180 mmHg), often shown in parentheses like "(70)"
- ART → Invasive Arterial BP (40-200 mmHg)
- ZVD/CVP → Central Venous Pressure (0-30 mmHg)
- Temp/T/T1/T2 → Temperature (30-45 °C)
- Resp/RF → Respiratory Rate from impedance (4-60 /min)

VENTILATION PARAMETERS:
- CO2 Insp → Inspired CO2 (0-10 mmHg or %)
- CO2 Exp/etCO2/Et → Expired/End-tidal CO2 (15-80 mmHg or 3-8%)
- O2 Insp/Exp/Fi/Et → Inspired/Expired O2 percentages (21-100%)
- MAC → Minimum Alveolar Concentration (0-3)
- O2% / FiO2 → Fraction Inspired O2 (21-100%)
- Fluss/Flow/Gesamt-Flow → Gas flow (0-20 L/min)
- Freq/AF/RR/RF → Respiratory Rate (4-60 /min)
- TInsp → Inspiratory Time (0.2-5 s)
- Plateau → Plateau percentage (0-100%)
- VTi/VTe/VT/TVexp → Tidal Volume inspiratory/expiratory (50-1500 mL)
- PMax/Ppeak/PIP/Pinsp → Peak Inspiratory Pressure (5-60 mbar or cmH2O)
- Pmean → Mean Airway Pressure (2-30 mbar or cmH2O)
- PEEP → Positive End-Expiratory Pressure (0-30 mbar or cmH2O), may show "Aus" (German for Off) = 0
- Pplateau → Plateau Pressure (0-50 mbar)
- MV/MVe → Minute Volume (0-30 L/min)
- Cdyn/Compl → Dynamic Compliance (0-200 mL/mbar or mL/cmH2O)
- Resist → Airway Resistance (0-50 mbar/L/s)
- Trigger → Trigger sensitivity (0-20 L/min)
- I:E/I:E → Inspiration:Expiration ratio (e.g., 1:1, 1:2)

GAS SUPPLY (left side gauges):
- O2 kPa → Oxygen supply pressure
- Air kPa → Compressed air pressure

CRITICAL EXTRACTION RULES:
1. Extract EVERY visible numeric value with its label
2. For compound displays (e.g., "89/53" for BP), extract as separate SYS and DIA values
3. For tables with Insp/Exp columns, extract both values separately
4. Include units exactly as shown (mbar, cmH2O, mmHg, kPa, L/min, mL, %, /min, s)
5. For values shown as "AUS" or "OFF" or "---", skip that parameter
6. Read small text carefully - don't miss Cdyn, Resist, Trigger in right panels
7. Extract MAC even if 0.0 (it's still a valid parameter)
8. For BP, also extract MAP if shown in parentheses like "(69)"

Return a JSON object:
{
  "monitorType": "vitals" | "ventilation" | "mixed" | "tof" | "perfusor" | "unknown",
  "monitorBrand": "GE" | "Dräger" | "Philips" | "Mindray" | "unknown",
  "confidence": "high" | "medium" | "low",
  "parameters": [
    { "detectedName": "exact label", "value": number, "unit": "exact unit" }
  ]
}

EXAMPLE - GE B125M Vitals Monitor:
{
  "monitorType": "vitals",
  "monitorBrand": "GE",
  "confidence": "high",
  "parameters": [
    { "detectedName": "HF", "value": 51, "unit": "/min" },
    { "detectedName": "ST", "value": 0.1, "unit": "mm" },
    { "detectedName": "SpO2", "value": 92, "unit": "%" },
    { "detectedName": "PI", "value": 0.45, "unit": "" },
    { "detectedName": "SYS", "value": 89, "unit": "mmHg" },
    { "detectedName": "DIA", "value": 53, "unit": "mmHg" },
    { "detectedName": "MAD", "value": 69, "unit": "mmHg" }
  ]
}

EXAMPLE - Dräger/IBW Ventilator (S-IMV mode):
{
  "monitorType": "ventilation",
  "monitorBrand": "Dräger",
  "confidence": "high",
  "parameters": [
    { "detectedName": "CO2 Insp", "value": 0, "unit": "mmHg" },
    { "detectedName": "CO2 Exp", "value": 35, "unit": "mmHg" },
    { "detectedName": "O2 Insp", "value": 29, "unit": "%" },
    { "detectedName": "O2 Exp", "value": 23, "unit": "%" },
    { "detectedName": "MAC", "value": 0.0, "unit": "" },
    { "detectedName": "O2", "value": 40, "unit": "%" },
    { "detectedName": "Fluss", "value": 1.00, "unit": "L/min" },
    { "detectedName": "Freq", "value": 10, "unit": "/min" },
    { "detectedName": "TInsp", "value": 1.4, "unit": "s" },
    { "detectedName": "Plateau", "value": 10, "unit": "%" },
    { "detectedName": "VTi", "value": 450, "unit": "mL" },
    { "detectedName": "PMax", "value": 25, "unit": "mbar" },
    { "detectedName": "PEEP", "value": 5, "unit": "mbar" },
    { "detectedName": "Trigger", "value": 1.5, "unit": "L/min" },
    { "detectedName": "MV", "value": 4.6, "unit": "L/min" },
    { "detectedName": "VTe", "value": 480, "unit": "mL" },
    { "detectedName": "Ppeak", "value": 18, "unit": "mbar" },
    { "detectedName": "Pplateau", "value": 12, "unit": "mbar" },
    { "detectedName": "Cdyn", "value": 36, "unit": "mL/mbar" },
    { "detectedName": "Resist", "value": 16, "unit": "mbar/L/s" }
  ]
}`;

const DRUG_COMMAND_PROMPT = `You are a medical command parser for anesthesia drug administration in German hospitals.

Parse the voice command and extract ALL drug names and dosages mentioned. The command may contain multiple drugs.

COMMON GERMAN PATTERNS:
- Single drug: "gebe 5mg Ephedrin" → give 5mg ephedrine
- Multiple drugs: "Fentanyl 50 Mikrogramm, Rocuronium 5mg und Ephedrin 5mg" → fentanyl 50mcg, rocuronium 5mg, and ephedrine 5mg
- Sequential: "100mg Propofol, dann 50 Mikrogramm Fentanyl" → 100mg propofol, then 50mcg fentanyl

DRUG NAME NORMALIZATION:
- Standardize to common drug names (Ephedrin → Ephedrine, Fentanyl → Fentanyl, Rocuronium → Rocuronium, etc.)
- Keep original German name if standard

DOSAGE EXTRACTION:
- Extract numeric value and unit for each drug
- Common units: mg, mcg/µg, g, ml, IE (international units)
- Normalize: "Mikrogramm" → "mcg", "Milligramm" → "mg"

Return ONLY a JSON object with an array of drugs:
{
  "drugs": [
    {
      "drug": "string (standardized drug name)",
      "dose": "string (value + unit, e.g., '5mg', '100mcg')",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

export async function analyzeMonitorImage(base64Image: string, hospitalId?: string): Promise<MonitorAnalysisResult> {
  // Get the appropriate AI client based on hospital settings
  const { client: openai, provider } = hospitalId 
    ? await getVisionAiClient(hospitalId)
    : { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), provider: "openai" as VisionAiProvider };
  const model = getVisionModel(provider);
  logger.info(`[VisionAI] Using ${provider} (${model}) for monitor analysis`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: MONITOR_ANALYSIS_PROMPT },
          {
            type: "image_url",
            image_url: { 
              url: `data:image/jpeg;base64,${base64Image}`,
              detail: "high"
            }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const aiResponse = JSON.parse(response.choices[0].message.content || '{}');
  
  const mappedParameters: MappedParameter[] = (aiResponse.parameters || []).map((param: RawParameter) => {
    const standardParam = findStandardParameter(param.detectedName);
    
    return {
      detectedName: param.detectedName,
      standardName: standardParam?.standardName || param.detectedName,
      value: param.value,
      unit: param.unit || standardParam?.unit || '',
      category: standardParam?.category || 'unknown'
    };
  });

  const result: MonitorAnalysisResult = {
    monitorType: aiResponse.monitorType || 'unknown',
    monitorBrand: aiResponse.monitorBrand || 'unknown',
    detectionMethod: 'ai_vision',
    confidence: aiResponse.confidence || 'medium',
    parameters: mappedParameters,
    timestamp: Date.now()
  };

  logger.info('[Monitor Analysis] Brand:', result.monitorBrand, 'Type:', result.monitorType, 'Parameters:', mappedParameters.length);
  return result;
}

export async function transcribeVoice(audioData: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const audioBuffer = Buffer.from(audioData, 'base64');
  
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  const file = Object.assign(blob, {
    name: 'audio.webm',
    lastModified: Date.now(),
  });

  const transcription = await openai.audio.transcriptions.create({
    file: file as any,
    model: 'whisper-1',
    language: 'de',
    response_format: 'text'
  });

  logger.info('[Voice Transcription]:', transcription);
  return transcription;
}

export async function parseDrugCommand(transcription: string, hospitalId?: string): Promise<DrugCommand[]> {
  // Drug command parsing uses text-only, so we use OpenAI for consistency
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: DRUG_COMMAND_PROMPT
      },
      {
        role: "user",
        content: `INPUT: "${transcription}"`
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const result = JSON.parse(response.choices[0].message.content || '{"drugs": []}');
  logger.info('[Drug Command Parser] Parsed drugs:', result.drugs);
  return result.drugs || [];
}
