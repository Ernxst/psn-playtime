"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long the copied-confirmation state is shown before reverting. */
const CONFIRM_MS = 2000;

export interface CopyButtonProps {
  /** The full text written to the clipboard. */
  value: string;
  /** Accessible label / button text describing what is copied. */
  label: string;
  /** Render as a square icon-only control or a labelled button. */
  variant?: "icon" | "button";
  /** Called with the copied value after a successful write. */
  onCopy?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Track a transient "copied" flag that auto-reverts after `CONFIRM_MS`. */
export function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fire-and-forget unmount teardown: cancel the pending setTimeout (a browser
  // timer system) so it can't call setCopied after unmount. Nothing here is read
  // during render (so not useSyncExternalStore); the timer is started in the
  // `flash` event handler, not by this Effect, and there's nothing to derive.
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = () => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  };

  return [copied, flash];
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? <Check className="animate-in zoom-in-50 text-[var(--chart-2)]" /> : <Copy />;
}

/**
 * A small in-repo copy control. Writes `value` to the clipboard and swaps the
 * `Copy` icon for an animated `Check` for ~2s to confirm. No external animation
 * library — the confirmation uses tw-animate-css utility classes.
 */
export function CopyButton({
  value,
  label,
  variant = "button",
  onCopy,
  disabled = false,
  className,
}: CopyButtonProps): React.ReactElement {
  const [copied, flash] = useCopied();

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    onCopy?.(value);
    flash();
  }

  const isIcon = variant === "icon";
  const text = copied ? "Copied" : label;

  return (
    <Button
      size={isIcon ? "icon" : undefined}
      variant="outline"
      disabled={disabled}
      onClick={handleCopy}
      aria-label={isIcon ? text : undefined}
      className={cn("gap-2", className)}
    >
      <CopyIcon copied={copied} />
      {isIcon ? null : text}
    </Button>
  );
}
