// import { Field, ErrorMessage } from "formik";
// import { useTranslation } from "react-i18next";

// export default function RegisterFields() {
//   const { t } = useTranslation();

//   return (
//     <>
//       {/* First Name */}
//       <div className="flex w-full flex-col gap-0.5">
//         <label
//           htmlFor="firstName"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("firstName")}
//         </label>

//         <Field
//           id="firstName"
//           type="text"
//           name="firstName"
//           placeholder={t("enterFirstName")}
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="firstName"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Last Name */}
//       <div className="flex w-full flex-col gap-0.5">
//         <label
//           htmlFor="lastName"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("lastName")}
//         </label>

//         <Field
//           id="lastName"
//           type="text"
//           name="lastName"
//           placeholder={t("enterLastName")}
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="lastName"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Email */}
//       <div className="flex w-full flex-col gap-0.5">
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
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="email"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Password */}
//       <div className="flex w-full flex-col gap-0.5">
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
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="password"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Company Name */}
//       <div className="flex w-full flex-col gap-0.5">
//         <label
//           htmlFor="companyName"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("companyName")}
//         </label>

//         <Field
//           id="companyName"
//           type="text"
//           name="companyName"
//           placeholder={t("enterCompanyName")}
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="companyName"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Avatar */}
//       <div className="flex w-full flex-col gap-0.5">
//         <label
//           htmlFor="avatar"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("avatar")}{" "}
//           <span className="font-normal text-gray-400">
//             ({t("optional")})
//           </span>
//         </label>

//         <Field
//           id="avatar"
//           name="avatar"
//           type="file"
//           accept="image/*"
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-xs text-gray-500 outline-none"
//         />

//         <ErrorMessage
//           name="avatar"
//           component="div"
//           className="text-xs text-red-500"
//         />
//       </div>

//       {/* Phone */}
//       <div className="flex w-full flex-col gap-0.5">
//         <label
//           htmlFor="phone"
//           className="text-xs font-semibold text-gray-700"
//         >
//           {t("phone")}{" "}
//           <span className="font-normal text-gray-400">
//             ({t("optional")})
//           </span>
//         </label>

//         <Field
//           id="phone"
//           type="tel"
//           name="phone"
//           placeholder={t("enterPhone")}
//           className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
//         />

//         <ErrorMessage
//           name="phone"
//           component="div"
//           className="text-[10px] text-red-500"
//         />
//       </div>
//     </>
//   );
// }

import { Field, ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";

const inputClass =
  "h-[42px] w-full rounded-[10px] border border-transparent bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[#605BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(96,91,255,0.08)]";

const fileInputClass =
  "h-[42px] w-full cursor-pointer rounded-[10px] border border-transparent bg-[#F7F7F8] px-3 text-xs text-gray-500 outline-none transition-all duration-200 file:mr-3 file:cursor-pointer file:rounded-[8px] file:border-0 file:bg-[#605BFF]/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#605BFF] hover:file:bg-[#605BFF]/20 focus:border-[#605BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(96,91,255,0.08)]";

export default function RegisterFields() {
  const { t } = useTranslation();

  return (
    <>
      {/* First Name + Last Name */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex w-full flex-col gap-1">
          <label
            htmlFor="firstName"
            className="text-xs font-semibold text-gray-700"
          >
            {t("firstName")}
          </label>

          <Field
            id="firstName"
            type="text"
            name="firstName"
            placeholder={t("enterFirstName")}
            className={inputClass}
          />

          <ErrorMessage
            name="firstName"
            component="div"
            className="text-xs text-red-500"
          />
        </div>

        <div className="flex w-full flex-col gap-1">
          <label
            htmlFor="lastName"
            className="text-xs font-semibold text-gray-700"
          >
            {t("lastName")}
          </label>

          <Field
            id="lastName"
            type="text"
            name="lastName"
            placeholder={t("enterLastName")}
            className={inputClass}
          />

          <ErrorMessage
            name="lastName"
            component="div"
            className="text-xs text-red-500"
          />
        </div>
      </div>

      {/* Email */}
      <div className="flex w-full flex-col gap-1">
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
      <div className="flex w-full flex-col gap-1">
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

      {/* Company Name */}
      <div className="flex w-full flex-col gap-1">
        <label
          htmlFor="companyName"
          className="text-xs font-semibold text-gray-700"
        >
          {t("companyName")}
        </label>

        <Field
          id="companyName"
          type="text"
          name="companyName"
          placeholder={t("enterCompanyName")}
          className={inputClass}
        />

        <ErrorMessage
          name="companyName"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Avatar + Phone */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex w-full flex-col gap-1">
          <label
            htmlFor="avatar"
            className="text-xs font-semibold text-gray-700"
          >
            {t("avatar")}{" "}
            <span className="font-normal text-gray-400">
              ({t("optional")})
            </span>
          </label>

          <Field
            id="avatar"
            name="avatar"
            type="file"
            accept="image/*"
            className={fileInputClass}
          />

          <ErrorMessage
            name="avatar"
            component="div"
            className="text-xs text-red-500"
          />
        </div>

        <div className="flex w-full flex-col gap-1">
          <label
            htmlFor="phone"
            className="text-xs font-semibold text-gray-700"
          >
            {t("phone")}{" "}
            <span className="font-normal text-gray-400">
              ({t("optional")})
            </span>
          </label>

          <Field
            id="phone"
            type="tel"
            name="phone"
            placeholder={t("enterPhone")}
            className={inputClass}
          />

          <ErrorMessage
            name="phone"
            component="div"
            className="text-[10px] text-red-500"
          />
        </div>
      </div>
    </>
  );
}