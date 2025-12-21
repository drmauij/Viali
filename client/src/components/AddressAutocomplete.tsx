import { ChangeEvent } from 'react';
import { AddressAutofill } from '@mapbox/search-js-react';
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
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const handleStreetChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, street: e.target.value });
  };

  const handlePostalCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, postalCode: e.target.value });
  };

  const handleCityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...values, city: e.target.value });
  };

  const handleRetrieve = (res: any) => {
    const feature = res.features?.[0];
    if (!feature?.properties) return;

    const props = feature.properties;
    const newValues: AddressFormValues = {
      street: props.address_line1 || props.full_address?.split(',')[0] || values.street,
      postalCode: props.postcode || '',
      city: props.address_level2 || props.place || '',
    };
    
    onChange(newValues);
  };

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
      <AddressAutofill
        accessToken={accessToken}
        onRetrieve={handleRetrieve}
        options={{
          language: 'de',
          country: 'CH',
        }}
      >
        <div className="space-y-2">
          {showLabels && <Label htmlFor="address-street">{t('clinic.invoices.street', 'Street, Nr.')}</Label>}
          <Input
            id="address-street"
            name="address"
            placeholder={t('clinic.invoices.street', 'Street, Nr.')}
            value={values.street}
            onChange={handleStreetChange}
            disabled={disabled}
            autoComplete="address-line1"
            data-testid="input-address-street"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              {showLabels && <Label htmlFor="address-postal-code">{t('clinic.invoices.postalCode', 'PLZ')}</Label>}
              <Input
                id="address-postal-code"
                name="postal-code"
                placeholder={t('clinic.invoices.postalCode', 'PLZ')}
                value={values.postalCode}
                onChange={handlePostalCodeChange}
                disabled={disabled}
                autoComplete="postal-code"
                data-testid="input-address-postal-code"
              />
            </div>
            <div className="col-span-2">
              {showLabels && <Label htmlFor="address-city">{t('clinic.invoices.city', 'City')}</Label>}
              <Input
                id="address-city"
                name="city"
                placeholder={t('clinic.invoices.city', 'City')}
                value={values.city}
                onChange={handleCityChange}
                disabled={disabled}
                autoComplete="address-level2"
                data-testid="input-address-city"
              />
            </div>
          </div>
        </div>
      </AddressAutofill>
    </div>
  );
}
