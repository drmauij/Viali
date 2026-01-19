import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "./input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

export interface CountryCode {
  code: string;
  name: string;
  prefix: string;
  flag: string;
}

export const EUROPEAN_COUNTRIES: CountryCode[] = [
  { code: "CH", name: "Switzerland", prefix: "+41", flag: "🇨🇭" },
  { code: "DE", name: "Germany", prefix: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", prefix: "+33", flag: "🇫🇷" },
  { code: "IT", name: "Italy", prefix: "+39", flag: "🇮🇹" },
  { code: "AT", name: "Austria", prefix: "+43", flag: "🇦🇹" },
  { code: "GB", name: "United Kingdom", prefix: "+44", flag: "🇬🇧" },
  { code: "ES", name: "Spain", prefix: "+34", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", prefix: "+31", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", prefix: "+32", flag: "🇧🇪" },
  { code: "PT", name: "Portugal", prefix: "+351", flag: "🇵🇹" },
  { code: "PL", name: "Poland", prefix: "+48", flag: "🇵🇱" },
  { code: "SE", name: "Sweden", prefix: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norway", prefix: "+47", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", prefix: "+45", flag: "🇩🇰" },
  { code: "FI", name: "Finland", prefix: "+358", flag: "🇫🇮" },
  { code: "IE", name: "Ireland", prefix: "+353", flag: "🇮🇪" },
  { code: "GR", name: "Greece", prefix: "+30", flag: "🇬🇷" },
  { code: "CZ", name: "Czech Republic", prefix: "+420", flag: "🇨🇿" },
  { code: "HU", name: "Hungary", prefix: "+36", flag: "🇭🇺" },
  { code: "RO", name: "Romania", prefix: "+40", flag: "🇷🇴" },
  { code: "LU", name: "Luxembourg", prefix: "+352", flag: "🇱🇺" },
  { code: "LI", name: "Liechtenstein", prefix: "+423", flag: "🇱🇮" },
];

export function parsePhoneNumber(fullNumber: string): { countryCode: string; localNumber: string; unknownPrefix?: string } {
  if (!fullNumber) {
    return { countryCode: "CH", localNumber: "" };
  }
  
  const trimmed = fullNumber.trim();
  
  for (const country of EUROPEAN_COUNTRIES) {
    if (trimmed.startsWith(country.prefix)) {
      let localNumber = trimmed.slice(country.prefix.length).trim();
      if (localNumber.startsWith(" ")) {
        localNumber = localNumber.trim();
      }
      return { countryCode: country.code, localNumber };
    }
  }
  
  if (trimmed.startsWith("+")) {
    const match = trimmed.match(/^(\+\d{1,4})\s*(.*)$/);
    if (match) {
      return { countryCode: "OTHER", localNumber: match[2], unknownPrefix: match[1] };
    }
  }
  
  let localNumber = trimmed;
  if (localNumber.startsWith("0")) {
    localNumber = localNumber.slice(1);
  }
  return { countryCode: "CH", localNumber };
}

export function formatPhoneNumber(countryCode: string, localNumber: string, unknownPrefix?: string): string {
  if (countryCode === "OTHER" && unknownPrefix) {
    return `${unknownPrefix} ${localNumber}`.trim();
  }
  
  const country = EUROPEAN_COUNTRIES.find(c => c.code === countryCode);
  if (!country) return localNumber;
  
  let cleaned = localNumber.replace(/^0+/, "").trim();
  if (!cleaned) return "";
  
  return `${country.prefix} ${cleaned}`;
}

interface PhoneInputWithCountryProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  id?: string;
}

const PhoneInputWithCountry = React.forwardRef<HTMLInputElement, PhoneInputWithCountryProps>(
  ({ value = "", onChange, placeholder, disabled, className, "data-testid": testId, id }, ref) => {
    const parsed = React.useMemo(() => parsePhoneNumber(value), [value]);
    const [selectedCountry, setSelectedCountry] = React.useState(parsed.countryCode);
    const [phoneNumber, setPhoneNumber] = React.useState(parsed.localNumber);
    const [unknownPrefix, setUnknownPrefix] = React.useState(parsed.unknownPrefix);

    React.useEffect(() => {
      const newParsed = parsePhoneNumber(value);
      setSelectedCountry(newParsed.countryCode);
      setPhoneNumber(newParsed.localNumber);
      setUnknownPrefix(newParsed.unknownPrefix);
    }, [value]);

    const handleCountryChange = (newCountryCode: string) => {
      setSelectedCountry(newCountryCode);
      setUnknownPrefix(undefined);
      const formatted = formatPhoneNumber(newCountryCode, phoneNumber);
      onChange?.(formatted);
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newNumber = e.target.value;
      setPhoneNumber(newNumber);
      if (unknownPrefix) {
        onChange?.(`${unknownPrefix} ${newNumber}`.trim());
      } else {
        const formatted = formatPhoneNumber(selectedCountry, newNumber);
        onChange?.(formatted);
      }
    };

    const selectedCountryData = unknownPrefix 
      ? { code: "OTHER", name: "Other", prefix: unknownPrefix, flag: "🌍" }
      : (EUROPEAN_COUNTRIES.find(c => c.code === selectedCountry) || EUROPEAN_COUNTRIES[0]);

    return (
      <div className={cn("flex gap-1", className)}>
        <Select
          value={selectedCountry}
          onValueChange={handleCountryChange}
          disabled={disabled}
        >
          <SelectTrigger 
            className="w-[100px] flex-shrink-0"
            data-testid={testId ? `${testId}-country` : undefined}
          >
            <SelectValue>
              <span className="flex items-center gap-1">
                <span>{selectedCountryData.flag}</span>
                <span className="text-xs">{selectedCountryData.prefix}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EUROPEAN_COUNTRIES.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                <span className="flex items-center gap-2">
                  <span>{country.flag}</span>
                  <span className="text-xs font-medium">{country.prefix}</span>
                  <span className="text-xs text-muted-foreground">{country.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={ref}
          id={id}
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder={placeholder || "Phone number"}
          disabled={disabled}
          className="flex-1"
          data-testid={testId}
        />
      </div>
    );
  }
);

PhoneInputWithCountry.displayName = "PhoneInputWithCountry";

export { PhoneInputWithCountry };
