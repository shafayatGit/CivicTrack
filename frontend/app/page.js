import {
  ArrowRight,
  ClipboardList,
  Megaphone,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import LinkButton from "@/components/Modules/Common/LinkButton";
import SiteHeader from "@/components/Modules/Layout/SiteHeader";
import SiteFooter from "@/components/Modules/Layout/SiteFooter";

const STEPS = [
  {
    icon: Megaphone,
    title: "Report it",
    body: "Describe the problem, name the ward and category, and pin the exact spot on the map. CivicTrack checks for duplicate reports nearby first.",
  },
  {
    icon: ClipboardList,
    title: "Watch it move",
    body: "Every status change is recorded with who made it and when, so the trail from Reported to Resolved is public and auditable.",
  },
  {
    icon: MessageSquare,
    title: "Stay in the loop",
    body: "Staff and admins coordinate in a live thread attached to the issue, so nothing is resolved in a private inbox.",
  },
];

const ROLES = [
  {
    icon: Megaphone,
    title: "Citizens",
    body: "File reports with photos and location, then follow each one through resolution.",
  },
  {
    icon: ShieldCheck,
    title: "Staff",
    body: "Get assigned issues for your department and advance them through the workflow.",
  },
  {
    icon: ClipboardList,
    title: "Admins",
    body: "Route issues to the right department and keep the reporting data honest.",
  },
];

const Home = () => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader />

    <main className="flex-1">
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24">
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            Civic issue tracking for your community
          </Badge>

          <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Report what is broken. Watch who fixes it.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
            CivicTrack gives citizens a place to raise street, sanitation and
            utility problems with evidence attached — and gives departments an
            auditable queue for resolving them.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/register" size="lg">
              Create an account
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
            <LinkButton href="/login" size="lg" variant="outline">
              Sign in
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 space-y-2 text-center">
          <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
            How it works
          </h2>
          <p className="text-muted-foreground">
            Three steps from a broken street to a closed report.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="font-heading">
                  <span className="text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}.
                  </span>{" "}
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {body}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-8 space-y-2 text-center">
            <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
              Built for three sides of the problem
            </h2>
            <p className="text-muted-foreground">
              The same platform, three different views of the work.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {ROLES.map(({ icon: Icon, title, body }) => (
              <Card key={title} size="sm" className="h-full">
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="font-heading">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {body}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
);

export default Home;
