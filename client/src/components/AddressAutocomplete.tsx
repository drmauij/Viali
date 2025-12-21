import { useState, useCallback, ChangeEvent } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

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

export default function AddressAutocomplete({
  values,
  onChange,
  disabled = false,
  className = '',
  showLabels = false,
}: AddressAutocompleteProps) {
  const { t } = useTranslation();
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string;
  const [searchValue, setSearchValue] = useState(values.street || '');

  const handleStreetChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, street: e.target.value });
  };

  const handlePostalCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, postalCode: e.target.value });
  };

  const handleCityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, city: e.target.value });
  };

  const handleSearchChange = useCallback((newValue: string) => {
    setSearchValue(newValue);
    // Also update the street field as user types
    onChange({ ...values, street: newValue });
  }, [onChange, values]);

  const handleRetrieve = useCallback((res: any) => {
    console.log('Mapbox retrieve result:', res);
    const feature = res.features?.[0];
    if (!feature?.properties) return;

    const props = feature.properties;
    const context = props.context || {};
    
    let street = '';
    let postalCode = '';
    let city = '';
    
    // Extract street address
    if (props.address) {
      street = `${props.address} ${props.name || ''}`.trim();
    } else if (props.name) {
      street = props.name;
    } else if (props.full_address) {
      street = props.full_address.split(',')[0] || '';
    }
    
    // Extract postal code
    if (context.postcode) {
      postalCode = context.postcode.name || '';
    }
    
    // Extract city
    if (context.place) {
      city = context.place.name || '';
    } else if (context.locality) {
      city = context.locality.name || '';
    }
    
    onChange({
      street: street || values.street,
      postalCode: postalCode || values.postalCode,
      city: city || values.city,
    });
    
    setSearchValue(street);
  }, [onChange, values]);

  const handleSuggestError = useCallback((error: Error) => {
    console.error('Mapbox suggest error:', error);
  }, []);

  const handleSuggest = useCallback((res: any) => {
    console.log('Mapbox suggestions:', res);
  }, []);

  // Fallback if no access token
  if (!accessToken) {
    return (
      <div className={`space-y-2 ${className}`}>
        {showLabels && <Label>{t('clinic.invoices.street', 'Street, Nr.')}</Label>}
        <Input
          placeholder={t('clinic.invoices.street', 'Street, Nr.')}
          value={values.street}
          onChange={handleStreetChange}
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
      <div className="mapbox-search-container" data-testid="input-address-street">
        <SearchBox
          accessToken={accessToken}
          value={searchValue}
          onChange={handleSearchChange}
          onRetrieve={handleRetrieve}
          onSuggest={handleSuggest}
          onSuggestError={handleSuggestError}
          options={{
            language: 'de',
            country: 'CH',
            types: 'address',
          }}
          placeholder={t('clinic.invoices.street', 'Street, Nr.')}
          theme={{
            variables: {
              fontFamily: 'inherit',
              unit: '14px',
              padding: '0.5em',
              borderRadius: '6px',
              boxShadow: 'none',
            },
          }}
        />
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
