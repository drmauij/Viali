import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Building, Save } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const companyDataSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyStreet: z.string().optional(),
  companyPostalCode: z.string().optional(),
  companyCity: z.string().optional(),
  companyPhone: z.string().optional(),
  companyFax: z.string().optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  companyLogoUrl: z.string().optional(),
});

type CompanyData = z.infer<typeof companyDataSchema>;

export default function ClinicCompanySettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;
  const isAdmin = activeHospital?.role === 'admin';

  const { data: companyData, isLoading } = useQuery<CompanyData>({
    queryKey: ['/api/clinic', hospitalId, 'company-data'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/company-data`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch company data');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const form = useForm<CompanyData>({
    resolver: zodResolver(companyDataSchema),
    defaultValues: {
      companyName: '',
      companyStreet: '',
      companyPostalCode: '',
      companyCity: '',
      companyPhone: '',
      companyFax: '',
      companyEmail: '',
      companyLogoUrl: '',
    },
    values: companyData,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CompanyData) => {
      await apiRequest('PATCH', `/api/clinic/${hospitalId}/company-data`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'company-data'] });
      toast({
        title: t('clinic.settings.saved'),
        description: t('clinic.settings.savedDescription'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('clinic.settings.saveError'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanyData) => {
    saveMutation.mutate(data);
  };

  if (!hospitalId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.noHospitalSelected')}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t('clinic.settings.adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold" data-testid="page-title-clinic-settings">
        {t('clinic.settings.title')}
      </h1>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              {t('clinic.settings.companyData')}
            </CardTitle>
            <CardDescription>
              {t('clinic.settings.companyDataDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('clinic.settings.companyName')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyStreet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('clinic.settings.street')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} data-testid="input-company-street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyPostalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clinic.settings.postalCode')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} data-testid="input-company-postal" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clinic.settings.city')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} data-testid="input-company-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clinic.settings.phone')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} data-testid="input-company-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyFax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clinic.settings.fax')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ''} data-testid="input-company-fax" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="companyEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('clinic.settings.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value || ''} data-testid="input-company-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyLogoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('clinic.settings.logoUrl')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} placeholder="https://..." data-testid="input-company-logo" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  data-testid="button-save-company"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
