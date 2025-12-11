import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarIcon, Plus, Trash2, Save, X, Search, UserPlus, Pencil, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Patient {
  id: string;
  firstName: string;
  surname: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  patientPrice: string | null;
}

interface InvoiceFormProps {
  hospitalId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const invoiceFormSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  customerAddress: z.string().optional(),
  date: z.date(),
  vatRate: z.coerce.number().min(0).max(100).default(7.7),
  comments: z.string().optional(),
  items: z.array(z.object({
    itemId: z.string().optional(),
    description: z.string().min(1, "Description is required"),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().min(0, "Price must be non-negative"),
  })).min(1, "At least one item is required"),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

export default function InvoiceForm({ hospitalId, onSuccess, onCancel }: InvoiceFormProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  const [patientSearch, setPatientSearch] = useState("");
  const [isPatientPopoverOpen, setIsPatientPopoverOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState({ firstName: "", surname: "", birthday: undefined as Date | undefined });
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [isBirthdayPopoverOpen, setIsBirthdayPopoverOpen] = useState(false);
  
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({ street: "", postalCode: "", city: "" });
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  const { data: patients = [], refetch: refetchPatients } = useQuery<Patient[]>({
    queryKey: ['/api/patients', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/patients?hospitalId=${hospitalId}`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/clinic', hospitalId, 'items-with-prices'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/items-with-prices`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      patientId: '',
      customerAddress: '',
      date: new Date(),
      vatRate: 7.7,
      comments: '',
      items: [{ itemId: '', description: '', quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const createMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const customerName = selectedPatient 
        ? `${selectedPatient.firstName} ${selectedPatient.surname}` 
        : '';
      await apiRequest('POST', `/api/clinic/${hospitalId}/invoices`, {
        ...data,
        customerName,
        patientId: data.patientId || null,
      });
    },
    onSuccess: () => {
      toast({
        title: t('clinic.invoices.created'),
        description: t('clinic.invoices.createdDescription'),
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.createError'),
        variant: "destructive",
      });
    },
  });

  const watchedItems = form.watch("items");
  const watchedVatRate = form.watch("vatRate");

  const totals = useMemo(() => {
    const subtotal = watchedItems.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unitPrice || 0);
    }, 0);
    const vatAmount = subtotal * (watchedVatRate / 100);
    const total = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  }, [watchedItems, watchedVatRate]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const search = patientSearch.toLowerCase();
    return patients.filter(p => 
      p.firstName.toLowerCase().includes(search) || 
      p.surname.toLowerCase().includes(search)
    );
  }, [patients, patientSearch]);

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    form.setValue("patientId", patient.id);
    setAddressForm({
      street: patient.street || "",
      postalCode: patient.postalCode || "",
      city: patient.city || "",
    });
    setIsPatientPopoverOpen(false);
    setPatientSearch("");
  };

  const handleQuickCreate = async () => {
    if (!quickCreateForm.firstName.trim() || !quickCreateForm.surname.trim()) {
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.patientNameRequired', 'First name and surname are required'),
        variant: "destructive",
      });
      return;
    }

    if (!quickCreateForm.birthday) {
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.birthdayRequired', 'Birthday is required'),
        variant: "destructive",
      });
      return;
    }

    setIsCreatingPatient(true);
    try {
      const response = await apiRequest('POST', '/api/patients', {
        hospitalId,
        firstName: quickCreateForm.firstName.trim(),
        surname: quickCreateForm.surname.trim(),
        birthday: format(quickCreateForm.birthday, 'yyyy-MM-dd'),
        sex: 'O',
      });
      
      const newPatient = await response.json() as Patient;
      await refetchPatients();
      
      handlePatientSelect(newPatient);
      setIsQuickCreateOpen(false);
      setQuickCreateForm({ firstName: "", surname: "", birthday: undefined });
      
      toast({
        title: t('clinic.invoices.patientCreated', 'Patient created'),
        description: t('clinic.invoices.patientCreatedDesc', 'New patient has been created and selected'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('clinic.invoices.patientCreateError', 'Failed to create patient'),
        variant: "destructive",
      });
    } finally {
      setIsCreatingPatient(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!selectedPatient) return;
    
    setIsSavingAddress(true);
    try {
      await apiRequest('PATCH', `/api/patients/${selectedPatient.id}`, {
        street: addressForm.street || null,
        postalCode: addressForm.postalCode || null,
        city: addressForm.city || null,
      });
      
      setSelectedPatient({
        ...selectedPatient,
        street: addressForm.street,
        postalCode: addressForm.postalCode,
        city: addressForm.city,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setEditingAddress(false);
      
      toast({
        title: t('clinic.invoices.addressSaved', 'Address saved'),
        description: t('clinic.invoices.addressSavedDesc', 'Patient address has been updated'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('clinic.invoices.addressSaveError', 'Failed to save address'),
        variant: "destructive",
      });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleItemSelect = (index: number, itemId: string) => {
    const item = inventoryItems.find(i => i.id === itemId);
    if (item) {
      form.setValue(`items.${index}.itemId`, itemId);
      form.setValue(`items.${index}.description`, item.name);
      if (item.patientPrice) {
        form.setValue(`items.${index}.unitPrice`, parseFloat(item.patientPrice));
      }
    }
  };

  const onSubmit = (data: InvoiceFormData) => {
    createMutation.mutate(data);
  };

  const hasAddressData = addressForm.street || addressForm.postalCode || addressForm.city;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Date - full width on top */}
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('clinic.invoices.date')}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                      data-testid="button-date-picker"
                    >
                      {field.value ? (
                        format(field.value, "PP", { locale: dateLocale })
                      ) : (
                        <span>{t('common.pickDate')}</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    locale={dateLocale}
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Patient Selection - own row with search */}
        <FormField
          control={form.control}
          name="patientId"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('clinic.invoices.patient')} *</FormLabel>
              <Popover open={isPatientPopoverOpen} onOpenChange={setIsPatientPopoverOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !selectedPatient && "text-muted-foreground"
                      )}
                      data-testid="select-patient"
                    >
                      {selectedPatient ? (
                        `${selectedPatient.firstName} ${selectedPatient.surname}`
                      ) : (
                        <span className="flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          {t('clinic.invoices.searchPatient', 'Search patient...')}
                        </span>
                      )}
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder={t('clinic.invoices.searchPatient', 'Search patient...')}
                      value={patientSearch}
                      onValueChange={setPatientSearch}
                      data-testid="input-patient-search"
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="p-2 text-center">
                          <p className="text-sm text-muted-foreground mb-2">
                            {t('clinic.invoices.noPatientFound', 'No patient found')}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setQuickCreateForm({ 
                                firstName: patientSearch.split(' ')[0] || '', 
                                surname: patientSearch.split(' ').slice(1).join(' ') || '',
                                birthday: undefined
                              });
                              setIsQuickCreateOpen(true);
                              setIsPatientPopoverOpen(false);
                            }}
                            data-testid="button-quick-create-patient"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {t('clinic.invoices.createNewPatient', 'Create new patient')}
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredPatients.map((patient) => (
                          <CommandItem
                            key={patient.id}
                            value={`${patient.firstName} ${patient.surname}`}
                            onSelect={() => handlePatientSelect(patient)}
                            data-testid={`patient-option-${patient.id}`}
                          >
                            {patient.firstName} {patient.surname}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Patient Address Preview - shown when patient is selected */}
        {selectedPatient && (
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('clinic.invoices.invoiceAddress', 'Invoice Address')}
                </span>
                {!editingAddress ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingAddress(true)}
                    data-testid="button-edit-address"
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {t('common.edit')}
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddressForm({
                          street: selectedPatient.street || "",
                          postalCode: selectedPatient.postalCode || "",
                          city: selectedPatient.city || "",
                        });
                        setEditingAddress(false);
                      }}
                      data-testid="button-cancel-address"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveAddress}
                      disabled={isSavingAddress}
                      data-testid="button-save-address"
                    >
                      {isSavingAddress ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {editingAddress ? (
                <div className="space-y-2">
                  <Input
                    placeholder={t('clinic.invoices.street', 'Street, Nr.')}
                    value={addressForm.street}
                    onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                    data-testid="input-address-street"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder={t('clinic.invoices.postalCode', 'PLZ')}
                      value={addressForm.postalCode}
                      onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                      data-testid="input-address-postal-code"
                    />
                    <Input
                      className="col-span-2"
                      placeholder={t('clinic.invoices.city', 'City')}
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      data-testid="input-address-city"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  {hasAddressData ? (
                    <>
                      {addressForm.street && <div>{addressForm.street}</div>}
                      {(addressForm.postalCode || addressForm.city) && (
                        <div>{[addressForm.postalCode, addressForm.city].filter(Boolean).join(' ')}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">
                      {t('clinic.invoices.noAddressData', 'No address data - click Edit to add')}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <FormLabel>{t('clinic.invoices.lineItems')}</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ itemId: '', description: '', quantity: 1, unitPrice: 0 })}
              data-testid="button-add-item"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('clinic.invoices.addItem')}
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <Card key={field.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Select
                      value={form.watch(`items.${index}.itemId`) || ''}
                      onValueChange={(value) => handleItemSelect(index, value)}
                    >
                      <SelectTrigger className="flex-1" data-testid={`select-item-${index}`}>
                        <SelectValue placeholder={t('clinic.invoices.selectItem')} />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} {item.patientPrice && `(CHF ${item.patientPrice})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name={`items.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder={t('clinic.invoices.description')}
                            data-testid={`input-description-${index}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              type="number"
                              min="1"
                              {...field}
                              placeholder={t('clinic.invoices.quantity')}
                              data-testid={`input-quantity-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`items.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              type="number"
                              step="0.01"
                              min="0"
                              {...field}
                              placeholder={t('clinic.invoices.unitPrice')}
                              data-testid={`input-unitprice-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-end font-medium">
                      CHF {((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.unitPrice || 0)).toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="vatRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('clinic.invoices.vatRate')} (%)</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    {...field}
                    data-testid="input-vat-rate"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-1 text-right">
            <div className="text-sm text-muted-foreground">
              {t('clinic.invoices.subtotal')}: CHF {totals.subtotal.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('clinic.invoices.vat')} ({watchedVatRate}%): CHF {totals.vatAmount.toFixed(2)}
            </div>
            <div className="text-lg font-bold">
              {t('clinic.invoices.total')}: CHF {totals.total.toFixed(2)}
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="comments"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('clinic.invoices.comments')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} data-testid="input-comments" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
            <X className="h-4 w-4 mr-2" />
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-invoice-submit">
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isPending ? t('common.saving') : t('clinic.invoices.create')}
          </Button>
        </div>
      </form>

      {/* Quick Create Patient Dialog */}
      <Dialog open={isQuickCreateOpen} onOpenChange={setIsQuickCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clinic.invoices.createNewPatient', 'Create New Patient')}</DialogTitle>
            <DialogDescription>
              {t('clinic.invoices.quickCreateDescription', 'Enter basic patient information. You can add more details later.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('clinic.invoices.firstName', 'First Name')} *</Label>
              <Input
                value={quickCreateForm.firstName}
                onChange={(e) => setQuickCreateForm({ ...quickCreateForm, firstName: e.target.value })}
                placeholder={t('clinic.invoices.firstName', 'First Name')}
                data-testid="input-quick-create-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('clinic.invoices.surname', 'Surname')} *</Label>
              <Input
                value={quickCreateForm.surname}
                onChange={(e) => setQuickCreateForm({ ...quickCreateForm, surname: e.target.value })}
                placeholder={t('clinic.invoices.surname', 'Surname')}
                data-testid="input-quick-create-surname"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('clinic.invoices.birthday', 'Birthday')} *</Label>
              <Popover open={isBirthdayPopoverOpen} onOpenChange={setIsBirthdayPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !quickCreateForm.birthday && "text-muted-foreground"
                    )}
                    data-testid="button-quick-create-birthday"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {quickCreateForm.birthday ? (
                      format(quickCreateForm.birthday, "PP", { locale: dateLocale })
                    ) : (
                      <span>{t('common.pickDate', 'Pick a date')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={quickCreateForm.birthday}
                    onSelect={(date) => {
                      setQuickCreateForm({ ...quickCreateForm, birthday: date });
                      setIsBirthdayPopoverOpen(false);
                    }}
                    locale={dateLocale}
                    defaultMonth={quickCreateForm.birthday || new Date(2000, 0)}
                    captionLayout="dropdown"
                    fromYear={1900}
                    toYear={new Date().getFullYear()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsQuickCreateOpen(false)}
              data-testid="button-cancel-quick-create"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="button" 
              onClick={handleQuickCreate}
              disabled={isCreatingPatient}
              data-testid="button-confirm-quick-create"
            >
              {isCreatingPatient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('clinic.invoices.createAndSelect', 'Create & Select')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
