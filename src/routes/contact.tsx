import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Request access — Wakilio" },
      {
        name: "description",
        content:
          "Tell us about your practice — court, bench and team size — and we will arrange onboarding for Wakilio.",
      },
      { property: "og:title", content: "Request access — Wakilio" },
      {
        property: "og:description",
        content:
          "Tell us about your practice and we will arrange onboarding for Wakilio.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-eyebrow text-accent">Onboarding</p>
            <h1 className="mt-4 text-3xl font-bold">Request access</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              We onboard chambers court by court so cause-list coverage is verified before you rely
              on it. Tell us where you practise and we will confirm coverage for your bench.
            </p>
            <dl className="mt-9 space-y-4 text-sm">
              <div>
                <dt className="font-semibold">Email</dt>
                <dd className="text-muted-foreground">chambers@wakilio.in</dd>
              </div>
              <div>
                <dt className="font-semibold">Support hours</dt>
                <dd className="text-muted-foreground">Mon–Sat, 9:00–20:00 IST</dd>
              </div>
            </dl>
          </div>

          <form
            className="surface-panel space-y-5 rounded p-8"
            onSubmit={(event) => {
              event.preventDefault();
              toast.success("Request noted", {
                description: "This prototype does not send messages yet.",
              });
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required placeholder="Adv. Priya Nair" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enrolment">Bar Council enrolment no.</Label>
                <Input id="enrolment" placeholder="D/1234/2016" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required placeholder="you@chambers.in" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile</Label>
                <Input id="phone" required placeholder="+91 98xxx xxxxx" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="court">Primary court / bench</Label>
              <Input id="court" placeholder="Delhi High Court" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Tell us about your practice</Label>
              <Textarea
                id="note"
                rows={4}
                placeholder="Team size, practice areas, how you keep your diary today."
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
            >
              Send request
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
