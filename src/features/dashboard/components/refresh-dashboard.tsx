import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { normalizeNpsso } from "@/domain/npsso";

interface Props {
  onRefresh: (npsso: string) => Promise<void>;
}

function useRefresh(onRefresh: Props["onRefresh"]) {
  const [open, setOpen] = useState(false);
  const [npsso, setNpsso] = useState("");
  const refresh = useMutation({
    mutationFn: (token: string) => onRefresh(token),
    onSuccess: () => {
      setNpsso("");
      setOpen(false);
      toast.success("PlayStation data refreshed.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Refresh failed. Try again.");
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = normalizeNpsso(npsso);
    if (token) {
      refresh.mutate(token);
    } else {
      toast.error("Paste your npsso token first.");
    }
  }

  return { open, setOpen, npsso, setNpsso, pending: refresh.isPending, submit };
}

function TokenHelp() {
  return (
    <p className="text-sm text-muted-foreground">
      <a
        href="https://www.playstation.com/"
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      >
        Sign in to PlayStation
      </a>{" "}
      in this browser, then copy the npsso value from the{" "}
      <a
        href="https://ca.account.sony.com/api/v1/ssocookie"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      >
        SSO cookie page <ExternalLink className="size-3" />
      </a>
      .
    </p>
  );
}

function TokenField({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return (
    <Field>
      <FieldLabel>npsso token</FieldLabel>
      <FieldControl
        render={
          <Input
            type="password"
            value={refresh.npsso}
            onChange={(event) => refresh.setNpsso(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={refresh.pending}
            placeholder="Paste your fresh npsso value"
          />
        }
      />
      <FieldDescription>
        The token is sent once for this refresh, then discarded. It is never stored.
      </FieldDescription>
    </Field>
  );
}

function RefreshSheet({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return (
    <SheetPopup side="right">
      <SheetHeader>
        <SheetTitle>Refresh PlayStation data</SheetTitle>
        <SheetDescription>
          Load your latest playtime and trophies without storing your token.
        </SheetDescription>
      </SheetHeader>
      <SheetPanel>
        <form id="refresh-dashboard" className="space-y-4" onSubmit={refresh.submit}>
          <TokenHelp />
          <TokenField refresh={refresh} />
        </form>
      </SheetPanel>
      <SheetFooter>
        <SheetClose render={<Button variant="outline" />} disabled={refresh.pending}>
          Cancel
        </SheetClose>
        <Button type="submit" form="refresh-dashboard" loading={refresh.pending}>
          Refresh data
        </Button>
      </SheetFooter>
    </SheetPopup>
  );
}

export function RefreshDashboard({ onRefresh }: Props) {
  const refresh = useRefresh(onRefresh);
  return (
    <Sheet open={refresh.open} onOpenChange={refresh.setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        <RefreshCw /> Refresh
      </SheetTrigger>
      <RefreshSheet refresh={refresh} />
    </Sheet>
  );
}
