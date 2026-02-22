import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import type { Locale } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { Loader2, PenLine } from "lucide-react";

interface WorklogFormData {
  firstName: string;
  lastName: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  activityType: "anesthesia_nurse" | "op_nurse" | "springer_nurse" | "anesthesia_doctor" | "other";
  notes?: string;
  workerSignature: string;
}

interface WorklogEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<WorklogFormData>;
  onSubmit: (data: WorklogFormData) => void;
  isSubmitting: boolean;
  onOpenSignaturePad: () => void;
  workHours: string;
  dateLocale: Locale;
}

export default function WorklogEntryDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isSubmitting,
  onOpenSignaturePad,
  workHours,
}: WorklogEntryDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSubmitting) onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">
            {t("externalWorklog.recordTime")}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {t("externalWorklog.fillAllFields")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-gray-200">{t("externalWorklog.firstName")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-gray-200">{t("externalWorklog.lastName")}</FormLabel>
                    <FormControl>
                      <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="workDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-200">{t("externalWorklog.workDate")}</FormLabel>
                  <FormControl>
                    <DateInput value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="timeStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-gray-200">{t("externalWorklog.from")}</FormLabel>
                    <FormControl>
                      <TimeInput value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timeEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-gray-200">{t("externalWorklog.to")}</FormLabel>
                    <FormControl>
                      <TimeInput value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pauseMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-gray-200">{t("externalWorklog.breakMinutes")}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="activityType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-200">{t("externalWorklog.activityType")} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                        <SelectValue placeholder={t("externalWorklog.activityTypeRequired")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="anesthesia_nurse">{t("externalWorklog.activityTypes.anesthesia_nurse")}</SelectItem>
                      <SelectItem value="op_nurse">{t("externalWorklog.activityTypes.op_nurse")}</SelectItem>
                      <SelectItem value="springer_nurse">{t("externalWorklog.activityTypes.springer_nurse")}</SelectItem>
                      <SelectItem value="anesthesia_doctor">{t("externalWorklog.activityTypes.anesthesia_doctor")}</SelectItem>
                      <SelectItem value="other">{t("externalWorklog.activityTypes.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t("externalWorklog.netWorkTime")}: </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">{workHours}</span>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-200">{t("externalWorklog.notesOptional")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("externalWorklog.notesPlaceholder")}
                      {...field}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="dark:bg-gray-700" />

            <FormField
              control={form.control}
              name="workerSignature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-200">{t("externalWorklog.signature")}</FormLabel>
                  <FormControl>
                    <div>
                      {field.value ? (
                        <div className="border dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-700">
                          <img
                            src={field.value}
                            alt={t("externalWorklog.signature")}
                            className="h-20 mx-auto"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200"
                            onClick={onOpenSignaturePad}
                          >
                            {t("externalWorklog.changeSignature")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                          onClick={onOpenSignaturePad}
                        >
                          <PenLine className="w-4 h-4 mr-2" />
                          {t("externalWorklog.addSignature")}
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("externalWorklog.cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("externalWorklog.submitting")}
                  </>
                ) : (
                  t("externalWorklog.submit")
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
