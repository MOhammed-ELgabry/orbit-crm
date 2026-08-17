import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook, FaMicrosoft } from "react-icons/fa";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import {
  openSocialAuthPopup,
  type SocialProvider,
} from "../../services/authService";

export default function SocialLogin() {
  const { t } = useTranslation();
  const { login } = useAuth();

  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleSocialLogin = async (provider: SocialProvider) => {
    setError(null);
    setLoadingProvider(provider);

    try {
      const result = await openSocialAuthPopup(provider);

      login(result.accessToken, result.refreshToken, result.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Social authentication failed.",
      );
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 mb-3">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("google")}
          className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <FcGoogle size={20} />

            <span className="text-[#030229] text-sm">{t("google")}</span>
          </div>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("facebook")}
          className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <FaFacebook size={20} className="text-[#385C8E]" />

            <span className="text-[#030229] text-sm">{t("facebook")}</span>
          </div>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("microsoft")}
          className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <FaMicrosoft size={20} className="text-[#5E5E5E]" />

            <span className="text-[#030229] text-sm">{t("microsoft")}</span>
          </div>
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}