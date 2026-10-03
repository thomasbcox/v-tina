import { AVATAR_NOTICE } from "../lib/copy";

/**
 * The notice that V-Tina is an avatar, not the Governor and not a state service.
 *
 * The layout places it once at the top and once at the bottom of every page, each a
 * sibling of the region that scrolls — never inside it — so no state of the
 * transcript can scroll it away or cover it (R1 in `reviews/chat-screen.md`). The
 * colours are the strongest contrast available in each scheme: black on white in
 * the light scheme, white on black in the dark.
 */
export function AvatarNotice({ position }: { position: "top" | "bottom" }) {
  return (
    <aside
      role="note"
      aria-label={`About V-Tina (${position})`}
      data-position={position}
      className="shrink-0 bg-black px-4 py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
    >
      {AVATAR_NOTICE}
    </aside>
  );
}
