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
    aliases: ['SYS', 'Sys', 'Systolic', 'Systolisch', 'NIBP Sys', 'ABP Sys', 'BP Sys', 'Systol', 'S', 'ART Sys', 'Art sys'],
    category: 'vitals',
    unit: 'mmHg',
    min: 40,
    max: 250
  },
  {
    standardName: 'DiaBP',
    aliases: ['DIA', 'Dia', 'Diastolic', 'Diastolisch', 'NIBP Dia', 'ABP Dia', 'BP Dia', 'Diastol', 'D', 'ART Dia', 'Art dia'],
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
    aliases: ['CVP', 'ZVK', 'ZVD', 'Central Venous Pressure', 'Zentralvenöser Druck', 'Zentraler Venendruck'],
    category: 'vitals',
    unit: 'mmHg',
    min: 0,
    max: 30
  },
  {
    standardName: 'ART',
    aliases: ['ART', 'IBP', 'Invasive BP', 'Arterieller Druck', 'Arterial Pressure', 'A-Line'],
    category: 'vitals',
    unit: 'mmHg',
    min: 40,
    max: 200
  },
  {
    standardName: 'RR_Vitals',
    aliases: ['AFi', 'AF (vitals)', 'RR (vitals)', 'Atemfrequenz (vitals)'],
    category: 'vitals',
    unit: '/min',
    min: 4,
    max: 60
  },
  {
    standardName: 'MAP',
    aliases: ['MAP', 'MAD', 'Mean', 'Mean Arterial Pressure', 'Mittlerer arterieller Druck', 'MBP'],
    category: 'vitals',
    unit: 'mmHg',
    min: 30,
    max: 180
  },
  {
    standardName: 'PI',
    aliases: ['PI', 'Perfusion Index', 'Perfusionsindex', 'PI%'],
    category: 'vitals',
    unit: '%',
    min: 0,
    max: 20
  },
  {
    standardName: 'ST',
    aliases: ['ST', 'ST Segment', 'ST-Hebung', 'ST-Senkung', 'ST II', 'ST V'],
    category: 'vitals',
    unit: 'mm',
    min: -10,
    max: 10
  },
  {
    standardName: 'EKG',
    aliases: ['EKG', 'ECG', 'Elektrokardiogramm', 'Electrocardiogram'],
    category: 'vitals',
    unit: 'mV'
  },
  {
    standardName: 'Resp',
    aliases: ['Resp', 'RF', 'RF(Imped.)', 'Impedance Resp', 'Resp Rate'],
    category: 'vitals',
    unit: '/min',
    min: 4,
    max: 60
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
    aliases: ['FiO2', 'FIO2', 'O2', 'Oxygen', 'Sauerstoff', 'O2%', 'O2 %', 'O2 Insp', 'O2Insp', 'Insp O2', 'InspO2', 'Fi O2', 'Inspired O2', 'O2 Inspired'],
    category: 'ventilation',
    unit: '%',
    min: 21,
    max: 100
  },
  {
    standardName: 'EtCO2',
    aliases: ['EtCO2', 'etCO2', 'ETCO2', 'End-tidal CO2', 'CO2', 'CO2 Exp', 'CO2 exp', 'CO2Exp', 'Exp', 'Et CO2', 'endtidal CO2'],
    category: 'ventilation',
    unit: 'mmHg',
    min: 0,
    max: 100
  },
  {
    standardName: 'Compliance',
    aliases: ['Compliance', 'C', 'Compliance dyn', 'Cdyn', 'C dyn', 'Dynamic Compliance', 'Cstat', 'Static Compliance', 'ml/mbar', 'mL/cmH2O'],
    category: 'ventilation',
    unit: 'mL/cmH2O',
    min: 0,
    max: 200
  },
  {
    standardName: 'Resistance',
    aliases: ['Resistance', 'R', 'Resist', 'Resist.', 'Atemwegswiderstand', 'Raw', 'mbar/l/s', 'cmH2O/L/s', 'Airway Resistance'],
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
    aliases: ['Flow', 'Flowrate', 'L/min', 'Fluss', 'Gas Flow', 'Gasfluss'],
    category: 'ventilation',
    unit: 'L/min',
    min: 0,
    max: 120
  },
  {
    standardName: 'Paw',
    aliases: ['Paw', 'PAW', 'Pmean', 'P mean', 'Mean Airway Pressure', 'Atemwegsdruck', 'Mittlerer Atemwegsdruck'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: -10,
    max: 60
  },
  {
    standardName: 'Pinsp',
    aliases: ['Pinsp', 'P insp', 'Inspiratory Pressure', 'Inspirationsdruck', 'P Insp'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: 0,
    max: 60
  },
  {
    standardName: 'Pplateau',
    aliases: ['Pplateau', 'Plateau', 'P Plateau', 'Plateau Pressure', 'Plat', 'P plat'],
    category: 'ventilation',
    unit: 'cmH2O',
    min: 0,
    max: 50
  },
  {
    standardName: 'TInsp',
    aliases: ['TInsp', 'T Insp', 'Ti', 'Inspiratory Time', 'Inspirationszeit', 'I-Time'],
    category: 'ventilation',
    unit: 's',
    min: 0.2,
    max: 5
  },
  {
    standardName: 'TExp',
    aliases: ['TExp', 'T Exp', 'Te', 'Expiratory Time', 'Exspirationszeit', 'E-Time'],
    category: 'ventilation',
    unit: 's',
    min: 0.5,
    max: 10
  },
  {
    standardName: 'Trigger',
    aliases: ['Trigger', 'Trig', 'Trigger Sensitivity', 'Flow Trigger', 'Pressure Trigger'],
    category: 'ventilation',
    unit: 'L/min',
    min: 0,
    max: 20
  },
  {
    standardName: 'MAC',
    aliases: ['MAC', 'Minimum Alveolar Concentration', 'MAC Age', 'Et MAC', 'Fi MAC'],
    category: 'ventilation',
    unit: '',
    min: 0,
    max: 3
  },
  {
    standardName: 'InspCO2',
    aliases: ['Insp CO2', 'InspCO2', 'FiCO2', 'Inspired CO2', 'Insp.'],
    category: 'ventilation',
    unit: 'mmHg',
    min: 0,
    max: 10
  },
  {
    standardName: 'ExpCO2',
    aliases: ['Exp CO2', 'ExpCO2', 'Exp.', 'Expired CO2', 'CO2 Expired'],
    category: 'ventilation',
    unit: 'mmHg',
    min: 0,
    max: 80
  },
  {
    standardName: 'InspO2',
    aliases: ['Insp O2', 'InspO2', 'FiO2 measured', 'Inspired O2', 'O2 Inspired'],
    category: 'ventilation',
    unit: '%',
    min: 21,
    max: 100
  },
  {
    standardName: 'ExpO2',
    aliases: ['Exp O2', 'ExpO2', 'FeO2', 'Expired O2', 'O2 Exp', 'O2Exp', 'O2 Expired'],
    category: 'ventilation',
    unit: '%',
    min: 15,
    max: 100
  },
  {
    standardName: 'O2Consumption',
    aliases: ['O2 Effektiv', 'O2 Consumption', 'VO2', 'O2 Verbrauch'],
    category: 'ventilation',
    unit: 'mL/min',
    min: 0,
    max: 1000
  },
  {
    standardName: 'AirPressure',
    aliases: ['Air', 'Air Pressure', 'Compressed Air', 'Druckluft'],
    category: 'ventilation',
    unit: 'kPa',
    min: 0,
    max: 10
  },
  {
    standardName: 'O2Pressure',
    aliases: ['O2 Pressure', 'O2 Supply', 'Sauerstoffdruck'],
    category: 'ventilation',
    unit: 'kPa',
    min: 0,
    max: 10
  },
  {
    standardName: 'VentMode',
    aliases: ['Mode', 'Vent Mode', 'Ventilation Mode', 'S-IMV', 'PC-BIPAP', 'SIMV', 'PCV', 'PSV', 'MAN/SPONT', 'IMV'],
    category: 'ventilation',
    unit: 'text'
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
