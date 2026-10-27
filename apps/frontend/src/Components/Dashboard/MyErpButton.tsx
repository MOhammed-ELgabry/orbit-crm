import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Header entry to the (not yet built) MY ERP area, placed next to the
 * notification bell. A real link, so it is keyboard reachable, opens with
 * Enter, and can be opened in a new tab. The slow glow lives in CSS
 * (`.orbit-erp-btn`) and is switched off for reduced motion there.
 */
export default function MyErpButton() {
  const { t } = useTranslation();

  return (
    <NavLink
      to="/dashboard/my-erp"
      data-testid="my-erp-button"
      className="orbit-erp-btn inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 px-3 text-[12px] font-bold uppercase tracking-wide text-white transition-colors duration-200 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-800 sm:px-4 sm:text-[13px]"
    >
      {t("myErpNavLabel")}
    </NavLink>
  );
}
