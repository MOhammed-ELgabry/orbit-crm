import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert, LuX } from "react-icons/lu";

import {
  convertLead,
  previewLeadConversion,
} from "../../services/leadConversionService";
import { getErrorMessage } from "../../lib/errors";
import type {
  ConversionCandidate,
  ConversionIneligibleReason,
  ConvertLeadInput,
  ConvertLeadResult,
  LeadConversionPreview,
} from "../../types/leadConversion";

interface ConvertLeadModalProps {
  dealId: string;
  dealTitle: string;
  onClose: () => void;
  /** Called after ANY successful outcome (created / linked / already_converted). */
  onConverted: (result: ConvertLeadResult) => void;
  /** Lets the caller open the contact after a successful conversion. */
  onOpenContact?: (contactId: string) => void;
}

type Choice = "create" | "link";

const INELIGIBLE_KEY: Record<ConversionIneligibleReason, string> = {
  deal_not_won: "leadConvIneligibleDealNotWon",
  deal_has_no_lead: "leadConvIneligibleNoLead",
  lead_not_found: "leadConvIneligibleLeadNotFound",
};

const fullName = (c: { firstName: string; lastName: string }) =>
  `${c.firstName} ${c.lastName}`.trim();

/**
 * Preview + explicit confirmation of "convert the lead of this won deal".
 * The server decides everything (eligibility, duplicates, what is created);
 * this dialog only shows the preview and sends the user's decision.
 */
export default function ConvertLeadModal({
  dealId,
  dealTitle,
  onClose,
  onConverted,
  onOpenContact,
}: ConvertLeadModalProps) {
  const { t } = useTranslation();

  const [preview, setPreview] = useState<LeadConversionPreview | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [choice, setChoice] = useState<Choice>("create");
  const [linkContactId, setLinkContactId] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Guards against a late response from an older load overwriting a newer one.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = (loadSeq.current += 1);
    setLoadState("loading");
    try {
      const result = await previewLeadConversion(dealId);
      if (seq !== loadSeq.current) return;

      setPreview(result);
      setLoadState("ready");

      // Sensible default: when "create" is not possible, start on "link"
      // with the only/first candidate selected.
      const dealOwn = result.candidates.find((c) =>
        c.matchedOn.includes("deal"),
      );
      if (result.duplicate.blocksCreate) {
        setChoice("link");
        setLinkContactId(
          dealOwn?.contactId ?? result.candidates[0]?.contactId ?? "",
        );
      } else {
        setChoice("create");
        setLinkContactId("");
      }
      setAcknowledge(false);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setSubmitError(getErrorMessage(error, t("somethingWentWrong")));
      setLoadState("error");
    }
  }, [dealId, t]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
    return () => {
      // invalidate any in-flight response after unmount
      loadSeq.current += 1;
    };
  }, [load]);

  const dealOwnCandidate: ConversionCandidate | undefined =
    preview?.candidates.find((c) => c.matchedOn.includes("deal"));
  // If the deal already has a contact, that is the ONLY contact it can be linked to.
  const linkable: ConversionCandidate[] = dealOwnCandidate
    ? [dealOwnCandidate]
    : (preview?.candidates ?? []);

  const createBlocked = preview?.duplicate.blocksCreate ?? false;
  const needsAck = preview?.duplicate.requiresAcknowledgement ?? false;

  const canConfirm =
    !isSubmitting &&
    preview?.eligible === true &&
    preview.alreadyConverted === null &&
    (choice === "create"
      ? !createBlocked && (!needsAck || acknowledge)
      : linkContactId !== "");

  const handleConfirm = async () => {
    if (!canConfirm) return;

    const input: ConvertLeadInput =
      choice === "create"
        ? needsAck
          ? { resolution: "create", acknowledgeDuplicate: true }
          : { resolution: "create" }
        : { resolution: "link", contactId: linkContactId };

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await convertLead(dealId, input);
      onConverted(result);
    } catch (error) {
      setSubmitError(getErrorMessage(error, t("somethingWentWrong")));
      // The data may have changed under us (someone converted it, a duplicate
      // appeared): show the fresh preview instead of a stale form.
      await load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const matchLabel = (c: ConversionCandidate) =>
    c.matchedOn
      .map((m) =>
        t(
          m === "deal"
            ? "leadConvMatchDeal"
            : m === "email"
              ? "leadConvMatchEmail"
              : "leadConvMatchPhone",
        ),
      )
      .join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("leadConvTitle")}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-nunito text-base font-semibold text-slate-800">
            {t("leadConvTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <LuX size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
          {loadState === "loading" && (
            <p className="text-slate-500">{t("leadConvLoading")}</p>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600"
            >
              <LuTriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {loadState === "error" && (
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                load();
              }}
              className="w-fit text-xs font-semibold text-brand-600 hover:underline"
            >
              {t("retry")}
            </button>
          )}

          {loadState === "ready" && preview && !preview.eligible && (
            <p className="text-slate-600">
              {preview.reason ? t(INELIGIBLE_KEY[preview.reason]) : ""}
            </p>
          )}

          {loadState === "ready" && preview?.alreadyConverted && (
            <div className="flex flex-col gap-2">
              <p className="text-slate-600">{t("leadConvAlreadyDone")}</p>
              {preview.alreadyConverted.contactId && onOpenContact && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenContact(preview.alreadyConverted!.contactId as string)
                  }
                  className="w-fit text-xs font-semibold text-brand-600 hover:underline"
                >
                  {t("leadConvOpenContact")}
                </button>
              )}
            </div>
          )}

          {loadState === "ready" &&
            preview?.eligible &&
            !preview.alreadyConverted &&
            preview.lead &&
            preview.proposedContact && (
              <>
                <p className="text-slate-500">
                  {t("leadConvIntro", { deal: dealTitle })}
                </p>

                <section className="rounded-xl bg-surface-muted px-3 py-2">
                  <p className="text-xs font-semibold text-slate-500">
                    {t("leadConvLeadSection")}
                  </p>
                  <p className="mt-0.5 font-medium text-slate-700">
                    {fullName(preview.lead)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[
                      preview.lead.email,
                      preview.lead.phone,
                      preview.lead.organizationName,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </section>

                {preview.candidates.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold text-slate-500">
                      {t("leadConvDuplicatesTitle")}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {preview.candidates.map((c) => (
                        <li
                          key={c.contactId}
                          className="rounded-lg border border-slate-100 px-3 py-2"
                        >
                          <p className="font-medium text-slate-700">
                            {fullName(c)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[c.email, c.phone ?? c.mobile, c.organizationName]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-amber-600">
                            {matchLabel(c)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <fieldset className="flex flex-col gap-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="lead-conversion-choice"
                      checked={choice === "create"}
                      disabled={createBlocked}
                      onChange={() => setChoice("create")}
                      className="mt-1"
                    />
                    <span
                      className={
                        createBlocked ? "text-slate-400" : "text-slate-700"
                      }
                    >
                      {t("leadConvOptionCreate")}
                    </span>
                  </label>

                  {createBlocked && (
                    <p className="ps-6 text-xs text-slate-500">
                      {dealOwnCandidate
                        ? t("leadConvBlockedDeal")
                        : t("leadConvBlockedEmail")}
                    </p>
                  )}

                  {!createBlocked && needsAck && choice === "create" && (
                    <label className="flex items-start gap-2 ps-6 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={acknowledge}
                        onChange={(e) => setAcknowledge(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>{t("leadConvAckPhone")}</span>
                    </label>
                  )}

                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="lead-conversion-choice"
                      checked={choice === "link"}
                      disabled={linkable.length === 0}
                      onChange={() => {
                        setChoice("link");
                        if (!linkContactId && linkable[0]) {
                          setLinkContactId(linkable[0].contactId);
                        }
                      }}
                      className="mt-1"
                    />
                    <span
                      className={
                        linkable.length === 0
                          ? "text-slate-400"
                          : "text-slate-700"
                      }
                    >
                      {t("leadConvOptionLink")}
                    </span>
                  </label>

                  {linkable.length === 0 && (
                    <p className="ps-6 text-xs text-slate-500">
                      {t("leadConvNoCandidates")}
                    </p>
                  )}

                  {choice === "link" && linkable.length > 0 && (
                    <div className="ps-6">
                      <label className="text-xs font-semibold text-slate-500">
                        {t("leadConvSelectContact")}
                      </label>
                      <select
                        value={linkContactId}
                        onChange={(e) => setLinkContactId(e.target.value)}
                        className="mt-0.5 h-[38px] w-full rounded-[10px] bg-surface-muted px-3 text-sm text-gray-700 outline-none"
                      >
                        {linkable.map((c) => (
                          <option key={c.contactId} value={c.contactId}>
                            {fullName(c)}
                            {c.email ? ` — ${c.email}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        {t("leadConvNoMerge")}
                      </p>
                    </div>
                  )}
                </fieldset>

                <p className="text-xs text-slate-500">
                  {t("leadConvKeepsLead")}
                </p>
              </>
            )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? t("leadConvConfirming") : t("leadConvConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
