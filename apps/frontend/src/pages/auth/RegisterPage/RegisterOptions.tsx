// import { useTranslation } from "react-i18next";
// import { Link } from "react-router-dom";

// export default function RegisterOptions() {
//   const { t } = useTranslation();

//   return (
//     <>
//       {/* Terms & Privacy */}
//       <div className="flex items-start gap-2 mt-1">
//         <input
//           type="checkbox"
//           id="terms"
//           className="mt-0.5 h-3.5 w-3.5 accent-[#8969e8]"
//         />

//         <label
//           htmlFor="terms"
//           className="text-[10px] text-gray-500 leading-3.5"
//         >
//           {t("termsText")}
//           <span className="text-[#643ed7] font-medium">
//             {t("termsOfUse")}
//           </span>
//           {t("andOur")}
//           <span className="text-[#643ed7] font-medium">
//             {t("privacyPolicy")}
//           </span>
//           .
//         </label>
//       </div>

//       {/* Sign In */}
//       <p className="text-xs text-gray-500 text-center mt-3">
//         {t("alreadyHaveAccount")}
//         <Link
//           to="/login"
//           className="text-[#643ED7] font-semibold"
//         >
//           {t("signIn")}
//         </Link>
//       </p>
//     </>
//   );
// }

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function RegisterOptions() {
  const { t } = useTranslation();

  return (
    <>
      {/* Terms & Privacy */}
      <div className="mt-1 flex items-start gap-2">
        <input
          type="checkbox"
          id="terms"
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[#605BFF]"
        />

        <label
          htmlFor="terms"
          className="cursor-pointer text-[10px] leading-3.5 text-gray-500"
        >
          {t("termsText")}{" "}
          <span className="font-medium text-[#643ed7] transition-colors duration-200 hover:text-[#514cf0]">
            {t("termsOfUse")}
          </span>{" "}
          {t("andOur")}{" "}
          <span className="font-medium text-[#643ed7] transition-colors duration-200 hover:text-[#514cf0]">
            {t("privacyPolicy")}
          </span>
          .
        </label>
      </div>

      {/* Sign In */}
      <p className="mt-3 text-center text-xs text-gray-500">
        {t("alreadyHaveAccount")}{" "}
        <Link
          to="/login"
          className="font-semibold text-[#643ED7] transition-colors duration-200 hover:text-[#514cf0] hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}