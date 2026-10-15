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
}

/**
 * Initials only, on purpose: the stored avatar value is a server-side file
 * reference, and rendering arbitrary remote images in a chat would add a
 * tracking / mixed-content surface for no functional gain.
 */
export default function ChatAvatar({
  id,
  name,
  size = "md",
  online,
  group = false,
}: ChatAvatarProps) {
  return (
    <span className="relative inline-flex shrink-0" aria-hidden="true">
      <span
        className={`flex items-center justify-center rounded-full font-bold ${SIZES[size]} ${
          group ? "bg-indigo-600 text-white" : avatarToneOf(id)
        }`}
      >
        {group ? "#" : initialsOf(name)}
      </span>

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
