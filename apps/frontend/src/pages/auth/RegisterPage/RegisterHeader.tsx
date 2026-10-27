import OrbitBrand from "../../../Components/ui/OrbitBrand";
import { useTranslation } from "react-i18next";

export default function RegisterHeader() {
  const { t } = useTranslation();

  return (
    <div className="mb-2 flex flex-col items-center gap-0">
      <OrbitBrand variant="auth" />

      <h1 className="font-nunito text-[21px] font-semibold text-ink sm:text-[23px]">
        {t("signUp")}
      </h1>
    </div>
  );
}
