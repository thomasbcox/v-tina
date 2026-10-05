import { ABOUT_LABEL, AVATAR_NOTICE, NOTICE_POSITIONS } from "../lib/copy";

/**
 * The notice that V-Tina is an avatar, not the Governor and not a state service.
 *
 * The layout places it once at the top and once at the bottom of every page, each a
 * sibling of the region that scrolls — never inside it — so no state of the
 * transcript can scroll it away or cover it (R1 in `reviews/chat-screen.md`). The
 * colours are the strongest contrast available in each scheme: black on white in
 * the light scheme, white on black in the dark. Its accessible name, like every
 * other word the screen shows, comes from the copy registry.
 */
export function AvatarNotice({ position }: { position: keyof typeof NOTICE_POSITIONS }) {
  return (
    <aside
      role="note"
      aria-label={`${ABOUT_LABEL}, ${NOTICE_POSITIONS[position]}`}
      data-position={position}
      className="shrink-0 bg-black px-4 py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
    >
      {AVATAR_NOTICE}
    </aside>
  );
}
