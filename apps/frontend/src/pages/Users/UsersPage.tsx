import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiPlus, FiUserCheck, FiUserX } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import {
  listTeamMembers,
  createTeamMember,
  updateTeamMemberStatus,
  assignTeamMemberRole,
} from "../../services/userService";
import { listAssignableRoles, type RoleSummary } from "../../services/roleService";
import type { CreateTeamMemberInput, TeamMember } from "../../types/user";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none";
const labelClass = "text-xs font-semibold text-gray-700";

/**
 * Translation keys for the 4 default staff roles every company gets
 * (see backend role/constants/default-roles.constants.ts) — their
 * `name` is a fixed, known string, so it's safe to map to a translated
 * label. A company can also create its own custom roles via the Role
 * API (RoleController), and those have arbitrary free-text names that
 * can't be looked up here — formatRoleName() below falls back to
 * showing that name exactly as entered, the same untranslated
 * treatment other user-authored text (e.g. a Contact's job title)
 * already gets elsewhere in this app.
 */
const DEFAULT_ROLE_NAME_TRANSLATION_KEYS: Record<string, string> = {
  MANAGER: "roleNameManager",
  SALES: "roleNameSales",
  SUPPORT: "roleNameSupport",
  EMPLOYEE: "roleNameEmployee",
};

function AddMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateTeamMemberInput>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const input: CreateTeamMemberInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      };
      if (form.phone?.trim()) input.phone = form.phone.trim();

      const created = await createTeamMember(input);
      onCreated(created);
      onClose();
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("addTeamMember")}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {t("addTeamMemberDescription")}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("firstName")}</label>
              <input
                required
                className={inputClass}
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("lastName")}</label>
              <input
                required
                className={inputClass}
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("email")}</label>
            <input
              type="email"
              required
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("password")}</label>
            <input
              type="password"
              required
              minLength={8}
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("phone")}</label>
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#605BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [memberResult, roleResult] = await Promise.all([
        listTeamMembers({ page: 1, limit: 100 }),
        // Non-owners get a 403 here (RoleController is owner-only) —
        // that's expected and just means no assignable-roles list, not
        // an error worth surfacing on this page.
        listAssignableRoles().catch(() => []),
      ]);
      setMembers(memberResult.members);
      setRoles(roleResult);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // Local inline call rather than calling the hoisted `load`
  // useCallback directly — see react-hooks/set-state-in-effect.
  useEffect(() => {
    const loadOnMount = async () => {
      await load();
    };
    loadOnMount();
  }, [load]);

  const isOwner = currentUser?.isOwner ?? false;

  // One of the 4 default roles → translated label (so the Arabic UI
  // doesn't show a raw English constant like "MANAGER"). Any other
  // name is a company-created custom role (see CreateRoleDto) and has
  // no translation to look up, so it's shown exactly as named.
  const formatRoleName = (name: string) => {
    const translationKey = DEFAULT_ROLE_NAME_TRANSLATION_KEYS[name];
    return translationKey ? t(translationKey) : name;
  };

  const handleToggleStatus = async (member: TeamMember) => {
    if (member.isActive) {
      const confirmed = await confirmAlert({
        title: t("confirmDeleteTitle"),
        text: t("confirmDeleteMessage"),
        confirmButtonText: t("deactivate"),
        cancelButtonText: t("cancel"),
      });
      if (!confirmed) return;
    }

    const previous = members;
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, isActive: !m.isActive } : m)),
    );
    try {
      await updateTeamMemberStatus(member.id, !member.isActive);
    } catch (error) {
      setMembers(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  const handleRoleChange = async (member: TeamMember, roleId: string) => {
    const previous = members;
    const nextRoleId = roleId || null;
    // Keep `role` (used by the read-only label branch below) in sync
    // with `roleId` locally too, sourced from the same `roles` list
    // the dropdown itself renders from — this select's own <option>
    // already shows the right text purely from roleId, so this isn't
    // needed for this control's own display, but it keeps the member
    // object internally consistent rather than leaving `role` stale
    // until the next full reload.
    const nextRole = nextRoleId
      ? (roles.find((r) => r.id === nextRoleId) ?? null)
      : null;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, roleId: nextRoleId, role: nextRole } : m,
      ),
    );
    try {
      await assignTeamMemberRole(member.id, nextRoleId);
    } catch (error) {
      setMembers(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {members.length} {t("teamPageTitle").toLowerCase()}
        </p>

        {isOwner && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#605BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#514cf0]"
          >
            <FiPlus size={16} />
            <span className="hidden sm:inline">{t("addTeamMember")}</span>
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white">
        {status === "loading" && (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
            <button
              type="button"
              onClick={load}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "ready" && members.length === 0 && (
          <p className="py-14 text-center text-sm text-slate-500">
            {t("noTeamMembersYet")}
          </p>
        )}

        {status === "ready" && members.length > 0 && (
          <div className="divide-y divide-slate-50">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
                    {member.firstName[0]}
                    {member.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {member.firstName} {member.lastName}
                      {member.id === currentUser?.id && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          ({t("you")})
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">{member.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {member.isOwner ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
                      {t("ownerBadge")}
                    </span>
                  ) : isOwner && roles.length > 0 ? (
                    <select
                      aria-label={t("roleLabel")}
                      value={member.roleId ?? ""}
                      onChange={(e) => handleRoleChange(member, e.target.value)}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
                    >
                      <option value="">{t("noRoleAssigned")}</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {formatRoleName(role.name)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // Read-only path: every non-owner viewer (who can
                    // see roles but must never get an editable control
                    // — enforced server-side too, see OwnerGuard on
                    // PATCH /users/:id/role), and an Owner viewing this
                    // row while roles.length === 0 (nothing yet to
                    // assign, so the dropdown above has nothing to
                    // offer either way).
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {member.role
                        ? formatRoleName(member.role.name)
                        : t("noRoleAssigned")}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      member.isActive
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {t(member.isActive ? "activeStatus" : "inactiveStatus")}
                  </span>

                  {isOwner && !member.isOwner && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(member)}
                      aria-label={t(member.isActive ? "deactivate" : "activateAction")}
                      className={`rounded-lg p-2 ${
                        member.isActive
                          ? "text-slate-400 hover:bg-red-50 hover:text-red-500"
                          : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                      }`}
                    >
                      {member.isActive ? <FiUserX size={15} /> : <FiUserCheck size={15} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => setMembers((prev) => [created, ...prev])}
        />
      )}
    </div>
  );
}