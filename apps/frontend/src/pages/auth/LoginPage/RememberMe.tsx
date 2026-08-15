import { Field } from "formik";
import { useTranslation } from "react-i18next";

export default function RememberMe() {
  const { t } = useTranslation();

  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2">
      <Field
        type="checkbox"
        name="rememberMe"
        className="h-3.5 w-3.5 shrink-0 accent-[#605BFF]"
      />

      <span className="whitespace-nowrap text-xs text-gray-500">
        {t("rememberMe")}
      </span>
    </label>
  );
}
