import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import type React from "react";
import { Card } from "@/components/ui/card";

function CalloutPoints(): React.ReactElement {
  return (
    <ul className="space-y-2 text-foreground">
      <li>
        The token grants{" "}
        <strong className="font-semibold">full access to your PlayStation account</strong>. Treat it
        exactly like a password.
      </li>
      <li>
        <strong className="font-semibold">Never share it</strong> with anyone, and never post a
        screenshot of it.
      </li>
      <li>
        A token is <strong className="font-semibold">required</strong> to see your own data. Without
        one, you get the demo only (always available).
      </li>
      <li>
        If you{" "}
        <strong className="font-semibold">do not trust this app, do not enter your token</strong>.
        Explore the{" "}
        <Link to="/dashboard" className="text-primary underline-offset-4 hover:underline">
          demo
        </Link>{" "}
        instead.
      </li>
    </ul>
  );
}

export function SecurityCallout(): React.ReactElement {
  return (
    <Card className="border-destructive/50 bg-destructive/5 p-5 shadow-none before:hidden">
      <div className="flex gap-3">
        <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-destructive">
            Your npsso token is like a password. Read this first.
          </p>
          <CalloutPoints />
          <p className="text-muted-foreground">
            For reassurance: your token is sent only to Sony's API and stored in an httpOnly session
            cookie. It is never persisted on our server and never exposed to the browser.
          </p>
        </div>
      </div>
    </Card>
  );
}
