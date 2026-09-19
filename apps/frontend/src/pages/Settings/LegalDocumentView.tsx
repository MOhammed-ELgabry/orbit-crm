import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FaArrowLeft } from "react-icons/fa";

import { useAuth } from "../../context/AuthContext";
import type { LegalDocument } from "../../locales/en/legal";

/**
 * Shared renderer for the public /terms and /privacy pages (also linked
 * from Settings → Legal for signed-in users). These routes sit outside
 * ProtectedRoute on purpose — see App.tsx — so this component must
 * render fully without an authenticated session; the only thing that
 * adapts to auth state is where the back link points.
 */
export default function LegalDocumentView({
  document,
}: {
  document: LegalDocument;
}) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const backTo = isAuthenticated ? "/dashboard/settings" : "/";
  const backLabel = isAuthenticated ? t("backToSettings") : t("backToHome");

  return (
    <div className="min-h-screen bg-[#f6f8fc] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#605BFF] hover:text-[#514cf0]"
        >
          <FaArrowLeft className="rtl:rotate-180" aria-hidden="true" />
          {backLabel}
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 sm:p-8">
          <h1 className="font-nunito text-xl font-semibold text-slate-800 sm:text-2xl">
            {document.title}
          </h1>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 sm:text-sm">
            {document.templateNotice}
          </div>

          <div className="mt-6 flex flex-col gap-4 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            {document.intro.map((paragraph, index) => (
              <p key={`intro-${index}`}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {document.sections.map((section) => (
              <section key={section.id}>
                <h2 className="font-nunito text-base font-semibold text-slate-800 sm:text-lg">
                  {section.heading}
                </h2>
                <div className="mt-2 flex flex-col gap-3 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                  {section.body.map((paragraph, index) => (
                    <p key={`${section.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}