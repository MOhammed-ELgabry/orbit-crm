import { useTranslation } from "react-i18next";
import { LuCircleHelp } from "react-icons/lu";

import type { HelperId } from "../../lib/helperRegistry";
import Hint from "./Hint";

/**
 * A small "?" button that opens the helper for `id`. Unlike wrapping an
 * element in <Hint>, this one works with a plain tap, so it is the helper
 * entry point for touch screens (next to a title, setting or field).
 */
export default function HintIcon({ id }: { id: HelperId }) {
  const { t } = useTranslation();

  return (
    <Hint id={id} toggleOnClick>
      <button
        type="button"
        aria-label={t("helperIconLabel", { name: t(`helper_${id}_title`) })}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-brand-500"
      >
        <LuCircleHelp size={15} aria-hidden="true" />
      </button>
    </Hint>
  );
}
