import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { buildPrompt, PROMPT_VARIANTS } from "@/lib/psn/llm-prompt";
import type { DashboardData } from "@/lib/psn/types";
import { CopyButton } from "./copy-button";

/**
 * Lets the user pick an analysis question and copy a ready-to-paste LLM prompt
 * (the full structured summary of their playtime) to drop into ChatGPT/Claude.
 */
export function LlmPromptCard({ data }: { data: DashboardData }) {
  const [selectedId, setSelectedId] = useState<string>(PROMPT_VARIANTS[0].id);
  const variant = PROMPT_VARIANTS.find((v) => v.id === selectedId) ?? PROMPT_VARIANTS[0];
  const prompt = useMemo(() => buildPrompt(data, variant), [data, variant]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> Ask an AI about your playtime
        </CardTitle>
        <CardDescription>
          Pick a question and copy a ready-to-paste prompt for ChatGPT or Claude. It bundles a
          compact summary of your library so the AI has the numbers it needs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={selectedId} onValueChange={(next) => setSelectedId(String(next))}>
          <TabsList className="flex-wrap">
            {PROMPT_VARIANTS.map((v) => (
              <TabsTab key={v.id} value={v.id}>
                {v.label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">{variant.description}</p>
        <div className="flex items-center gap-2">
          <Input
            readOnly
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
