import { useState, type ChangeEvent } from "react";
import { useFormikContext } from "formik";
import { useTranslation } from "react-i18next";

import {
  AVATAR_ACCEPT,
  AvatarError,
  prepareAvatarBlob,
  type AvatarProblem,
} from "../../../lib/avatar";
import { usePreviewBlob } from "../../../hooks/usePreviewBlob";

const PROBLEM_KEY: Record<AvatarProblem, string> = {
  type: "profilePhotoErrorType",
  size: "profilePhotoErrorSize",
  decode: "profilePhotoErrorDecode",
  empty: "profilePhotoErrorEmpty",
};

interface AvatarPickerProps {
  /** Same look as the other register inputs. */
  inputClassName: string;
}

/**
 * Optional profile picture on the register form. Picking a file crops and
 * downsizes it in the browser and shows a preview; the prepared image is kept
 * in the form's `avatar` value and sent together with the registration. The
 * picture is saved only if registration itself succeeds (the API stores both
 * in one transaction) — a preview alone never means "saved".
 */
export default function AvatarPicker({ inputClassName }: AvatarPickerProps) {
  const { t } = useTranslation();
  const { values, setFieldValue } = useFormikContext<{ avatar: Blob | null }>();

  const [previewBlob, previewUrl, setPreviewBlob] = usePreviewBlob();
  const [problem, setProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Preview only what the form currently holds.
  const shownUrl =
    values.avatar && values.avatar === previewBlob ? previewUrl : null;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires onChange.
    event.target.value = "";

    // Picker cancelled: keep whatever was chosen before.
    if (!file) return;

    setProblem(null);
    setPreparing(true);

    try {
      const prepared = await prepareAvatarBlob(file);
      setPreviewBlob(prepared);
      await setFieldValue("avatar", prepared);
    } catch (error) {
      setPreviewBlob(null);
      await setFieldValue("avatar", null);
      setProblem(
        error instanceof AvatarError
          ? error.problem === "size"
            ? t("profilePhotoErrorTooBig")
            : t(PROBLEM_KEY[error.problem])
          : t("profilePhotoErrorDecode"),
      );
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id="avatar"
        name="avatar"
        type="file"
        accept={AVATAR_ACCEPT}
        onChange={handleChange}
        disabled={preparing}
        className={inputClassName}
        data-testid="register-avatar-input"
      />

      {shownUrl && (
        <div className="flex items-center gap-2">
          <img
            src={shownUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
            data-testid="register-avatar-preview"
          />
          <button
            type="button"
            onClick={() => {
              setPreviewBlob(null);
              void setFieldValue("avatar", null);
            }}
            className="text-xs font-semibold text-red-600 hover:underline"
          >
            {t("profilePhotoRemove")}
          </button>
        </div>
      )}

      {problem && (
        <div role="alert" className="text-xs text-red-500">
          {problem}
        </div>
      )}
    </div>
  );
}
