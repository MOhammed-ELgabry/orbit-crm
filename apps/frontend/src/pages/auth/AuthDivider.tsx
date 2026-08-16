import { useTranslation } from "react-i18next";

export default function AuthDivider() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full items-center gap-2 sm:gap-3 mb-4">
      <span className="h-px flex-1 bg-[#adadb6]" />

      <span className="text-[#030229] text-xs sm:text-sm whitespace-nowrap">
        {t("or")}
      </span>

      <span className="h-px flex-1 bg-[#adadb6]" />
    </div>
  );
}
