import { Download, Search, Sparkles, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

/** The display group that holds `id`, falling back to the first group. */
function groupOf(variants: readonly PromptVariant[], id: string): PromptGroup {
  return variants.find((v) => v.id === id)?.group ?? PROMPT_GROUPS[0];
}

/** A selectable picker row: a lead question or the pinned menu-mode entry. */
function PickerButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-auto w-full justify-start whitespace-normal py-1.5 text-left font-normal",
        selected && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </Button>
  );
}

/** One collapsible category section: its name and count plus its question buttons. */
function QuestionSection({
  group,
  questions,
  selectedId,
  onSelect,
}: VariantGroup & { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <AccordionItem value={group} className="border-b-0">
      <AccordionHeader>
        <AccordionTrigger className="px-1">
          <span className="flex items-baseline gap-2">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {group}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">{questions.length}</span>
          </span>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent className="space-y-1 pb-1">
        {questions.map((v) => (
          <PickerButton key={v.id} selected={v.id === selectedId} onClick={() => onSelect(v.id)}>
            {v.question}
          </PickerButton>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

interface QuestionSectionsProps {
  groups: VariantGroup[];
  query: string;
  selectedId: string;
  onSelect: (id: string) => void;
  value: string[];
  onValueChange: (value: string[]) => void;
}

/** The empty state, or the controlled multi-open accordion of category sections. */
function QuestionSections({
  groups,
  query,
  selectedId,
  onSelect,
  value,
  onValueChange,
}: QuestionSectionsProps) {
  if (groups.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        No questions match “{query}”.
      </p>
    );
  }
  return (
    <Accordion multiple value={value} onValueChange={onValueChange}>
      {groups.map((g) => (
        <QuestionSection key={g.group} {...g} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </Accordion>
  );
}

/** The search box for narrowing the question list. */
function QuestionSearch({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.currentTarget.value)}
        aria-label="Search questions"
        placeholder="Search questions…"
        className="[&_[data-slot=input]]:ps-8"
      />
    </div>
  );
}

interface QuestionPickerProps {
  variants: readonly PromptVariant[];
  selectedId: string;
  menuMode: boolean;
  onSelect: (id: string) => void;
  onMenuMode: () => void;
}

/**
 * Searchable picker with a pinned no-lead menu entry over collapsible category
 * sections. The accordion's open value is DERIVED each render (no effect): while
 * searching, every group with a match is expanded so results are never hidden;
 * otherwise it is the user-toggled set, which defaults to the selected question's
 * group. `onValueChange` records toggles only when not searching, so clearing the
 * query reverts to that default. Nothing here reads an external system, so there
 * is nothing for `useSyncExternalStore` or a `useEffect` to do.
 */
function QuestionPicker({
  variants,
  selectedId,
  menuMode,
  onSelect,
  onMenuMode,
}: QuestionPickerProps) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>(() => [groupOf(variants, selectedId)]);
  const groups = useMemo(() => groupVariants(filterVariants(variants, query)), [variants, query]);
  const searching = query.trim() !== "";
  const value = useMemo(
    () => (searching ? groups.map((g) => g.group) : openGroups),
    [searching, groups, openGroups]
  );

  return (
    <>
      <QuestionSearch query={query} onQuery={setQuery} />
      <ScrollArea className="h-56 rounded-lg border">
        <fieldset className="space-y-1 p-2">
          <legend className="sr-only">Lead question</legend>
          <PickerButton selected={menuMode} onClick={onMenuMode}>
            Let the AI ask me (no specific question)
          </PickerButton>
          <QuestionSections
            groups={groups}
            query={query}
            selectedId={menuMode ? "" : selectedId}
            onSelect={onSelect}
            value={value}
            onValueChange={(next) => {
              if (!searching) setOpenGroups(next);
            }}
          />
        </fieldset>
      </ScrollArea>
    </>
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

interface OpenInChatButtonProps {
  prompt: string;
  /** Idle button text, e.g. "Open in ChatGPT". */
  label: string;
  /** Chat site opened in a new tab once the copy succeeds. */
  url: string;
  /** Site name woven into the inline failure/blocked messages, e.g. "ChatGPT". */
  site: string;
}

/**
 * Copy `prompt` to the clipboard, then open a chat site in a new tab so the user
 * can paste it. The prompt embeds the whole library (routinely ~35k chars), far
 * past any URL length limit, so a `?q=` deep-link would truncate. Copy+paste is
 * the only mechanism that works at any size.
 *
 * The copy is awaited FIRST and the tab is only opened once it definitely
 * succeeds: navigating implies the clipboard holds the prompt. We accept the
 * small popup-block risk of writing before opening because the alternative
 * (open first) sends focus to the new tab, where the user can never see a
 * success or error message on the page they left. The clipboard write can reject
 * (Safari, denied permission, non-secure context) or be missing entirely; on any
 * failure we do NOT navigate and surface an inline message on the current page so
 * the user can fall back to the Copy prompt button. If the write succeeds but the
 * popup is blocked (`window.open` returns null) the user is still here, so we tell
 * them the prompt is copied and to open the site manually.
 */
function OpenInChatButton({ prompt, label, url, site }: OpenInChatButtonProps) {
  const [flashed, flash] = useCopied();
  const [status, setStatus] = useState<"blocked" | "error">("error");

  const openChat = () => {
    if (!navigator.clipboard?.writeText) {
      setStatus("error");
      flash();
      return;
    }
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        if (!window.open(url, "_blank", "noopener,noreferrer")) {
          setStatus("blocked");
          flash();
        }
      })
      .catch(() => {
        setStatus("error");
        flash();
      });
  };

  const text = !flashed
    ? label
    : status === "blocked"
      ? `Prompt copied. Open ${site} and paste it in.`
      : `Couldn't copy, click Copy prompt then open ${site}.`;

  return (
    <Button variant="outline" onClick={openChat} className="flex-1 gap-2 sm:flex-none">
      <SquareArrowOutUpRight /> {text}
    </Button>
  );
}

/** A muted, one-line caption describing the action group it sits under. */
function ActionCaption({ children }: { children: string }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

/**
 * The copy, open-in-chat, and download action groups. Each group owns its caption;
 * `gap-4` between the groups keeps it obvious which caption belongs to which action
 * in both layouts. The two Open buttons wrap together on mobile and stack in the
 * column from `sm` up.
 */
function PromptActions({ prompt, onlineId }: { prompt: string; onlineId: string }) {
  return (
    <div className="flex w-full flex-col gap-4 sm:w-auto">
      <div className="flex flex-col gap-1">
        <CopyButton value={prompt} label="Copy prompt" />
        <ActionCaption>Copy the full prompt to paste into any AI chat.</ActionCaption>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2 sm:flex-col">
          <OpenInChatButton
            prompt={prompt}
            label="Open in ChatGPT"
            url="https://chatgpt.com/"
            site="ChatGPT"
          />
          <OpenInChatButton
            prompt={prompt}
            label="Open in Claude"
            url="https://claude.ai/new"
            site="Claude"
          />
        </div>
        <ActionCaption>Opens the chat with your prompt copied. Just paste it in.</ActionCaption>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          onClick={() => savePromptToFile(prompt, onlineId)}
          className="gap-2"
        >
          <Download /> Download (.md)
        </Button>
        <ActionCaption>
          Attach it in ChatGPT or Claude, best for very large prompts, or keep a copy.
        </ActionCaption>
      </div>
    </div>
  );
}

/** The read-only prompt preview beside its copy, download, and open-in-chat actions. */
function PromptPreview({ prompt, onlineId }: { prompt: string; onlineId: string }) {
  // Stacks on mobile (textarea over the action groups) so neither is squashed, and
  // sits side-by-side (textarea beside the button column) from `sm` up.
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <Textarea
        readOnly
        rows={8}
        value={prompt}
        aria-label="Prompt preview"
        className="w-full font-mono text-xs"
      />
      <PromptActions prompt={prompt} onlineId={onlineId} />
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
        <QuestionPicker
          variants={variants}
          selectedId={selectedId}
          menuMode={menuMode}
          onSelect={selectQuestion}
          onMenuMode={() => setMenuMode(true)}
        />

        <PromptHint menuMode={menuMode} question={variant.question} />

        <PromptPreview prompt={prompt} onlineId={data.profile.onlineId} />
      </CardContent>
    </Card>
  );
}
