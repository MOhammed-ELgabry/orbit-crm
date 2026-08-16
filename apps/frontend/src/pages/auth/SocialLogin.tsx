import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { useTranslation } from "react-i18next";

export default function SocialLogin() {
  const { t } = useTranslation();

  return (
    <div className="flex gap-3 mb-3">
      <button type="button" className="bg-[#F7F7F8] px-5 py-2 rounded-[10px]">
        <div className="flex items-center gap-2">
          <FcGoogle size={20} />

          <span className="text-[#030229] text-sm">{t("google")}</span>
        </div>
      </button>

      <button type="button" className="bg-[#F7F7F8] px-5 py-2 rounded-[10px]">
        <div className="flex items-center gap-2">
          <FaFacebook size={20} className="text-[#385C8E]" />

          <span className="text-[#030229] text-sm">{t("facebook")}</span>
        </div>
      </button>
    </div>
  );
}
