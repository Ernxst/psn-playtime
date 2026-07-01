import { Download, Search, Sparkles, SquareArrowOutUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton, useCopied } from "@/features/dashboard/components/copy-button";
import { availableVariants, buildPrompt } from "@/features/dashboard/prompt/llm-prompt";
import {
  MENU_MODE,
  PROMPT_GROUPS,
  type PromptGroup,
  type PromptVariant,
  PROMPT_VARIANTS,
} from "@/features/dashboard/prompt/llm-prompt-catalogue";
import { hasTransactionHistory } from "@/features/dashboard/prompt/llm-transaction-context";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useTransactionImport } from "@/stores/transactions-store";

interface VariantGroup {
  group: PromptGroup;
  questions: PromptVariant[];
}

/** The `variants` matching `query` (case-insensitive on the question text). */
function filterVariants(
  variants: readonly PromptVariant[],
  query: string
): readonly PromptVariant[] {
  const q = query.trim().toLowerCase();
  if (q === "") return variants;
  return variants.filter((v) => v.question.toLowerCase().includes(q));
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

interface QuestionPickerProps {
  variants: readonly PromptVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Searchable, grouped picker for the lead question. */
function QuestionPicker({ variants, selectedId, onSelect }: QuestionPickerProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupVariants(filterVariants(variants, query)), [variants, query]);

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

/** The selectable entry that switches the prompt into no-lead "menu" mode. */
function MenuModeOption({ active, onActivate }: { active: boolean; onActivate: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={active}
      onClick={onActivate}
      className={cn(
        "h-auto w-full justify-start whitespace-normal py-1.5 text-left font-normal",
        active && "bg-accent text-accent-foreground"
      )}
    >
      Let the AI ask me (no specific question)
    </Button>
  );
}

/** The line under the picker describing what the current selection will produce. */
function PromptHint({ menuMode, question }: { menuMode: boolean; question: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {menuMode
        ? "The AI introduces what it can tell you, then presents a grouped menu and asks what to explore first."
        : `Leads with “${question}”. The rest are added as paste-able follow-ups.`}
    </p>
  );
}

/** The download filename for `prompt`, tagged with the sanitised PSN `onlineId`. */
function promptFileName(onlineId: string): string {
  const safeId = onlineId.replace(/[^A-Za-z0-9-_]/g, "");
  return safeId === "" ? "psn-playtime-prompt.md" : `psn-playtime-prompt-${safeId}.md`;
}

/** Download `prompt` as a Markdown file named for the PSN account via a transient object URL. */
function savePromptToFile(prompt: string, onlineId: string) {
  const url = URL.createObjectURL(new Blob([prompt], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = promptFileName(onlineId);
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy `prompt` to the clipboard and open a chat site in a new tab so the user
 * can paste it. The prompt embeds the whole library (routinely ~35k chars), far
 * past any URL length limit, so a `?q=` deep-link would truncate — copy+paste is
 * the only mechanism that works at any size. `window.open` and the clipboard
 * write both fire synchronously inside the click handler: awaiting the clipboard
 * first would drop the user activation and let popup blockers block the tab.
 */
function OpenInChatButton({ prompt, label, url }: { prompt: string; label: string; url: string }) {
  const [copied, flash] = useCopied();

  const openChat = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    void navigator.clipboard.writeText(prompt);
    flash();
  };

  return (
    <Button variant="outline" onClick={openChat} className="gap-2">
      <SquareArrowOutUpRight /> {copied ? "Copied, paste it in the tab" : label}
    </Button>
  );
}

/** The read-only prompt preview plus its copy, save, and open-in-chat buttons. */
function PromptPreview({ prompt, onlineId }: { prompt: string; onlineId: string }) {
  return (
    <div className="flex items-start gap-2">
      <Textarea
        readOnly
        rows={8}
        value={prompt}
        aria-label="Prompt preview"
        className="font-mono text-xs"
      />
      <div className="flex flex-col gap-2">
        <CopyButton value={prompt} label="Copy prompt" />
        <Button
          variant="outline"
          onClick={() => savePromptToFile(prompt, onlineId)}
          className="gap-2"
        >
          <Download /> Save to file
        </Button>
        <OpenInChatButton prompt={prompt} label="Open in ChatGPT" url="https://chatgpt.com/" />
        <OpenInChatButton prompt={prompt} label="Open in Claude" url="https://claude.ai/new" />
        <p className="text-muted-foreground text-xs">
          Opens the chat with your prompt copied. Just paste it in.
        </p>
      </div>
    </div>
  );
}

/**
 * Lets the user pick a lead analysis question from the full grouped set — or the
 * no-lead "menu" option — and copy one ready-to-paste LLM prompt. The prompt
 * embeds a compact summary of their library once, leads with the chosen question
 * (or asks the AI to present a menu), and lists the rest as paste-able follow-ups.
 * A search box keeps the large question set usable.
 */
export function LlmPromptCard({ data }: { data: DashboardData }) {
  const [selectedId, setSelectedId] = useState<string>(PROMPT_VARIANTS[0].id);
  const [menuMode, setMenuMode] = useState(false);
  const imported = useTransactionImport();

  const variants = availableVariants(hasTransactionHistory(imported?.transactions));
  const variant = variants.find((v) => v.id === selectedId) ?? PROMPT_VARIANTS[0];
  const prompt = useMemo(
    () => buildPrompt(data, menuMode ? MENU_MODE : variant, imported?.transactions),
    [data, imported, menuMode, variant]
  );

  const selectQuestion = (id: string) => {
    setSelectedId(id);
    setMenuMode(false);
  };

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
        <MenuModeOption active={menuMode} onActivate={() => setMenuMode(true)} />

        <QuestionPicker
          variants={variants}
          selectedId={menuMode ? "" : selectedId}
          onSelect={selectQuestion}
        />

        <PromptHint menuMode={menuMode} question={variant.question} />

        <PromptPreview prompt={prompt} onlineId={data.profile.onlineId} />
      </CardContent>
    </Card>
  );
}
