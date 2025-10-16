// Monitor type classification
export type MonitorType = 'vitals' | 'ventilation' | 'tof' | 'perfusor' | 'mixed' | 'unknown';

// Parameter mapping system for multilingual support
export interface ParameterAlias {
  standardName: string;  // English standard name
  aliases: string[];     // All possible names (different languages, abbreviations)
  category: 'vitals' | 'ventilation' | 'tof' | 'perfusor';
  unit?: string;
  min?: number;
  max?: number;
}

export const PARAMETER_MAPPINGS: ParameterAlias[] = [
  // VITALS
  {
    standardName: 'HR',
    aliases: ['HR', 'HF', 'Herzfrequenz', 'Heart Rate', 'Heart Frequency', 'Puls', 'Pulse'],
    category: 'vitals',
    unit: 'bpm',
    min: 20,
    max: 240
  },
  {
    standardName: 'SpO2',
    aliases: ['SpO2', 'SPO2', 'Sauerstoffsättigung', 'Oxygen Saturation', 'SaO2'],
    category: 'vitals',
    unit: '%',
    min: 50,
    max: 100
  },
  {
    standardName: 'SysBP',
    aliases: ['SYS', 'Systolic', 'Systolisch', 'NIBP Sys', 'ABP Sys'],
    category: 'vitals',
    unit: 'mmHg',
    min: 40,
    max: 250
  },
  {
    standardName: 'DiaBP',
    aliases: ['DIA', 'Diastolic', 'Diastolisch', 'NIBP Dia', 'ABP Dia'],
    category: 'vitals',
    unit: 'mmHg',
    min: 20,
    max: 180
  },
  {
    standardName: 'Temperature',
    aliases: ['Temp', 'T', 'Temperatur', 'Temperature', '°C'],
    category: 'vitals',
    unit: '°C',
    min: 30,
    max: 45
  },
  {
    standardName: 'CVP',
    aliases: ['CVP', 'ZVK', 'Central Venous Pressure', 'Zentralvenöser Druck'],
    category: 'vitals',
    unit: 'mmHg',
    min: 0,
    max: 30
  },

  // VENTILATION PARAMETERS
  {
    standardName: 'RR',
    aliases: ['RR', 'AF', 'Atemfrequenz', 'Respiratory Rate', 'Breathing Rate', 'Freq', 'f'],
    category: 'ventilation',
    unit: '/min',
    min: 4,
    max: 60
  },
  {
    standardName: 'TidalVolume',
    aliases: ['VT', 'VTe', 'VTi', 'Vt', 'Tidalvolumen', 'Tidal Volume', 'TV'],
    category: 'ventilation',
    unit: 'mL',
    min: 50,
    max: 1500
  },
  {
    standardName: 'MinuteVolume',
    aliases: ['MV', 'MVe', 'MVI', 'Minute Volume', 'Minutenvolumen', 'AMV'],
    category: 'ventilation',
    unit: 'L/min',
    min: 0,
    max: 30
  },
  {
    standardName: 'PEEP',
    aliases: ['PEEP', 'Peep', 'Positive End-Expiratory Pressure'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: 0,
    max: 30
  },
  {
    standardName: 'PIP',
    aliases: ['PIP', 'Ppeak', 'Peak Pressure', 'Spitzendruck', 'P max', 'Pmax'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: 0,
    max: 60
  },
  {
    standardName: 'FiO2',
    aliases: ['FiO2', 'FIO2', 'O2', 'Oxygen', 'Sauerstoff'],
    category: 'ventilation',
    unit: '%',
    min: 21,
    max: 100
  },
  {
    standardName: 'EtCO2',
    aliases: ['EtCO2', 'etCO2', 'ETCO2', 'End-tidal CO2', 'CO2'],
    category: 'ventilation',
    unit: 'mmHg',
    min: 0,
    max: 100
  },
  {
    standardName: 'Compliance',
    aliases: ['Compliance', 'C', 'Compliance dyn', 'Cdyn'],
    category: 'ventilation',
    unit: 'mL/cmH2O',
    min: 0,
    max: 200
  },
  {
    standardName: 'Resistance',
    aliases: ['Resistance', 'R', 'Atemwegswiderstand', 'Raw'],
    category: 'ventilation',
    unit: 'cmH2O/L/s',
    min: 0,
    max: 50
  },
  {
    standardName: 'I:E',
    aliases: ['I:E', 'I/E', 'I:E Ratio', 'Inspiratory:Expiratory'],
    category: 'ventilation',
    unit: 'ratio'
  },
  {
    standardName: 'Flow',
    aliases: ['Flow', 'Flowrate', 'L/min'],
    category: 'ventilation',
    unit: 'L/min',
    min: 0,
    max: 120
  },
  {
    standardName: 'Paw',
    aliases: ['Paw', 'PAW', 'Airway Pressure', 'Atemwegsdruck'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: -10,
    max: 60
  },

  // TOF (Train-of-Four)
  {
    standardName: 'TOF_Ratio',
    aliases: ['TOF', 'TOF Ratio', 'Train-of-Four'],
    category: 'tof',
    unit: '%',
    min: 0,
    max: 100
  },
  {
    standardName: 'TOF_Count',
    aliases: ['TOF Count', 'T4/T1'],
    category: 'tof',
    unit: 'count',
    min: 0,
    max: 4
  },

  // PERFUSOR / INFUSION PUMPS
  {
    standardName: 'InfusionRate',
    aliases: ['Rate', 'Infusion Rate', 'Infusionsrate', 'Flow Rate', 'mL/h', 'ml/h'],
    category: 'perfusor',
    unit: 'mL/h',
    min: 0,
    max: 999
  },
  {
    standardName: 'DoseRate',
    aliases: ['Dose', 'Dosierung', 'Dose Rate', 'µg/kg/min', 'mg/h', 'µg/h'],
    category: 'perfusor',
    unit: 'variable',
    min: 0,
    max: 9999
  },
  {
    standardName: 'VTBI',
    aliases: ['VTBI', 'Volume to be Infused', 'Total Volume', 'Gesamtvolumen'],
    category: 'perfusor',
    unit: 'mL',
    min: 0,
    max: 9999
  },
  {
    standardName: 'InfusedVolume',
    aliases: ['Infused', 'Volume Infused', 'Infundiert', 'Given Volume'],
    category: 'perfusor',
    unit: 'mL',
    min: 0,
    max: 9999
  },
  {
    standardName: 'Concentration',
    aliases: ['Concentration', 'Konzentration', 'mg/mL', 'µg/mL'],
    category: 'perfusor',
    unit: 'variable',
    min: 0,
    max: 9999
  },
  {
    standardName: 'DrugName',
    aliases: ['Drug', 'Medication', 'Medikament', 'Medicine', 'Agent'],
    category: 'perfusor',
    unit: 'text'
  },
  {
    standardName: 'PumpStatus',
    aliases: ['Status', 'State', 'Running', 'Stopped', 'Paused'],
    category: 'perfusor',
    unit: 'text'
  }
];

// Helper function to find standard name from any alias
export function findStandardParameter(detectedName: string): ParameterAlias | undefined {
  const normalizedName = detectedName.trim().toLowerCase();
  return PARAMETER_MAPPINGS.find(mapping => 
    mapping.aliases.some(alias => alias.toLowerCase() === normalizedName) ||
    mapping.standardName.toLowerCase() === normalizedName
  );
}

// Helper function to get all parameters for a specific category
export function getParametersByCategory(category: 'vitals' | 'ventilation' | 'tof' | 'perfusor'): ParameterAlias[] {
  return PARAMETER_MAPPINGS.filter(p => p.category === category);
}

// Extract data response structure
export interface MonitorAnalysisResult {
  monitorType: MonitorType;
  detectionMethod: 'fast_ocr' | 'ai_vision';
  confidence: 'high' | 'medium' | 'low';
  parameters: ExtractedParameter[];
  timestamp: number;
}

export interface ExtractedParameter {
  detectedName: string;      // Original name detected in the image
  standardName: string;       // Mapped standard name
  value: number | string;    // Numeric for vitals/ventilation/TOF, string for perfusor drug names/status
  unit: string;
  category: 'vitals' | 'ventilation' | 'tof' | 'perfusor';
  confidence?: number;        // Optional confidence score
}
