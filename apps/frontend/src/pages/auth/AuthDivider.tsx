import { useTranslation } from "react-i18next";

export default function AuthDivider() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full items-center gap-2 mb-4">
      <span className="h-px flex-1 bg-[#adadb6]" />

      <span className="text-[#030229] text-sm">{t("or")}</span>

      <span className="h-px flex-1 bg-[#adadb6]" />
    </div>
  );
}
