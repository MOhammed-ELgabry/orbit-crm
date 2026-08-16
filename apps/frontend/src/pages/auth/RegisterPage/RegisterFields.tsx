import { Field, ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";

export default function RegisterFields() {
  const { t } = useTranslation();

  return (
    <>
      {/* First Name */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="firstName"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Last Name */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="lastName"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Email */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="email"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Password */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="password"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Company Name */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="companyName"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Avatar */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-xs text-gray-500 outline-none"
        />

        <ErrorMessage
          name="avatar"
          component="div"
          className="text-xs text-red-500"
        />
      </div>

      {/* Phone */}
      <div className="flex w-full flex-col gap-0.5">
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
          className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
        />

        <ErrorMessage
          name="phone"
          component="div"
          className="text-[10px] text-red-500"
        />
      </div>
    </>
  );
}