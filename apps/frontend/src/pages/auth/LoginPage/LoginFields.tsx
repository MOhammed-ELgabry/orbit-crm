// import { Field, ErrorMessage } from "formik";
// import { useTranslation } from "react-i18next";

// export default function LoginFields() {
//   const { t } = useTranslation();

//   return (
//     <>
//       {/* Email */}
//       <div className="flex flex-col gap-1">
//         <label
//           htmlFor="email"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("email")}
//         </label>

//         <Field
//           id="email"
//           type="email"
//           name="email"
//           placeholder={t("enterEmail")}
//           className="w-full h-[42px] rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="email"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Password */}
//       <div className="flex flex-col gap-1">
//         <label
//           htmlFor="password"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("password")}
//         </label>

//         <Field
//           id="password"
//           type="password"
//           name="password"
//           placeholder={t("enterPassword")}
//           className="w-full h-[42px] rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="password"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>
//     </>
//   );
// }

import { Field, ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";

const inputClass =
  "w-full h-[42px] rounded-[10px] border border-transparent bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[#605BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(96,91,255,0.08)]";

export default function LoginFields() {
  const { t } = useTranslation();

  return (
    <>
      {/* Email */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="email"
          className="text-xs font-semibold text-gray-700"
        >
          {t("email")}
        </label>

        <Field
          id="email"
          type="email"
          name="email"
          placeholder={t("enterEmail")}
          className={inputClass}
        />

        <ErrorMessage
          name="email"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          className="text-xs font-semibold text-gray-700"
        >
          {t("password")}
        </label>

        <Field
          id="password"
          type="password"
          name="password"
          placeholder={t("enterPassword")}
          className={inputClass}
        />

        <ErrorMessage
          name="password"
          component="div"
          className="text-xs text-red-500"
        />
      </div>
    </>
  );
}