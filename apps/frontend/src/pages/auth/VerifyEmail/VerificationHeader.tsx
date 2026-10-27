import OrbitBrand from "../../../Components/ui/OrbitBrand";
import { useTranslation } from "react-i18next";
import { LuMail } from "react-icons/lu";

export default function VerificationHeader() {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col items-center mb-5">
        <OrbitBrand variant="auth" />

        <h1 className="font-nunito font-semibold text-[22px] sm:text-[25px] text-ink mt-1 text-center">
          {t("verifyYourEmail")}
        </h1>
      </div>

      <div className="w-[60px] h-[60px] sm:w-[70px] sm:h-[70px] rounded-full bg-brand-50 flex items-center justify-center mb-5">
        <LuMail size={24} className="text-brand-600 sm:w-[28px] sm:h-[28px]" />
      </div>
    </>
  );
}
