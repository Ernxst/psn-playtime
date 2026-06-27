import { Bookmark } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

// Bookmarklet payload. The ssocookie page renders exactly {"npsso":"..."}, so
// when clicked on that page it reads the token straight from the rendered DOM
// (no fetch — that endpoint sends no CORS headers, so a cross-origin fetch from
// our app fails with "failed to fetch") and copies it to the clipboard. Clicked
// anywhere else it just navigates to the ssocookie page so the user can click
// again there. Defensive try/catch so a stray click never throws.
const BOOKMARKLET_CODE = `javascript:(async () => {
  try {
    let data = null;
    try { data = JSON.parse(document.body.innerText); } catch { data = null; }
    const npsso = data && data.npsso;
    if (!npsso) {
      location.href = "https://ca.account.sony.com/api/v1/ssocookie";
      return;
    }
    try {
      await navigator.clipboard.writeText(npsso);
      alert("PSN token copied. Paste it into PSN Playtime.");
    } catch {
      prompt("Copy your PSN token, then paste it into PSN Playtime:", npsso);
    }
  } catch (err) {
    alert("Couldn't grab your token. Open the ssocookie page, then click again.\\n\\n" + err);
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
