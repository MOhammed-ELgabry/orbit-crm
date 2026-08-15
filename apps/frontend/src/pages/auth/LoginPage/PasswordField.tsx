import { Field, ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";

export default function PasswordField() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor="password"
        className="text-xs font-semibold text-gray-700"
      >
        {t("password")}
      </label>

      <Field
        id="password"
        type="password"
        name="password"
        placeholder={t("enterPassword")}
        className="h-[42px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
      />

      <ErrorMessage
        name="password"
        component="div"
        className="text-xs text-red-500"
      />
    </div>
  );
}