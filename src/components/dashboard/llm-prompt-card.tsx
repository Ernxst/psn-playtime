import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "#/lib/utils.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPrompt,
  PROMPT_GROUPS,
  type PromptGroup,
  type PromptVariant,
  PROMPT_VARIANTS,
} from "@/lib/psn/llm-prompt";
import type { DashboardData } from "@/lib/psn/types";
import { useTransactionImport } from "@/lib/transactions-store";
import { CopyButton } from "./copy-button";

interface VariantGroup {
  group: PromptGroup;
  questions: PromptVariant[];
}

/** The variants matching `query` (case-insensitive on the question text). */
function filterVariants(query: string): readonly PromptVariant[] {
  const q = query.trim().toLowerCase();
  if (q === "") return PROMPT_VARIANTS;
  return PROMPT_VARIANTS.filter((v) => v.question.toLowerCase().includes(q));
}

/** Group `variants` into their display categories in order, dropping empty groups. */
function groupVariants(variants: readonly PromptVariant[]): VariantGroup[] {
  const groups: VariantGroup[] = [];
  for (const group of PROMPT_GROUPS) {
    const questions = variants.filter((v) => v.group === group);
    if (questions.length > 0) groups.push({ group, questions });
  }
  return groups;
}

/** One category heading plus its selectable lead-question buttons. */
function QuestionGroup({
  group,
  questions,
  selectedId,
  onSelect,
}: VariantGroup & { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {group}
      </p>
      {questions.map((v) => (
        <Button
          key={v.id}
          variant="ghost"
          size="sm"
          aria-pressed={v.id === selectedId}
          onClick={() => onSelect(v.id)}
          className={cn(
            "h-auto w-full justify-start whitespace-normal py-1.5 text-left font-normal",
            v.id === selectedId && "bg-accent text-accent-foreground"
          )}
        >
          {v.question}
        </Button>
      ))}
    </div>
  );
}

/** Searchable, grouped picker for the lead question. */
function QuestionPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupVariants(filterVariants(query)), [query]);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          aria-label="Search questions"
          placeholder="Search questions…"
          className="[&_[data-slot=input]]:ps-8"
        />
      </div>

      <ScrollArea className="h-56 rounded-lg border">
        <fieldset className="space-y-3 p-2">
          <legend className="sr-only">Lead question</legend>
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No questions match “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <QuestionGroup key={g.group} {...g} selectedId={selectedId} onSelect={onSelect} />
            ))
          )}
        </fieldset>
      </ScrollArea>
    </>
  );
}

/**
 * Lets the user pick a lead analysis question from the full grouped set and copy
 * one ready-to-paste LLM prompt. The prompt embeds a compact summary of their
 * library once, leads with the chosen question, and lists the rest as paste-able
 * follow-ups. A search box keeps the large question set usable.
 */
export function LlmPromptCard({ data }: { data: DashboardData }) {
  const [selectedId, setSelectedId] = useState<string>(PROMPT_VARIANTS[0].id);
  const imported = useTransactionImport();

  const variant = PROMPT_VARIANTS.find((v) => v.id === selectedId) ?? PROMPT_VARIANTS[0];
  const prompt = useMemo(
    () => buildPrompt(data, variant, imported?.transactions),
    [data, imported, variant]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> Ask an AI about your playtime
        </CardTitle>
        <CardDescription>
          Pick a lead question and copy one ready-to-paste prompt for ChatGPT or Claude. It bundles
          a compact summary of your library once, then lists the other questions as follow-ups you
          can paste straight into the chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <QuestionPicker selectedId={selectedId} onSelect={setSelectedId} />

        <p className="text-sm text-muted-foreground">
          Leads with “{variant.question}”. The rest are added as paste-able follow-ups.
        </p>

        <div className="flex items-start gap-2">
          <Textarea
            readOnly
            rows={8}
            value={prompt}
            aria-label="Prompt preview"
            className="font-mono text-xs"
          />
          <CopyButton value={prompt} label="Copy prompt" />
        </div>
      </CardContent>
    </Card>
  );
}
