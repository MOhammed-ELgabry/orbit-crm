
import logo from "../../../assets/Subtract.png";
import { useTranslation } from "react-i18next";

export default function LoginHeader() {
  const { t } = useTranslation();

  return (
    <div className="mb-4 flex flex-col items-center gap-1">
      <img
        src={logo}
        alt="logo"
        className="h-[50px] w-[50px] object-contain sm:h-[55px] sm:w-[55px]"
      />

      <h1 className="font-nunito text-[22px] font-semibold text-[#030229] sm:text-[25px]">
        {t("login")}
      </h1>
    </div>
  );
}
