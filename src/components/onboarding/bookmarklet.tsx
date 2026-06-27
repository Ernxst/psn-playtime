import { Bookmark } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

// Bookmarklet payload. When clicked while the user is on a logged-in
// PlayStation/Sony page it reads the npsso cookie via Sony's own API
// (same-origin) and copies it to the clipboard. Clipboard-only by design:
// auto sign-in would need CORS + SameSite=None on Sony's side (future option,
// out of scope here). Defensive try/catch so a logged-out click just explains.
const BOOKMARKLET_CODE = `javascript:(async () => {
  try {
    const res = await fetch("https://ca.account.sony.com/api/v1/ssocookie");
    const { npsso } = await res.json();
    if (!npsso) throw new Error("No npsso found. Log in to PlayStation first.");
    try {
      await navigator.clipboard.writeText(npsso);
      alert("PSN token copied. Paste it into PSN Playtime.");
    } catch {
      prompt("Copy your PSN token:", npsso);
    }
  } catch (err) {
    alert("Couldn't grab your token. Make sure you're logged in to PlayStation, then click again.\\n\\n" + err);
  }
})();`;

export function Bookmarklet(): React.ReactElement {
  const ref = useRef<HTMLAnchorElement>(null);

  // React blocks javascript: URLs passed through the href prop, so set it on the
  // DOM node directly. This keeps the link a real, draggable bookmarklet.
  useEffect(() => {
    ref.current?.setAttribute("href", BOOKMARKLET_CODE);
  }, []);

  return (
    // The real href is a javascript: bookmarklet set on the DOM node after mount
    // (React blocks javascript: URLs via the href prop). The "#" is a focusable,
    // keyboard-reachable placeholder until that runs.
    // oxlint-disable-next-line jsx-a11y/anchor-is-valid
    <a
      ref={ref}
      href="#"
      draggable={true}
      aria-label="Grab my PSN token: drag this link to your browser's bookmarks bar"
      className="inline-flex cursor-grab items-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground no-underline shadow-sm active:cursor-grabbing"
    >
      <Bookmark className="size-4" aria-hidden="true" />
      Grab my PSN token
    </a>
  );
}
