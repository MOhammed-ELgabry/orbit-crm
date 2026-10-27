import { useState, type ReactNode } from "react";

import { useAvatarSrc } from "../../hooks/useAvatarSrc";

interface UserAvatarProps {
  /** `user.avatar` / `senderAvatar` as the API returns it (may be null). */
  avatar: string | null | undefined;
  /** Classes of the circle: size, shape, colours of the INITIALS fallback. */
  className: string;
  /** Fallback content: the initials (or an icon). */
  children: ReactNode;
}

/**
 * One circle used everywhere a user's picture appears (sidebar, chat, ...):
 * the uploaded picture when there is one and it loads, otherwise `children`.
 * It decorates a name that is always shown as text, so it is hidden from
 * assistive technology.
 */
export default function UserAvatar({
  avatar,
  className,
  children,
}: UserAvatarProps) {
  const src = useAvatarSrc(avatar);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showImage = src !== null && src !== brokenSrc;

  return (
    <span className={`${className} overflow-hidden`} aria-hidden="true">
      {showImage ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setBrokenSrc(src)}
          className="h-full w-full object-cover"
          data-testid="user-avatar-image"
        />
      ) : (
        children
      )}
    </span>
  );
}
