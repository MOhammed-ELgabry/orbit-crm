import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import type { KeyedResource } from "../../hooks/useKeyedResource";
import type { DealListResult } from "../../services/dealService";
import { CONTACT_SECTION_LIMIT, parseDate } from "../../lib/contact360";
import {
  DEAL_STAGE_LABEL_KEY,
  dealStageBadgeClass,
  formatDealAmount,
} from "../Deal/dealStage";

import ContactSectionState from "./ContactSectionState";

export default function ContactDealsTab({
  resource,
}: {
  resource: KeyedResource<DealListResult>;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;
  const deals = resource.data?.deals ?? [];
  const hasMore = resource.data?.meta.hasNextPage ?? false;

  return (
    <ContactSectionState
      status={resource.status}
      onRetry={resource.retry}
      isEmpty={deals.length === 0}
      emptyMessage={t("contact360NoDeals")}
    >
      <ul className="divide-y divide-slate-100">
        {deals.map((deal) => {
          // An unparsable date is left out rather than crashing the page.
          const closeDate = parseDate(deal.expectedCloseDate);

          return (
            <li
              key={deal.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/dashboard/deals/${deal.id}`}
                  className="block truncate text-sm font-semibold text-slate-800 hover:text-blue-600"
                >
                  {deal.title}
                </Link>
                <p className="text-xs text-slate-400">
                  {formatDealAmount(deal.amount)}
                  {closeDate && (
                    <>
                      {" · "}
                      {t("dealExpectedCloseDate")}:{" "}
                      {format(closeDate, "PP", { locale })}
                    </>
                  )}
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${dealStageBadgeClass(deal.stage)}`}
              >
                {t(DEAL_STAGE_LABEL_KEY[deal.stage] ?? deal.stage)}
              </span>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <p className="mt-3 text-center text-xs text-amber-600">
          {t("contact360PartialCount", { count: CONTACT_SECTION_LIMIT })}{" "}
          <Link
            to="/dashboard/deals"
            className="font-semibold text-blue-600 hover:underline"
          >
            {t("contact360OpenPage", { section: t("dealsNavLabel") })}
          </Link>
        </p>
      )}
    </ContactSectionState>
  );
}
