import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2 } from "react-icons/fi";

import { errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

interface ContactNotesCardProps {
  /** The contact's existing `notes` field - no separate Notes model exists. */
  notes: string | null;
  /** Mirrors the user's contact:update permission; the API enforces it too. */
  canEdit: boolean;
  onSave: (notes: string) => Promise<void>;
}

const MAX_NOTES_LENGTH = 5000; // backend UpdateContactDto @MaxLength(5000)

export default function ContactNotesCard({
  notes,
  canEdit,
  onSave,
}: ContactNotesCardProps) {
  const { t } = useTranslation();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setDraft(notes ?? "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onSave(draft.trim());
      setIsEditing(false);
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">{t("notes")}</p>

        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label={t("contact360NotesEdit")}
            className="rounded-md p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <FiEdit2 size={13} />
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            maxLength={MAX_NOTES_LENGTH}
            aria-label={t("notes")}
            placeholder={t("contact360NotesPlaceholder")}
            className="w-full resize-y rounded-[10px] bg-white px-3 py-2 text-sm text-gray-700 outline-none ring-1 ring-slate-200"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </div>
      ) : notes ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
          {notes}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">
          {t("contact360NotesEmpty")}
        </p>
      )}
    </div>
  );
}
