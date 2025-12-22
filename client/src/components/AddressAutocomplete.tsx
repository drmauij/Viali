import { useState, useCallback, useRef, useEffect, ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';

interface AddressFormValues {
  street: string;
  postalCode: string;
  city: string;
}

interface AddressAutocompleteProps {
  values: AddressFormValues;
  onChange: (values: AddressFormValues) => void;
  disabled?: boolean;
  className?: string;
  showLabels?: boolean;
}

interface Suggestion {
  mapbox_id: string;
  name: string;
  full_address?: string;
  place_formatted?: string;
  context?: {
    postcode?: { name: string };
    place?: { name: string };
    locality?: { name: string };
    address?: { 
      name?: string;
      address_number?: string;
      street_name?: string;
    };
  };
}

export default function AddressAutocomplete({
  values,
  onChange,
  disabled = false,
  className = '',
  showLabels = false,
}: AddressAutocompleteProps) {
  const { t } = useTranslation();
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string;
  const [inputValue, setInputValue] = useState(values.street || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions from Mapbox
  const fetchSuggestions = useCallback(async (query: string) => {
    if (!accessToken || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        access_token: accessToken,
        language: 'de',
        country: 'CH',
        types: 'address,street',
        session_token: sessionToken,
        limit: '5',
      });

      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`
      );
      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Mapbox suggest error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, sessionToken]);

  // Retrieve full address details when user selects
  const retrieveAddress = useCallback(async (suggestion: Suggestion) => {
    if (!accessToken) return;

    try {
      const params = new URLSearchParams({
        access_token: accessToken,
        session_token: sessionToken,
      });

      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?${params}`
      );
      const data = await response.json();
      const feature = data.features?.[0];
      
      if (feature?.properties) {
        const props = feature.properties;
        const context = props.context || {};
        
        let street = props.name || props.address || '';
        let postalCode = context.postcode?.name || '';
        let city = context.place?.name || context.locality?.name || '';

        onChange({
          street,
          postalCode,
          city,
        });
        setInputValue(street);
      }
    } catch (error) {
      console.error('Mapbox retrieve error:', error);
      // Fallback to suggestion data
      const context = suggestion.context || {};
      onChange({
        street: suggestion.name || '',
        postalCode: context.postcode?.name || '',
        city: context.place?.name || context.locality?.name || '',
      });
      setInputValue(suggestion.name || '');
    }

    setShowSuggestions(false);
    // Generate new session token for next search
    setSessionToken(crypto.randomUUID());
  }, [accessToken, sessionToken, onChange]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    onChange({ ...values, street: value });
    fetchSuggestions(value);
  }, [onChange, values, fetchSuggestions]);

  const handleSuggestionClick = useCallback((suggestion: Suggestion) => {
    retrieveAddress(suggestion);
  }, [retrieveAddress]);

  const handlePostalCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, postalCode: e.target.value });
  };

  const handleCityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, city: e.target.value });
  };

  const clearInput = () => {
    setInputValue('');
    onChange({ ...values, street: '' });
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // Fallback if no access token
  if (!accessToken) {
    return (
      <div className={`space-y-2 ${className}`}>
        {showLabels && <Label>{t('clinic.invoices.street', 'Street, Nr.')}</Label>}
        <Input
          placeholder={t('clinic.invoices.street', 'Street, Nr.')}
          value={values.street}
          onChange={(e) => onChange({ ...values, street: e.target.value })}
          disabled={disabled}
          data-testid="input-address-street"
        />
        <div className="grid grid-cols-3 gap-2">
          <div>
            {showLabels && <Label>{t('clinic.invoices.postalCode', 'PLZ')}</Label>}
            <Input
              placeholder={t('clinic.invoices.postalCode', 'PLZ')}
              value={values.postalCode}
              onChange={handlePostalCodeChange}
              disabled={disabled}
              data-testid="input-address-postal-code"
            />
          </div>
          <div className="col-span-2">
            {showLabels && <Label>{t('clinic.invoices.city', 'City')}</Label>}
            <Input
              placeholder={t('clinic.invoices.city', 'City')}
              value={values.city}
              onChange={handleCityChange}
              disabled={disabled}
              data-testid="input-address-city"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {showLabels && <Label>{t('clinic.invoices.street', 'Street, Nr.')}</Label>}
      <div className="relative">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder={t('clinic.invoices.street', 'Street, Nr.')}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            disabled={disabled}
            className="pl-9 pr-9"
            data-testid="input-address-street"
          />
          {inputValue && (
            <button
              type="button"
              onClick={clearInput}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.mapbox_id || index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none transition-colors"
              >
                <div className="font-medium text-foreground">{suggestion.name}</div>
                <div className="text-sm text-muted-foreground">
                  {suggestion.place_formatted || suggestion.full_address}
                </div>
              </button>
            ))}
          </div>
        )}
        
        {isLoading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <div>
          {showLabels && <Label>{t('clinic.invoices.postalCode', 'PLZ')}</Label>}
          <Input
            placeholder={t('clinic.invoices.postalCode', 'PLZ')}
            value={values.postalCode}
            onChange={handlePostalCodeChange}
            disabled={disabled}
            data-testid="input-address-postal-code"
          />
        </div>
        <div className="col-span-2">
          {showLabels && <Label>{t('clinic.invoices.city', 'City')}</Label>}
          <Input
            placeholder={t('clinic.invoices.city', 'City')}
            value={values.city}
            onChange={handleCityChange}
            disabled={disabled}
            data-testid="input-address-city"
          />
        </div>
      </div>
    </div>
  );
}
