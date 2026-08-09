import { ChevronDown, Download, Search, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransactionRow } from "@/domain/transactions";
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
  return variants.filter((variant) => variant.question.toLowerCase().includes(q));
}

/** Group `variants` into their display categories in catalogue order, dropping empty groups. */
function groupVariants(variants: readonly PromptVariant[]): VariantGroup[] {
  const groups: VariantGroup[] = [];
  for (const group of PROMPT_GROUPS) {
    const questions = variants.filter((variant) => variant.group === group);
    if (questions.length > 0) groups.push({ group, questions });
  }
  return groups;
}

/** A native radio styled as an open-catalogue row. */
function PickerRadio({
  accessibleName,
  checked,
  name,
  onChange,
  children,
}: {
  accessibleName?: string;
  checked: boolean;
  name: string;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="relative block min-h-11 w-full cursor-pointer border-l-2 border-l-transparent bg-transparent px-3 py-2.5 text-left font-normal text-foreground/75 transition-colors hover:bg-primary/6 hover:text-foreground has-checked:border-l-primary has-checked:bg-primary/8 has-checked:font-medium has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-[-2px] has-focus-visible:outline-ring sm:min-h-10">
      <input
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
        type="radio"
        aria-label={accessibleName}
        name={name}
        checked={checked}
        onChange={onChange}
      />
      <span className="pointer-events-none">{children}</span>
    </label>
  );
}

interface QuestionGroupProps extends VariantGroup {
  selectedId: string;
  choiceName: string;
  query: string;
  open: boolean;
  onOpenChange: (group: PromptGroup, open: boolean) => void;
  onSelect: (id: string) => void;
}

interface QuestionGroupSummaryProps {
  group: PromptGroup;
  questionCount: number;
  hasSelectedQuestion: boolean;
  query: string;
  open: boolean;
  onOpenChange: (group: PromptGroup, open: boolean) => void;
}

function QuestionGroupSummary({
  group,
  questionCount,
  hasSelectedQuestion,
  query,
  open,
  onOpenChange,
}: QuestionGroupSummaryProps) {
  return (
    <summary
      className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      onClick={(event) => {
        event.preventDefault();
        if (query === "") onOpenChange(group, !open);
      }}
    >
      <span className="font-bold text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
        {group}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">{questionCount}</span>
      {hasSelectedQuestion ? <span className="text-primary text-xs">Selected</span> : null}
      <span className="ml-auto shrink-0 text-primary text-xs font-medium group-open:hidden">
        Show questions
      </span>
      <span className="ml-auto hidden shrink-0 text-primary text-xs font-medium group-open:block">
        Hide questions
      </span>
      <ChevronDown
        className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
  );
}

/** A native disclosure section with its active question still visible in the catalogue outline. */
function QuestionGroup({
  group,
  questions,
  selectedId,
  choiceName,
  query,
  open,
  onOpenChange,
  onSelect,
}: QuestionGroupProps) {
  return (
    <details className="group border-t border-[var(--playloom-rule)]" open={open}>
      <QuestionGroupSummary
        group={group}
        questionCount={questions.length}
        hasSelectedQuestion={questions.some((question) => question.id === selectedId)}
        query={query}
        open={open}
        onOpenChange={onOpenChange}
      />
      <div className="pb-3 pt-1">
        {questions.map((variant) => (
          <PickerRadio
            key={variant.id}
            accessibleName={
              variant.id === "last-12-months"
                ? "Summarise my latest year of gaming versus the year before."
                : undefined
            }
            checked={variant.id === selectedId}
            name={choiceName}
            onChange={() => onSelect(variant.id)}
          >
            {variant.question}
          </PickerRadio>
        ))}
      </div>
    </details>
  );
}

function useOpenQuestionGroups() {
  const [openGroups, setOpenGroups] = useState(() => new Set<PromptGroup>());

  const setGroupOpen = (group: PromptGroup, open: boolean) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(group);
      else next.delete(group);
      return next;
    });
  };

  return { openGroups, setGroupOpen };
}

/** The explicit no-result state or the full, grouped question catalogue. */
function QuestionGroups({
  groups,
  query,
  selectedId,
  choiceName,
  onSelect,
}: {
  groups: VariantGroup[];
  query: string;
  selectedId: string;
  choiceName: string;
  onSelect: (id: string) => void;
}) {
  const { openGroups, setGroupOpen } = useOpenQuestionGroups();

  if (groups.length === 0) {
    return (
      <output className="block w-full border-t border-[var(--playloom-rule)] px-1 py-8 text-pretty text-sm text-muted-foreground">
        No questions match “{query}”.
      </output>
    );
  }

  return groups.map((group) => (
    <QuestionGroup
      key={group.group}
      {...group}
      selectedId={selectedId}
      choiceName={choiceName}
      query={query}
      open={query !== "" || openGroups.has(group.group)}
      onOpenChange={setGroupOpen}
      onSelect={onSelect}
    />
  ));
}

/** The labelled search control for narrowing the question catalogue. */
function QuestionSearch({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  const id = useId();

  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        className="font-bold text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]"
      >
        Search questions
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          placeholder="Filter by topic or phrase…"
          className="rounded-none border-x-0 border-t-0 border-b-[var(--playloom-rule-strong)] bg-transparent shadow-none before:hidden has-focus-visible:border-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-focus-visible:ring-0 [&_[data-slot=input]]:ps-8"
        />
      </div>
    </div>
  );
}

interface QuestionChoicesProps {
  groups: VariantGroup[];
  selectedId: string;
  menuMode: boolean;
  query: string;
  choiceGroupId: string;
  choiceName: string;
  onSelect: (id: string) => void;
  onMenuMode: () => void;
}

function QuestionChoices({
  groups,
  selectedId,
  menuMode,
  query,
  choiceGroupId,
  choiceName,
  onSelect,
  onMenuMode,
}: QuestionChoicesProps) {
  return (
    <fieldset>
      <legend id={choiceGroupId} className="sr-only">
        Lead question
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={choiceGroupId}
        className="max-h-[28rem] overflow-y-auto overscroll-y-contain border-b border-[var(--playloom-rule)]"
      >
        <div className="border-t border-[var(--playloom-rule)]">
          <PickerRadio checked={menuMode} name={choiceName} onChange={onMenuMode}>
            Start with a general analysis
          </PickerRadio>
        </div>
        <QuestionGroups
          groups={groups}
          query={query}
          selectedId={menuMode ? "" : selectedId}
          choiceName={choiceName}
          onSelect={onSelect}
        />
      </div>
    </fieldset>
  );
}

function QuestionPicker({
  variants,
  selectedId,
  menuMode,
  onSelect,
  onMenuMode,
}: {
  variants: readonly PromptVariant[];
  selectedId: string;
  menuMode: boolean;
  onSelect: (id: string) => void;
  onMenuMode: () => void;
}) {
  const [query, setQuery] = useState("");
  const choiceGroupId = useId();
  const choiceName = `lead-question-${choiceGroupId}`;
  const groups = useMemo(() => groupVariants(filterVariants(variants, query)), [variants, query]);

  return (
    <div className="grid gap-4">
      <QuestionSearch query={query} onQuery={setQuery} />
      <QuestionChoices
        groups={groups}
        selectedId={selectedId}
        menuMode={menuMode}
        query={query}
        choiceGroupId={choiceGroupId}
        choiceName={choiceName}
        onSelect={onSelect}
        onMenuMode={onMenuMode}
      />
    </div>
  );
}

/** The line under the catalogue describing what the current selection will produce. */
function PromptHint({ menuMode, question }: { menuMode: boolean; question: string }) {
  return (
    <p className="text-pretty text-sm leading-6 text-muted-foreground">
      {menuMode
        ? "The AI introduces what it can tell you, then presents a grouped menu and asks what to explore first."
        : `Leads with “${question}”. The rest stay in the document as ready-to-paste follow-ups.`}
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
  label: string;
  url: string;
  site: string;
}

/** Copy the complete prompt before opening a chat destination, surfacing both failure modes inline. */
function OpenInChatButton({ prompt, label, url, site }: OpenInChatButtonProps) {
  const [flashed, flash] = useCopied();
  const [status, setStatus] = useState<"blocked" | "error">("error");

  const openChat = () => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- feature detection protects non-secure browser contexts despite the DOM type
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
    <Button
      variant="link"
      onClick={openChat}
      className="h-auto min-h-11 flex-1 justify-start whitespace-normal rounded-none px-0 text-left text-primary shadow-none before:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 sm:min-h-10 sm:flex-none"
    >
      <SquareArrowOutUpRight aria-hidden="true" /> {text}
    </Button>
  );
}

function ActionCaption({ children }: { children: string }) {
  return <p className="text-pretty text-muted-foreground text-xs leading-5">{children}</p>;
}

function ActionRow({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="grid gap-2 border-t border-[var(--playloom-rule)] py-4 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      {children}
      <ActionCaption>{caption}</ActionCaption>
    </div>
  );
}

/** The retained actions are a utility list with one primary action, not equal buttons. */
function PromptActions({ prompt, onlineId }: { prompt: string; onlineId: string }) {
  return (
    <fieldset className="min-w-0 border-y border-[var(--playloom-rule-strong)]">
      <legend className="sr-only">Prompt actions</legend>
      <ActionRow caption="Copy the full prompt to paste into any AI chat.">
        <CopyButton
          value={prompt}
          label="Copy prompt"
          className="min-h-11 rounded-none border-primary bg-primary text-primary-foreground before:rounded-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 sm:min-h-10"
        />
      </ActionRow>
      <ActionRow caption="Opens the chat with your prompt copied. Just paste it in.">
        <div className="flex flex-wrap gap-x-4">
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
      </ActionRow>
      <ActionRow caption="Attach it in ChatGPT or Claude, best for very large prompts, or keep a copy.">
        <Button
          variant="link"
          onClick={() => savePromptToFile(prompt, onlineId)}
          className="h-auto min-h-11 justify-start rounded-none px-0 text-primary shadow-none before:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 sm:min-h-10"
        >
          <Download aria-hidden="true" /> Download (.md)
        </Button>
      </ActionRow>
    </fieldset>
  );
}

/** The generated prompt rendered as a readable, keyboard-scrollable document. */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- the overflowed prompt document must be keyboard-scrollable */
function PromptDocument({ prompt, pending }: { prompt: string; pending: boolean }) {
  return (
    <article
      aria-label="Prompt preview"
      aria-busy={pending || undefined}
      tabIndex={0}
      className="max-h-[32rem] overflow-auto border-y border-[var(--playloom-rule)] bg-[var(--playloom-paper-raised)] px-4 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5"
    >
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground/85">
        {prompt}
      </pre>
    </article>
  );
}
/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */

function PromptPreviewHeader({ pending }: { pending: boolean }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-bold text-[0.6875rem] text-primary uppercase tracking-[0.14em]">
          Generated document
        </p>
        <h3 id="prompt-document-heading" className="mt-1 text-xl font-semibold text-balance">
          Prompt preview
        </h3>
      </div>
      <output
        aria-live="polite"
        className="font-bold text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]"
      >
        {pending ? "Generating prompt…" : "Prompt ready"}
      </output>
    </header>
  );
}

function PromptPreview({
  prompt,
  onlineId,
  pending,
}: {
  prompt: string;
  onlineId: string;
  pending: boolean;
}) {
  return (
    <section
      aria-labelledby="prompt-document-heading"
      className="min-w-0 border-t border-[var(--playloom-rule-strong)] py-6 lg:border-t-0 lg:border-l lg:py-8 lg:pl-8"
    >
      <PromptPreviewHeader pending={pending} />
      <p className="mb-5 max-w-[58ch] text-pretty text-sm leading-6 text-muted-foreground">
        This document is read-only. Copy it into an AI chat, open a supported chat with it copied,
        or save the Markdown file.
      </p>
      <PromptDocument prompt={prompt} pending={pending} />
      <div className="mt-5">
        <PromptActions prompt={prompt} onlineId={onlineId} />
      </div>
    </section>
  );
}

function QuestionCatalogueHeader() {
  return (
    <header className="mb-6">
      <p className="font-bold text-[0.6875rem] text-primary uppercase tracking-[0.14em]">
        Question catalogue
      </p>
      <h3 id="question-catalogue-heading" className="mt-1 text-xl font-semibold text-balance">
        Choose a question
      </h3>
      <p className="mt-3 max-w-[48ch] text-pretty text-sm leading-6 text-muted-foreground">
        Search the full catalogue, then choose the question that should lead your analysis.
      </p>
    </header>
  );
}

function QuestionCatalogue({
  variants,
  selectedId,
  menuMode,
  question,
  onSelect,
  onMenuMode,
}: {
  variants: readonly PromptVariant[];
  selectedId: string;
  menuMode: boolean;
  question: string;
  onSelect: (id: string) => void;
  onMenuMode: () => void;
}) {
  return (
    <section aria-labelledby="question-catalogue-heading" className="min-w-0 py-6 lg:py-8 lg:pr-8">
      <QuestionCatalogueHeader />
      <QuestionPicker
        variants={variants}
        selectedId={selectedId}
        menuMode={menuMode}
        onSelect={onSelect}
        onMenuMode={onMenuMode}
      />
      <div className="mt-5 border-t border-[var(--playloom-rule)] pt-4">
        <PromptHint menuMode={menuMode} question={question} />
      </div>
    </section>
  );
}

function PromptWorkspace({
  variants,
  selectedId,
  menuMode,
  question,
  onSelect,
  onMenuMode,
  prompt,
  onlineId,
  pending,
}: {
  variants: readonly PromptVariant[];
  selectedId: string;
  menuMode: boolean;
  question: string;
  onSelect: (id: string) => void;
  onMenuMode: () => void;
  prompt: string;
  onlineId: string;
  pending: boolean;
}) {
  return (
    <div className="border-y border-[var(--playloom-rule-strong)]">
      <div className="grid min-w-0 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.15fr)]">
        <QuestionCatalogue
          variants={variants}
          selectedId={selectedId}
          menuMode={menuMode}
          question={question}
          onSelect={onSelect}
          onMenuMode={onMenuMode}
        />
        <PromptPreview prompt={prompt} onlineId={onlineId} pending={pending} />
      </div>
    </div>
  );
}

function PromptCard({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions: readonly TransactionRow[] | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string>(PROMPT_VARIANTS[0].id);
  const [menuMode, setMenuMode] = useState(true);
  const [isPending, startTransition] = useTransition();
  const variants = availableVariants(hasTransactionHistory(transactions));
  const variant = variants.find((candidate) => candidate.id === selectedId) ?? PROMPT_VARIANTS[0];
  const prompt = useMemo(
    () => buildPrompt(data, menuMode ? MENU_MODE : variant, transactions),
    [data, menuMode, transactions, variant]
  );

  const selectQuestion = (id: string) => {
    startTransition(() => {
      setSelectedId(id);
      setMenuMode(false);
    });
  };

  const selectMenuMode = () => {
    startTransition(() => setMenuMode(true));
  };

  return (
    <PromptWorkspace
      variants={variants}
      selectedId={selectedId}
      menuMode={menuMode}
      question={variant.question}
      onSelect={selectQuestion}
      onMenuMode={selectMenuMode}
      prompt={prompt}
      onlineId={data.profile.onlineId}
      pending={isPending}
    />
  );
}

function StoredPromptCard({ data }: { data: DashboardData }) {
  const imported = useTransactionImport(data.profile.accountId);
  return <PromptCard data={data} transactions={imported?.transactions} />;
}

export function LlmPromptCard({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions?: readonly TransactionRow[];
}) {
  if (transactions) return <PromptCard data={data} transactions={transactions} />;
  return <StoredPromptCard data={data} />;
}
