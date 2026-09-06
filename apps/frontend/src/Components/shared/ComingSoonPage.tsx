import type { IconType } from "react-icons";
import { useTranslation } from "react-i18next";

interface ComingSoonPageProps {
  icon: IconType;
  titleKey: string;
}

/**
 * These 5 nav items (Leads, Deals, Tasks, Calendar, Reports) have no
 * backing data model in the current schema (see schema.prisma — only
 * Company/User/Contact/Activity/Role/Permission exist), so there is no
 * real API to connect them to. Rather than leave them as bare
 * `<div>PageName</div>` placeholders, this gives them a real, styled
 * empty state consistent with the rest of the product — without
 * inventing frontend-only fake business logic for a backend that
 * doesn't exist yet.
 */
export default function ComingSoonPage({ icon: Icon, titleKey }: ComingSoonPageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
        <Icon size={26} />
      </div>

      <h2 className="mt-5 font-nunito text-lg font-semibold text-slate-800">
        {t(titleKey)}
      </h2>

      <p className="mt-1 text-sm text-slate-500">{t("comingSoonTitle")}</p>

      <p className="mt-2 max-w-sm text-sm text-slate-400">
        {t("comingSoonDescription")}
      </p>
    </div>
  );
}