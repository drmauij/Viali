import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, FileText, Camera, Upload, CreditCard, Baby, Car, User } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CameraCapture } from "@/components/CameraCapture";
import { useToast } from "@/hooks/use-toast";

export type StammblattData = {
  firstName: string;
  lastName: string;
  profession: string;
  address: string;
  city: string;
  zip: string;
  dateOfBirth: string;
  maritalStatus: string;
  nationality: string;
  religion: string;
  mobile: string;
  ahvNumber: string;
  hasChildBenefits: boolean;
  numberOfChildren: number;
  childBenefitsRecipient: string;
  childBenefitsRegistration: string;
  hasResidencePermit: boolean;
  residencePermitType: string;
  residencePermitValidUntil: string;
  residencePermitFrontImage: string;
  residencePermitBackImage: string;
  bankName: string;
  bankAddress: string;
  bankAccount: string;
  hasOwnVehicle: boolean;
};

export interface StammblattFormProps {
  initialData: StammblattData;
  onSave: (data: StammblattData) => Promise<void>;
  /** Upload a permit image file/blob and return the storage key */
  uploadPermitImage: (side: "front" | "back", file: File | Blob) => Promise<string>;
  /** Fetch a signed download URL for an already-stored permit image */
  loadPermitImageUrl: (side: "front" | "back") => Promise<string | null>;
  /** Whether to show the prefilled-from-contract hint */
  showPrefillHint?: boolean;
}

export function StammblattForm({
  initialData,
  onSave,
  uploadPermitImage,
  loadPermitImageUrl,
  showPrefillHint = false,
}: StammblattFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [data, setData] = useState<StammblattData>(initialData);
  const [saving, setSaving] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState<"front" | "back" | null>(null);
  const [uploadingPermitImage, setUploadingPermitImage] = useState<"front" | "back" | null>(null);
  const [permitImageUrls, setPermitImageUrls] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });

  const permitFrontInputRef = useRef<HTMLInputElement>(null);
  const permitBackInputRef = useRef<HTMLInputElement>(null);

  // Sync when parent refreshes initialData (e.g. after data is fetched)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Load permit image preview URLs when storage keys are present
  useEffect(() => {
    if (data.residencePermitFrontImage) {
      loadPermitImageUrl("front").then((url) => {
        if (url) setPermitImageUrls((prev) => ({ ...prev, front: url }));
      });
    }
    if (data.residencePermitBackImage) {
      loadPermitImageUrl("back").then((url) => {
        if (url) setPermitImageUrls((prev) => ({ ...prev, back: url }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.residencePermitFrontImage, data.residencePermitBackImage]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      toast({
        title: t("common.saved"),
        description: t("externalWorklog.personalData.saveSuccess"),
      });
    } catch {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: t("externalWorklog.personalData.saveError"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPermitImage = async (side: "front" | "back", file: File | Blob) => {
    setUploadingPermitImage(side);
    try {
      const storageKey = await uploadPermitImage(side, file);
      setData((prev) => ({
        ...prev,
        [side === "front" ? "residencePermitFrontImage" : "residencePermitBackImage"]: storageKey,
      }));
      toast({
        title: t("common.saved"),
        description: t("externalWorklog.personalData.permitImageSaved"),
      });
      const url = await loadPermitImageUrl(side);
      if (url) setPermitImageUrls((prev) => ({ ...prev, [side]: url }));
    } catch {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: t("externalWorklog.personalData.permitImageError"),
        variant: "destructive",
      });
    } finally {
      setUploadingPermitImage(null);
    }
  };

  const handleCameraCapture = async (photo: string) => {
    if (!showCameraCapture) return;
    const side = showCameraCapture;
    setShowCameraCapture(null);
    const response = await fetch(photo);
    const blob = await response.blob();
    await handleUploadPermitImage(side, blob);
  };

  const handleFileUpload = async (side: "front" | "back", event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleUploadPermitImage(side, file);
  };

  return (
    <>
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 dark:text-gray-100">
            <User className="w-5 h-5" />
            {t("externalWorklog.personalData.title")}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t("externalWorklog.personalData.description")}
            {showPrefillHint && (
              <span className="block mt-1 text-blue-600 dark:text-blue-400">
                {t("externalWorklog.personalData.prefilled")}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section: Personalien */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600">
              {t("externalWorklog.personalData.sections.personal")}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.firstName")}</label>
                <Input
                  value={data.firstName}
                  onChange={(e) => setData({ ...data, firstName: e.target.value })}
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  data-testid="input-personal-firstname"
                />
              </div>
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.lastName")}</label>
                <Input
                  value={data.lastName}
                  onChange={(e) => setData({ ...data, lastName: e.target.value })}
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  data-testid="input-personal-lastname"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.profession")}</label>
              <Input
                value={data.profession}
                onChange={(e) => setData({ ...data, profession: e.target.value })}
                className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder={t("externalWorklog.personalData.professionPlaceholder")}
                data-testid="input-personal-profession"
              />
            </div>

            {/* Address Autocomplete */}
            <div>
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.address")}</label>
              <AddressAutocomplete
                values={{
                  street: data.address,
                  postalCode: data.zip,
                  city: data.city,
                }}
                onChange={(values) =>
                  setData({
                    ...data,
                    address: values.street,
                    zip: values.postalCode,
                    city: values.city,
                  })
                }
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.dateOfBirth")}</label>
                <DateInput
                  value={data.dateOfBirth}
                  onChange={(v) => setData({ ...data, dateOfBirth: v })}
                  data-testid="input-personal-dob"
                />
              </div>
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.maritalStatus")}</label>
                <Select
                  value={data.maritalStatus}
                  onValueChange={(value) => setData({ ...data, maritalStatus: value })}
                >
                  <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-marital-status">
                    <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">{t("externalWorklog.personalData.maritalOptions.single")}</SelectItem>
                    <SelectItem value="married">{t("externalWorklog.personalData.maritalOptions.married")}</SelectItem>
                    <SelectItem value="divorced">{t("externalWorklog.personalData.maritalOptions.divorced")}</SelectItem>
                    <SelectItem value="widowed">{t("externalWorklog.personalData.maritalOptions.widowed")}</SelectItem>
                    <SelectItem value="separated">{t("externalWorklog.personalData.maritalOptions.separated")}</SelectItem>
                    <SelectItem value="registered_partnership">{t("externalWorklog.personalData.maritalOptions.registeredPartnership")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.nationality")}</label>
                <Select
                  value={data.nationality}
                  onValueChange={(value) => setData({ ...data, nationality: value })}
                >
                  <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-nationality">
                    <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CH">{t("externalWorklog.personalData.nationalities.CH")}</SelectItem>
                    <SelectItem value="DE">{t("externalWorklog.personalData.nationalities.DE")}</SelectItem>
                    <SelectItem value="AT">{t("externalWorklog.personalData.nationalities.AT")}</SelectItem>
                    <SelectItem value="FR">{t("externalWorklog.personalData.nationalities.FR")}</SelectItem>
                    <SelectItem value="IT">{t("externalWorklog.personalData.nationalities.IT")}</SelectItem>
                    <SelectItem value="OTHER">{t("externalWorklog.personalData.nationalities.OTHER")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.religion")}</label>
                <Select
                  value={data.religion}
                  onValueChange={(value) => setData({ ...data, religion: value })}
                >
                  <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-religion">
                    <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("externalWorklog.personalData.religions.none")}</SelectItem>
                    <SelectItem value="roman_catholic">{t("externalWorklog.personalData.religions.romanCatholic")}</SelectItem>
                    <SelectItem value="protestant">{t("externalWorklog.personalData.religions.protestant")}</SelectItem>
                    <SelectItem value="other">{t("externalWorklog.personalData.religions.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.mobile")}</label>
                <Input
                  type="tel"
                  value={data.mobile}
                  onChange={(e) => setData({ ...data, mobile: e.target.value })}
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  placeholder="+41 79 123 45 67"
                  data-testid="input-personal-mobile"
                />
              </div>
              <div>
                <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.ahvNumber")}</label>
                <Input
                  value={data.ahvNumber}
                  onChange={(e) => setData({ ...data, ahvNumber: e.target.value })}
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  placeholder="756.1234.5678.90"
                  data-testid="input-personal-ahv"
                />
              </div>
            </div>
          </div>

          {/* Section: Kinderzulagen */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
              <Baby className="w-4 h-4" />
              {t("externalWorklog.personalData.sections.childBenefits")}
            </h3>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasChildBenefits")}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasChildBenefits === true}
                    onChange={() => setData({ ...data, hasChildBenefits: true })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasChildBenefits === false}
                    onChange={() => setData({ ...data, hasChildBenefits: false })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                </label>
              </div>
            </div>

            {data.hasChildBenefits && (
              <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.numberOfChildren")}</label>
                    <Input
                      type="number"
                      min="0"
                      value={data.numberOfChildren || ""}
                      onChange={(e) => setData({ ...data, numberOfChildren: parseInt(e.target.value) || 0 })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      data-testid="input-personal-children"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.childBenefitsRecipient")}</label>
                    <Input
                      value={data.childBenefitsRecipient}
                      onChange={(e) => setData({ ...data, childBenefitsRecipient: e.target.value })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      data-testid="input-personal-benefits-recipient"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.childBenefitsRegistration")}</label>
                  <Input
                    value={data.childBenefitsRegistration}
                    onChange={(e) => setData({ ...data, childBenefitsRegistration: e.target.value })}
                    className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    data-testid="input-personal-benefits-registration"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Aufenthaltsbewilligung */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t("externalWorklog.personalData.sections.residencePermit")}
            </h3>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasResidencePermit")}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasResidencePermit === true}
                    onChange={() => setData({ ...data, hasResidencePermit: true })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasResidencePermit === false}
                    onChange={() => setData({ ...data, hasResidencePermit: false })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                </label>
              </div>
            </div>

            {data.hasResidencePermit && (
              <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.residencePermitType")}</label>
                    <Select
                      value={data.residencePermitType}
                      onValueChange={(value) => setData({ ...data, residencePermitType: value })}
                    >
                      <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-permit-type">
                        <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L">{t("externalWorklog.personalData.permitTypes.L")}</SelectItem>
                        <SelectItem value="B">{t("externalWorklog.personalData.permitTypes.B")}</SelectItem>
                        <SelectItem value="C">{t("externalWorklog.personalData.permitTypes.C")}</SelectItem>
                        <SelectItem value="G">{t("externalWorklog.personalData.permitTypes.G")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.residencePermitValidUntil")}</label>
                    <DateInput
                      value={data.residencePermitValidUntil}
                      onChange={(v) => setData({ ...data, residencePermitValidUntil: v })}
                      data-testid="input-permit-valid-until"
                    />
                  </div>
                </div>

                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-700 dark:text-yellow-400">
                  {t("externalWorklog.personalData.permitCopyRequired")}
                </div>

                {/* Permit Front Image */}
                <div className="space-y-2">
                  <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.permitFront")}</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCameraCapture("front")}
                      disabled={uploadingPermitImage === "front"}
                      data-testid="button-camera-front"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {t("externalWorklog.personalData.takePhoto")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => permitFrontInputRef.current?.click()}
                      disabled={uploadingPermitImage === "front"}
                      data-testid="button-upload-front"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {t("externalWorklog.personalData.uploadFile")}
                    </Button>
                    <input
                      ref={permitFrontInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload("front", e)}
                    />
                    {uploadingPermitImage === "front" && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  {permitImageUrls.front && (
                    <div className="mt-2">
                      <img src={permitImageUrls.front} alt="Permit Front" className="max-w-xs rounded border" />
                    </div>
                  )}
                  {data.residencePermitFrontImage && !permitImageUrls.front && (
                    <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {t("externalWorklog.personalData.imageUploaded")}
                    </div>
                  )}
                </div>

                {/* Permit Back Image */}
                <div className="space-y-2">
                  <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.permitBack")}</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCameraCapture("back")}
                      disabled={uploadingPermitImage === "back"}
                      data-testid="button-camera-back"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {t("externalWorklog.personalData.takePhoto")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => permitBackInputRef.current?.click()}
                      disabled={uploadingPermitImage === "back"}
                      data-testid="button-upload-back"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {t("externalWorklog.personalData.uploadFile")}
                    </Button>
                    <input
                      ref={permitBackInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload("back", e)}
                    />
                    {uploadingPermitImage === "back" && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  {permitImageUrls.back && (
                    <div className="mt-2">
                      <img src={permitImageUrls.back} alt="Permit Back" className="max-w-xs rounded border" />
                    </div>
                  )}
                  {data.residencePermitBackImage && !permitImageUrls.back && (
                    <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {t("externalWorklog.personalData.imageUploaded")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section: Bankangaben */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {t("externalWorklog.personalData.sections.bankDetails")}
            </h3>

            <div>
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankName")}</label>
              <Input
                value={data.bankName}
                onChange={(e) => setData({ ...data, bankName: e.target.value })}
                className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder={t("externalWorklog.personalData.bankNamePlaceholder")}
                data-testid="input-personal-bank-name"
              />
            </div>

            <div>
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankAddress")}</label>
              <Input
                value={data.bankAddress}
                onChange={(e) => setData({ ...data, bankAddress: e.target.value })}
                className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder={t("externalWorklog.personalData.bankAddressPlaceholder")}
                data-testid="input-personal-bank-address"
              />
            </div>

            <div>
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankAccount")}</label>
              <Input
                value={data.bankAccount}
                onChange={(e) => setData({ ...data, bankAccount: e.target.value })}
                className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder={t("externalWorklog.personalData.bankAccountPlaceholder")}
                data-testid="input-personal-bank"
              />
            </div>
          </div>

          {/* Section: Mobilität */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
              <Car className="w-4 h-4" />
              {t("externalWorklog.personalData.sections.mobility")}
            </h3>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasOwnVehicle")}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasOwnVehicle === true}
                    onChange={() => setData({ ...data, hasOwnVehicle: true })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={data.hasOwnVehicle === false}
                    onChange={() => setData({ ...data, hasOwnVehicle: false })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                </label>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
            data-testid="button-save-personal"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("externalWorklog.personalData.saving")}
              </>
            ) : (
              t("externalWorklog.personalData.save")
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Camera Capture Modal */}
      <CameraCapture
        isOpen={showCameraCapture !== null}
        onClose={() => setShowCameraCapture(null)}
        onCapture={handleCameraCapture}
        fullFrame={true}
        hint={
          showCameraCapture === "front"
            ? t("externalWorklog.personalData.permitFrontHint")
            : t("externalWorklog.personalData.permitBackHint")
        }
      />
    </>
  );
}
