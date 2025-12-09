import { useState, useMemo } from "react";
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
import { CalendarIcon, Plus, Trash2, Save, X } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Patient {
  id: string;
  firstName: string;
  surname: string;
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
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().optional(),
  patientId: z.string().optional(),
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

  const { data: patients = [] } = useQuery<Patient[]>({
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
      customerName: '',
      customerAddress: '',
      patientId: '',
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
      await apiRequest('POST', `/api/clinic/${hospitalId}/invoices`, {
        ...data,
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

  const handlePatientSelect = (patientId: string) => {
    form.setValue("patientId", patientId);
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
      form.setValue("customerName", `${patient.firstName} ${patient.surname}`);
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="patientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('clinic.invoices.patient')}</FormLabel>
                <Select value={field.value} onValueChange={handlePatientSelect}>
                  <FormControl>
                    <SelectTrigger data-testid="select-patient">
                      <SelectValue placeholder={t('clinic.invoices.selectPatient')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {patients.map(patient => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.firstName} {patient.surname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

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
        </div>

        <FormField
          control={form.control}
          name="customerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('clinic.invoices.customerName')} *</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-customer-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="customerAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('clinic.invoices.customerAddress')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} data-testid="input-customer-address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
    </Form>
  );
}
