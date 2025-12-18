import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Plus, Trash2, Save, X, Search, UserPlus, Pencil, Check, Loader2, Package, Briefcase } from "lucide-react";
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
  gtin: string | null;
  pharmacode: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isShared: boolean;
}

interface InvoiceFormProps {
  hospitalId: string;
  unitId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const invoiceFormSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  customerAddress: z.string().optional(),
  date: z.date(),
  vatRate: z.coerce.number().min(0).max(100).default(2.6),
  comments: z.string().optional(),
  items: z.array(z.object({
    lineType: z.enum(["item", "service"]).default("item"),
    itemId: z.string().optional(),
    serviceId: z.string().optional(),
    description: z.string().min(1, "Description is required"),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().min(0, "Price must be non-negative"),
    taxRate: z.coerce.number().min(0).max(100).default(0),
  })).min(1, "At least one item is required"),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

export default function InvoiceForm({ hospitalId, unitId, onSuccess, onCancel }: InvoiceFormProps) {
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
  
  // Item search state - per item row
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [serviceSearches, setServiceSearches] = useState<Record<number, string>>({});
  const [openItemPopovers, setOpenItemPopovers] = useState<Record<number, boolean>>({});
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [pickerTab, setPickerTab] = useState<"products" | "services">("products");

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
    queryKey: ['/api/clinic', hospitalId, 'items-with-prices', unitId],
    queryFn: async () => {
      const url = unitId 
        ? `/api/clinic/${hospitalId}/items-with-prices?unitId=${unitId}`
        : `/api/clinic/${hospitalId}/items-with-prices`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['/api/clinic', hospitalId, 'services', unitId],
    queryFn: async () => {
      const url = `/api/clinic/${hospitalId}/services?unitId=${unitId}&includeShared=true`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId && !!unitId,
  });
  
  // Filter items based on search for a specific row
  const getFilteredItems = (index: number) => {
    const search = (itemSearches[index] || '').toLowerCase().trim();
    if (!search) return inventoryItems;
    return inventoryItems.filter(item => 
      item.name.toLowerCase().includes(search) ||
      (item.description && item.description.toLowerCase().includes(search)) ||
      (item.gtin && item.gtin.includes(search)) ||
      (item.pharmacode && item.pharmacode.includes(search))
    );
  };

  // Filter services based on search
  const getFilteredServices = (index: number) => {
    const search = (serviceSearches[index] || '').toLowerCase().trim();
    if (!search) return services;
    return services.filter(service => 
      service.name.toLowerCase().includes(search) ||
      (service.description && service.description.toLowerCase().includes(search))
    );
  };

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      patientId: '',
      customerAddress: '',
      date: new Date(),
      vatRate: 2.6, // Fixed VAT rate
      comments: '',
      items: [],
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
      
      // Build customer address from selected patient - always use latest patient data
      let customerAddress = '';
      if (selectedPatient) {
        const addressParts = [];
        if (selectedPatient.street) addressParts.push(selectedPatient.street);
        if (selectedPatient.postalCode || selectedPatient.city) {
          addressParts.push(`${selectedPatient.postalCode || ''} ${selectedPatient.city || ''}`.trim());
        }
        customerAddress = addressParts.join('\n');
      }
      // Fall back to form data if patient has no address but user entered one manually
      if (!customerAddress && data.customerAddress) {
        customerAddress = data.customerAddress;
      }
      
      console.log('Creating invoice with customerAddress:', customerAddress, 'from patient:', selectedPatient);
      
      await apiRequest('POST', `/api/clinic/${hospitalId}/invoices`, {
        ...data,
        vatRate: 2.6, // Always use fixed VAT rate
        customerName,
        customerAddress: customerAddress || null,
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

  const FIXED_VAT_RATE = 2.6; // Fixed VAT rate
  
  // Use useWatch for proper reactivity when item fields change
  const watchedItems = useWatch({
    control: form.control,
    name: "items",
    defaultValue: [],
  });

  // Calculate totals - recomputes whenever watchedItems changes
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    
    (watchedItems || []).forEach(item => {
      const lineSubtotal = (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0);
      const lineTaxRate = Number(item?.taxRate) || 0;
      const lineTax = lineSubtotal * (lineTaxRate / 100);
      subtotal += lineSubtotal;
      taxAmount += lineTax;
    });
    
    const total = subtotal + taxAmount;
    return { subtotal, vatAmount: taxAmount, total };
  }, [watchedItems]);

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
    // Build and set the customer address from patient data
    const addressParts = [];
    if (patient.street) addressParts.push(patient.street);
    if (patient.postalCode || patient.city) {
      addressParts.push(`${patient.postalCode || ''} ${patient.city || ''}`.trim());
    }
    form.setValue("customerAddress", addressParts.join('\n'));
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
      
      // Update the customerAddress form field as well
      const addressParts = [];
      if (addressForm.street) addressParts.push(addressForm.street);
      if (addressForm.postalCode || addressForm.city) {
        addressParts.push(`${addressForm.postalCode || ''} ${addressForm.city || ''}`.trim());
      }
      form.setValue("customerAddress", addressParts.join('\n'));
      
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
                                firstName: patientSearch.split(' ').slice(1).join(' ') || '', 
                                surname: patientSearch.split(' ')[0] || '',
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
          <FormLabel className="mb-2 block">{t('clinic.invoices.lineItems')}</FormLabel>
          
          {/* Search dropdown with tabs for Products and Services */}
          <Popover 
            open={openItemPopovers[0] || false} 
            onOpenChange={(open) => setOpenItemPopovers(prev => ({ ...prev, [0]: open }))}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start font-normal mb-3"
                data-testid="button-add-item"
              >
                <Plus className="h-4 w-4 mr-2" />
                <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-muted-foreground">{t('clinic.invoices.searchAndAddItem', 'Search and add item or service...')}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full min-w-[380px] p-0" align="start">
              <Tabs value={pickerTab} onValueChange={(v) => setPickerTab(v as "products" | "services")} className="w-full">
                <TabsList className="w-full grid grid-cols-2 rounded-none border-b">
                  <TabsTrigger value="products" className="flex items-center gap-2" data-testid="tab-products">
                    <Package className="h-4 w-4" />
                    {t('clinic.invoices.products', 'Products')}
                  </TabsTrigger>
                  <TabsTrigger value="services" className="flex items-center gap-2" data-testid="tab-services">
                    <Briefcase className="h-4 w-4" />
                    {t('clinic.invoices.services', 'Services')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="products" className="m-0">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder={t('clinic.invoices.searchItem', 'Search product...')}
                      value={itemSearches[0] || ''}
                      onValueChange={(value) => setItemSearches(prev => ({ ...prev, [0]: value }))}
                      data-testid="input-item-search"
                    />
                    <CommandList>
                      <CommandEmpty>
                        {t('clinic.invoices.noItemFound', 'No product found')}
                      </CommandEmpty>
                      <CommandGroup>
                        {getFilteredItems(0).map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onSelect={() => {
                              append({
                                lineType: "item",
                                itemId: item.id,
                                description: item.name,
                                quantity: 1,
                                unitPrice: item.patientPrice ? parseFloat(item.patientPrice) : 0,
                                taxRate: 2.6,
                              });
                              setOpenItemPopovers(prev => ({ ...prev, [0]: false }));
                              setItemSearches(prev => ({ ...prev, [0]: '' }));
                            }}
                            data-testid={`item-option-${item.id}`}
                          >
                            <div className="flex flex-col">
                              <span>{item.name} {item.patientPrice && `(CHF ${item.patientPrice})`}</span>
                              {(item.pharmacode || item.gtin) && (
                                <span className="text-xs text-muted-foreground">
                                  {[item.pharmacode && `PC: ${item.pharmacode}`, item.gtin && `GTIN: ${item.gtin}`].filter(Boolean).join(' | ')}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </TabsContent>
                <TabsContent value="services" className="m-0">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder={t('clinic.invoices.searchService', 'Search service...')}
                      value={serviceSearches[0] || ''}
                      onValueChange={(value) => setServiceSearches(prev => ({ ...prev, [0]: value }))}
                      data-testid="input-service-search"
                    />
                    <CommandList>
                      <CommandEmpty>
                        {t('clinic.invoices.noServiceFound', 'No service found')}
                      </CommandEmpty>
                      <CommandGroup>
                        {getFilteredServices(0).map((service) => (
                          <CommandItem
                            key={service.id}
                            value={service.id}
                            onSelect={() => {
                              append({
                                lineType: "service",
                                serviceId: service.id,
                                description: service.name,
                                quantity: 1,
                                unitPrice: parseFloat(service.price),
                                taxRate: 0,
                              });
                              setOpenItemPopovers(prev => ({ ...prev, [0]: false }));
                              setServiceSearches(prev => ({ ...prev, [0]: '' }));
                            }}
                            data-testid={`service-option-${service.id}`}
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span>{service.name}</span>
                                <span className="text-primary font-medium">CHF {service.price}</span>
                                {service.isShared && (
                                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t('clinic.services.shared', 'Shared')}</span>
                                )}
                              </div>
                              {service.description && (
                                <span className="text-xs text-muted-foreground">{service.description}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>

          {/* List of added items */}
          {fields.length > 0 && (
            <div className="space-y-2">
              {fields.map((field, index) => {
                const lineType = form.watch(`items.${index}.lineType`);
                const isService = lineType === "service";
                const item = inventoryItems.find(i => i.id === form.watch(`items.${index}.itemId`));
                const taxRate = Number(form.watch(`items.${index}.taxRate`)) || 0;
                return (
                  <Card key={field.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {/* Item name with type indicator */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate" data-testid={`item-name-${index}`}>
                              {form.watch(`items.${index}.description`) || t('clinic.invoices.customItem', 'Custom item')}
                            </div>
                            {isService ? (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {t('clinic.invoices.service', 'Service')}
                              </span>
                            ) : (
                              <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {t('clinic.invoices.product', 'Product')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {item?.patientPrice && (
                              <span>CHF {item.patientPrice} / {t('clinic.invoices.unit', 'unit')}</span>
                            )}
                            <span className={taxRate > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {taxRate > 0 ? `+${taxRate}% ${t('clinic.invoices.vat', 'VAT')}` : t('clinic.invoices.taxExempt', 'Tax-exempt')}
                            </span>
                          </div>
                        </div>
                        
                        {/* Quantity input */}
                        <div className="flex items-center gap-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <Input 
                                    type="number"
                                    min="1"
                                    {...field}
                                    className="w-16 h-8 text-center"
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        {/* Line total */}
                        <div className="w-24 text-right font-medium" data-testid={`item-total-${index}`}>
                          CHF {((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.unitPrice || 0)).toFixed(2)}
                        </div>
                        
                        {/* Remove button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-item-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          
          {fields.length === 0 && (
            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
              {t('clinic.invoices.noItemsYet', 'No items added yet. Use the search above to add items.')}
            </div>
          )}
        </div>

        {/* Totals section - per-line tax calculation */}
        <div className="flex justify-end">
          <div className="space-y-1 text-right">
            <div className="text-sm text-muted-foreground">
              {t('clinic.invoices.subtotal')}: CHF {totals.subtotal.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('clinic.invoices.taxTotal', 'Tax total')}: CHF {totals.vatAmount.toFixed(2)}
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
              <Label>{t('clinic.invoices.surname', 'Surname')} *</Label>
              <Input
                value={quickCreateForm.surname}
                onChange={(e) => setQuickCreateForm({ ...quickCreateForm, surname: e.target.value })}
                placeholder={t('clinic.invoices.surname', 'Surname')}
                data-testid="input-quick-create-surname"
                autoFocus
              />
            </div>
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
