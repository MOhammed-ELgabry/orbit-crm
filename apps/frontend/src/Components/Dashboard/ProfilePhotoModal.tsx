import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LuCamera, LuTrash2, LuX } from "react-icons/lu";

import { useAuth } from "../../context/AuthContext";
import {
  AVATAR_ACCEPT,
  AvatarError,
  isLocalAvatar,
  prepareAvatarBlob,
  primeAvatarUrl,
  type AvatarProblem,
} from "../../lib/avatar";
import { getErrorMessage } from "../../lib/errors";
import { notifyError, notifySuccess } from "../../lib/notify";
import { usePreviewBlob } from "../../hooks/usePreviewBlob";
import { removeAvatar, uploadAvatar } from "../../services/userService";
import Button from "../ui/Button";
import UserAvatar from "../ui/UserAvatar";

const PROBLEM_KEY: Record<AvatarProblem, string> = {
  type: "profilePhotoErrorType",
  size: "profilePhotoErrorSize",
  decode: "profilePhotoErrorDecode",
  empty: "profilePhotoErrorEmpty",
};

interface ProfilePhotoModalProps {
  onClose: () => void;
}

/**
 * Lets the signed-in user pick, preview, save or remove their own picture.
 * Nothing is saved until "Save photo": picking only prepares (crops and
 * downsizes) the image and shows a preview. After a successful save the
 * shared user state is updated, so the sidebar and chat pick the new picture
 * up without a reload.
 */
export default function ProfilePhotoModal({ onClose }: ProfilePhotoModalProps) {
  const { t } = useTranslation();
  const { user, updateUserSettings } = useAuth();

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [picked, previewUrl, setPicked] = usePreviewBlob();
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";
  const hasPicture = isLocalAvatar(user?.avatar);
  const working = busy !== null || preparing;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, working]);

  const handlePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires onChange.
    event.target.value = "";

    // The picker was cancelled: nothing changes.
    if (!file) return;

    setProblem(null);
    setPreparing(true);

    try {
      setPicked(await prepareAvatarBlob(file));
    } catch (error) {
      setPicked(null);
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

  const handleSave = async () => {
    if (!user || !picked) return;

    setBusy("save");

    try {
      const reference = await uploadAvatar(user.id, picked);
      primeAvatarUrl(reference, picked);
      updateUserSettings({ avatar: reference });
      notifySuccess({ title: t("profilePhotoSaved") });
      onClose();
    } catch (error) {
      notifyError({
        title: t("profilePhotoFailed"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!user) return;

    setBusy("remove");

    try {
      await removeAvatar(user.id);
      updateUserSettings({ avatar: null });
      notifySuccess({ title: t("profilePhotoRemoved") });
      onClose();
    } catch (error) {
      notifyError({
        title: t("profilePhotoRemoveFailed"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
      setBusy(null);
    }
  };

  const circle =
    "flex h-28 w-28 items-center justify-center rounded-full bg-brand-500 text-3xl font-semibold text-white ring-4 ring-brand-100";

  // Portaled to <body>: the sidebar that opens this is a transformed element,
  // which would otherwise become the containing block of `fixed`.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2
            id="profile-photo-title"
            className="font-nunito text-base font-semibold text-slate-800"
          >
            {t("profilePhotoTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            aria-label={t("close")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <LuX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 px-5 py-6">
          {previewUrl ? (
            <span className={`${circle} overflow-hidden`} aria-hidden="true">
              <img
                src={previewUrl}
                alt=""
                className="h-full w-full object-cover"
                data-testid="profile-photo-preview"
              />
            </span>
          ) : (
            <UserAvatar avatar={user?.avatar} className={circle}>
              {initials}
            </UserAvatar>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={handlePick}
            className="sr-only"
            tabIndex={-1}
            data-testid="profile-photo-input"
          />

          <p className="text-center text-xs text-slate-500">
            {t("profilePhotoHint")}
          </p>

          {problem && (
            <p role="alert" className="text-center text-xs text-red-600">
              {problem}
            </p>
          )}

          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={working}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <LuCamera size={16} aria-hidden="true" />
              {picked
                ? t("profilePhotoChooseAnother")
                : t("profilePhotoChoose")}
            </button>

            <Button
              type="button"
              onClick={handleSave}
              loading={busy === "save"}
              disabled={!picked || working}
              className="w-full"
            >
              {t("profilePhotoSave")}
            </Button>

            {hasPicture && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={working}
                className="flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <LuTrash2 size={16} aria-hidden="true" />
                {busy === "remove" ? "…" : t("profilePhotoRemove")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
