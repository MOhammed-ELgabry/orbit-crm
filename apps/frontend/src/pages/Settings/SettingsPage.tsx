import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import { updateCompany, type UpdateCompanyInput } from "../../services/companyService";
import { BUSINESS_TYPE_COPY } from "../../config/businessType";
import { successAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import type { BusinessType } from "../../services/authService";

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none disabled:opacity-60";
const labelClass = "text-xs font-semibold text-gray-700";

const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  medical_clinics: "medicalClinics",
  real_estate: "realEstate",
  auto_spare_parts: "autoSpareParts",
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, company, refetchCompany } = useAuth();
  const isOwner = user?.isOwner ?? false;

  const [form, setForm] = useState<UpdateCompanyInput>({
    name: company?.name ?? "",
    contactEmail: company?.contactEmail ?? "",
    phone: company?.phone ?? "",
    address: company?.address ?? "",
    website: company?.website ?? "",
    businessType:
      (company?.businessType as BusinessType | undefined) ?? undefined,
  });
  const [isSaving, setIsSaving] = useState(false);

  if (!company) {
    return (
      <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
    );
  }

  const set = <K extends keyof UpdateCompanyInput>(
    key: K,
    value: UpdateCompanyInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isOwner || isSaving) return;

    setIsSaving(true);
    try {
      const cleaned: UpdateCompanyInput = {};
      (Object.keys(form) as (keyof UpdateCompanyInput)[]).forEach((key) => {
        const value = form[key];
        if (typeof value === "string" && value.trim().length > 0) {
          (cleaned as unknown as Record<string, unknown>)[key] = value.trim();
        } else if (key === "businessType" && value) {
          cleaned.businessType = value as BusinessType;
        }
      });

      await updateCompany(company.id, cleaned);
      await refetchCompany();

      successAlert({
        title: t("settingsSaved"),
      });
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("companySettingsTitle")}
        </h2>

        {!isOwner && (
          <p className="mt-1 text-xs text-amber-600">{t("ownerOnlyNotice")}</p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <fieldset disabled={!isOwner} className="contents">
            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("companyNameLabel")}</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <label className={labelClass}>{t("contactEmailLabel")}</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className={labelClass}>{t("phone")}</label>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("addressLabel")}</label>
              <input
                className={inputClass}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("websiteLabel")}</label>
              <input
                className={inputClass}
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("businessTypeLabel")}</label>
              <select
                className={inputClass}
                value={form.businessType ?? ""}
                onChange={(e) => set("businessType", e.target.value as BusinessType)}
              >
                {(Object.keys(BUSINESS_TYPE_COPY) as BusinessType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(BUSINESS_TYPE_LABEL[type])}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {isOwner && (
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-[#605BFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
              >
                {t("saveChanges")}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
