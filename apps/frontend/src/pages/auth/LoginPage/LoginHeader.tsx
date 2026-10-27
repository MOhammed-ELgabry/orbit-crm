import OrbitBrand from "../../../Components/ui/OrbitBrand";
import { useTranslation } from "react-i18next";

export default function LoginHeader() {
  const { t } = useTranslation();

  return (
    <div className="mb-4 flex flex-col items-center gap-1">
      <OrbitBrand variant="auth" />

      <h1 className="font-nunito text-[22px] font-semibold text-ink sm:text-[25px]">
        {t("login")}
      </h1>
    </div>
  );
}
