import { Field, ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function RegisterOptions() {
  const { t } = useTranslation();

  return (
    <>
      {/* Terms & Privacy */}
      <div className="mt-1">
        <div className="flex items-start gap-2">
          <Field
            type="checkbox"
            name="terms"
            id="terms"
            className="mt-0.5 h-3.5 w-3.5 accent-[#8969e8]"
          />

          <label
            htmlFor="terms"
            className="text-[10px] text-gray-500 leading-3.5 cursor-pointer"
          >
            {t("termsText")}
            <span className="text-[#643ed7] font-medium">
              {t("termsOfUse")}
            </span>
            {t("andOur")}
            <span className="text-[#643ed7] font-medium">
              {t("privacyPolicy")}
            </span>
            .
          </label>
        </div>

        {/* Terms Error */}
        <ErrorMessage
          name="terms"
          component="div"
          className="text-[10px] text-red-500 mt-1 ml-5"
        />
      </div>

      {/* Sign In */}
      <p className="text-xs text-gray-500 text-center mt-3">
        {t("alreadyHaveAccount")}{" "}
        <Link
          to="/login"
          className="text-[#643ED7] font-semibold"
        >
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}