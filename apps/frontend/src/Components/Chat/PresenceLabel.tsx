import { useTranslation } from "react-i18next";

import type { ChatPresence } from "../../types/chat";
import { formatRelative } from "./chatFormat";

/** "Online" / "Last seen 5 minutes ago" / "Offline". */
export default function PresenceLabel({
  presence,
}: {
  presence: ChatPresence;
}) {
  const { t, i18n } = useTranslation();

  if (presence.online) return <>{t("chatOnline")}</>;

  const relative = presence.lastSeenAt
    ? formatRelative(presence.lastSeenAt, i18n.language)
    : "";

  return (
    <>{relative ? t("chatLastSeen", { time: relative }) : t("chatOffline")}</>
  );
}
