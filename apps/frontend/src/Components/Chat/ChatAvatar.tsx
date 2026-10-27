import UserAvatar from "../ui/UserAvatar";
import { avatarToneOf, initialsOf } from "./chatFormat";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
} as const;

interface ChatAvatarProps {
  /** Stable id: picks the colour. */
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  /** Shows a presence dot when defined. */
  online?: boolean;
  /** Team chat: a group glyph instead of initials. */
  group?: boolean;
  /**
   * The person's uploaded picture reference, if they have one. Anything else
   * (no picture, a failed load) falls back to the initials below.
   */
  avatar?: string | null;
}

/**
 * The person's uploaded picture when they have one, otherwise their initials.
 * Only pictures stored by Orbit's own API are ever shown (see UserAvatar /
 * lib/avatar): a remote URL is never loaded into the chat, so a picture can
 * not become a tracking or mixed-content surface.
 */
export default function ChatAvatar({
  id,
  name,
  size = "md",
  online,
  group = false,
  avatar,
}: ChatAvatarProps) {
  return (
    <span className="relative inline-flex shrink-0" aria-hidden="true">
      <UserAvatar
        avatar={group ? null : avatar}
        className={`flex items-center justify-center rounded-full font-bold ${SIZES[size]} ${
          group ? "bg-brand-600 text-white" : avatarToneOf(id)
        }`}
      >
        {group ? "#" : initialsOf(name)}
      </UserAvatar>

      {online !== undefined && (
        <span
          data-testid={online ? "presence-online" : "presence-offline"}
          className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white ${
            online ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      )}
    </span>
  );
}
