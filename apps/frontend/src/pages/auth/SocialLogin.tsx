// import { useState } from "react";
// import { FcGoogle } from "react-icons/fc";
// import { FaFacebook, FaMicrosoft } from "react-icons/fa";
// import { useTranslation } from "react-i18next";

// import { useAuth } from "../../context/AuthContext";
// import {
//   openSocialAuthPopup,
//   type SocialProvider,
// } from "../../services/authService";

// export default function SocialLogin() {
//   const { t } = useTranslation();
//   const { login } = useAuth();

//   const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(
//     null,
//   );
//   const [error, setError] = useState<string | null>(null);

//   const handleSocialLogin = async (provider: SocialProvider) => {
//     setError(null);
//     setLoadingProvider(provider);

//     try {
//       const result = await openSocialAuthPopup(provider);

//       login(result.accessToken, result.refreshToken, result.user);
//     } catch (err) {
//       setError(
//         err instanceof Error ? err.message : "Social authentication failed.",
//       );
//     } finally {
//       setLoadingProvider(null);
//     }
//   };

//   return (
//     <div className="flex flex-col items-center gap-2 mb-3">
//       <div className="flex gap-3">
//         <button
//           type="button"
//           disabled={loadingProvider !== null}
//           onClick={() => handleSocialLogin("google")}
//           className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
//         >
//           <div className="flex items-center gap-2">
//             <FcGoogle size={20} />

//             <span className="text-[#030229] text-sm">{t("google")}</span>
//           </div>
//         </button>

//         <button
//           type="button"
//           disabled={loadingProvider !== null}
//           onClick={() => handleSocialLogin("facebook")}
//           className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
//         >
//           <div className="flex items-center gap-2">
//             <FaFacebook size={20} className="text-[#385C8E]" />

//             <span className="text-[#030229] text-sm">{t("facebook")}</span>
//           </div>
//         </button>

//         <button
//           type="button"
//           disabled={loadingProvider !== null}
//           onClick={() => handleSocialLogin("microsoft")}
//           className="bg-[#F7F7F8] px-5 py-2 rounded-[10px] disabled:opacity-60"
//         >
//           <div className="flex items-center gap-2">
//             <FaMicrosoft size={20} className="text-[#5E5E5E]" />

//             <span className="text-[#030229] text-sm">{t("microsoft")}</span>
//           </div>
//         </button>
//       </div>

//       {error && <p className="text-xs text-red-500">{error}</p>}
//     </div>
//   );
// }

import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook, FaMicrosoft } from "react-icons/fa";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import {
  openSocialAuthPopup,
  type SocialProvider,
} from "../../services/authService";

const socialButtonClass =
  "flex items-center gap-2 rounded-[10px] bg-[#F7F7F8] px-4 py-2 sm:px-5 cursor-pointer transition-all duration-200 hover:bg-[#EFEFF3] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#F7F7F8]";

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
    <div className="mb-3 flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("google")}
          className={socialButtonClass}
        >
          <FcGoogle size={20} />
          <span className="text-sm text-[#030229]">{t("google")}</span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("facebook")}
          className={socialButtonClass}
        >
          <FaFacebook size={20} className="text-[#385C8E]" />
          <span className="text-sm text-[#030229]">{t("facebook")}</span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("microsoft")}
          className={socialButtonClass}
        >
          <FaMicrosoft size={20} className="text-[#5E5E5E]" />
          <span className="text-sm text-[#030229]">{t("microsoft")}</span>
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}