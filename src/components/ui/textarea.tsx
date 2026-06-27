"use client";

import type * as React from "react";
import { cn } from "#/lib/utils.ts";

export type TextareaProps = React.ComponentPropsWithRef<"textarea"> & {
  unstyled?: boolean;
};

export function Textarea({
  className,
  unstyled = false,
  ...props
}: TextareaProps): React.ReactElement {
  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base text-foreground shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring has-autofill:bg-foreground/4 has-disabled:opacity-64 has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none has-focus-visible:ring-[3px] sm:text-sm dark:bg-input/32 dark:has-autofill:bg-foreground/8 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]",
          className
        ) || undefined
      }
      data-slot="input-control"
    >
      <textarea
        className="w-full min-w-0 resize-none rounded-[inherit] px-[calc(--spacing(3)-1px)] py-1.5 leading-relaxed outline-none placeholder:text-muted-foreground/72"
        data-slot="textarea"
        {...props}
      />
    </span>
  );
}
