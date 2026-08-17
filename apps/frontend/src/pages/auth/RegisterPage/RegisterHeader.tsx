import logo from "../../../assets/Subtract.png";
import { useTranslation } from "react-i18next";

export default function RegisterHeader() {
  const { t } = useTranslation();

  return (
    <div className="mb-2 flex flex-col items-center gap-0 pt-5">
      <img
        src={logo}
        alt="avatar"
        className="h-[42px] w-[42px] rounded-full object-cover sm:h-[45px] sm:w-[45px]"
      />

      <h1 className="font-nunito text-[21px] font-semibold text-[#030229] sm:text-[23px]">
        {t("signUp")}
      </h1>
    </div>
  );
}
