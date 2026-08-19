import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook, FaMicrosoft } from "react-icons/fa";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import {
  openSocialAuthPopup,
  type SocialProvider,
} from "../../services/authService";
import { errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

const socialButtonClass =
  "flex items-center gap-2 rounded-[10px] bg-[#F7F7F8] px-4 py-2 sm:px-5 cursor-pointer transition-all duration-200 hover:bg-[#EFEFF3] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#F7F7F8]";

const Spinner = () => (
  <svg
    className="h-5 w-5 animate-spin text-[#605BFF]"
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export default function SocialLogin() {
  const { t } = useTranslation();
  const { login } = useAuth();

  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(
    null,
  );

  const handleSocialLogin = async (provider: SocialProvider) => {
    setLoadingProvider(provider);

    try {
      const result = await openSocialAuthPopup(provider);

      login(result.accessToken, result.refreshToken, result.user);
    } catch (err) {
      errorAlert({
        title: t("socialLoginFailedTitle"),
        text: getErrorMessage(err, t("genericErrorMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="mb-3 flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("google")}
          className={socialButtonClass}
        >
          {loadingProvider === "google" ? <Spinner /> : <FcGoogle size={20} />}
          <span className="text-sm text-[#030229]">{t("google")}</span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("facebook")}
          className={socialButtonClass}
        >
          {loadingProvider === "facebook" ? (
            <Spinner />
          ) : (
            <FaFacebook size={20} className="text-[#385C8E]" />
          )}
          <span className="text-sm text-[#030229]">{t("facebook")}</span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("microsoft")}
          className={socialButtonClass}
        >
          {loadingProvider === "microsoft" ? (
            <Spinner />
          ) : (
            <FaMicrosoft size={20} className="text-[#5E5E5E]" />
          )}
          <span className="text-sm text-[#030229]">{t("microsoft")}</span>
        </button>
      </div>
    </div>
  );
}