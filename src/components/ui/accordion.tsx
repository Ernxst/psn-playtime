"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export function Accordion({
  className,
  ...props
}: AccordionPrimitive.Root.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Root
      className={cn("flex flex-col", className)}
      data-slot="accordion"
      {...props}
    />
  );
}

export function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b last:border-b-0", className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

export function AccordionHeader({
  className,
  ...props
}: AccordionPrimitive.Header.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Header
      className={cn("flex", className)}
      data-slot="accordion-header"
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Trigger
      className={cn(
        "flex flex-1 items-center justify-between gap-2 py-2 text-left text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&[data-panel-open]>svg]:rotate-180",
        className
      )}
      data-slot="accordion-trigger"
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  );
}

export function AccordionPanel({
  className,
  ...props
}: AccordionPrimitive.Panel.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Panel
      className={cn("overflow-hidden text-sm", className)}
      data-slot="accordion-content"
      {...props}
    />
  );
}

export { AccordionPrimitive, AccordionPanel as AccordionContent };
