import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import HomeCodeForm from "@/components/home/HomeCodeForm";
import { Container } from "@/components/layout/Container";
import { Button, Card } from "@/components/ui";
import { WHATSAPP_CHANNEL_URL } from "@/lib/navigation";
import { agenoverseUrl } from "@/lib/utils";

const STEPS = [
  {
    title: "Find your quiz",
    body: "Pick one from the list, or enter the access code you were given.",
  },
  {
    title: "Sign in",
    body: "An account keeps every attempt and result together in one place.",
  },
  {
    title: "Answer on the clock",
    body: "Choose a level and begin. Your answers save as you go, so a reload picks up where you left off.",
  },
  {
    title: "See how you did",
    body: "Your score arrives as soon as you submit, with a review of each question when the quiz allows it.",
  },
];

const PROMISES = [
  {
    label: "// THE CLOCK",
    title: "The server keeps time",
    body: "Changing the clock on your device doesn't give anyone extra minutes, or take yours away.",
  },
  {
    label: "// THE ANSWERS",
    title: "Answers stay on the server",
    body: "The right answers never reach your browser until you've submitted.",
  },
  {
    label: "// YOUR PROGRESS",
    title: "Nothing is lost",
    body: "Close the tab or lose your connection and you can come back to the same attempt.",
  },
];

/** Landing page. A server component: the only script it loads is the access-code field. */
export default function Home() {
  return (
    <div className="flex-1 bg-bg text-text">
      {/* Hero */}
      <section className="relative overflow-hidden border-border border-b">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden="true"
          className="glow-teal pointer-events-none absolute -top-40 right-0 size-[34rem] max-sm:hidden"
        />
        <Container className="relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-24">
          <div className="rise">
            <p className="text-label">{"// ASSESSMENT BY AGENOVERSE"}</p>
            <h1 className="mt-4 text-5xl">
              Take the quiz. See where you{" "}
              <em className="font-normal font-serif text-link italic">stand.</em>
            </h1>
            <p className="mt-6 max-w-[65ch] text-lg text-text-body">
              Ageno Quiz is the assessment space of Agenoverse. Join with an access code or pick a
              quiz from the list, answer against the clock, and get your score with a
              question-by-question review.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/join">
                  Join a quiz
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#enter-code">Enter code</a>
              </Button>
              {/* TEMPORARY: remove with WHATSAPP_CHANNEL_URL in lib/navigation.ts */}
              <Button asChild size="lg" variant="ghost" className="border border-control-border">
                <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                  Join the channel
                  <ArrowUpRight className="size-5" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <Card id="enter-code" className="rise p-6 [--d:120ms] sm:p-8">
            <p className="text-label">{"// ACCESS CODE"}</p>
            <h2 className="mt-2 text-2xl">Have a code?</h2>
            <p className="mt-2 mb-5 text-text-muted">
              Whoever is running the quiz shares it with you. Type it here and you&apos;ll land in
              the quiz.
            </p>
            <HomeCodeForm />
          </Card>
        </Container>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="border-border border-b">
        <Container className="py-16 sm:py-20">
          <p className="text-label">{"// HOW IT WORKS"}</p>
          <h2 id="how-heading" className="mt-2 text-3xl sm:text-4xl">
            From code to result
          </h2>
          <ol className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-border border-t pt-5">
                <span className="font-mono text-link text-sm tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-lg">{step.title}</h3>
                <p className="mt-2 text-text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Fair and calm */}
      <section aria-labelledby="fair-heading" className="border-border border-b">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
          <div>
            <p className="text-label">{"// BUILT FOR EXAMS"}</p>
            <h2 id="fair-heading" className="mt-2 text-3xl sm:text-4xl">
              Calm for you, fair for everyone
            </h2>
            <p className="mt-4 max-w-[65ch] text-text-muted">
              Whoever sets a quiz can run it in practice mode or strict mode, and decide whether you
              see the review afterwards.
            </p>
          </div>
          <dl className="divide-y divide-border border-border border-y">
            {PROMISES.map((item) => (
              <div key={item.title} className="grid gap-1 py-5 sm:grid-cols-[9.5rem_1fr] sm:gap-6">
                <dt className="text-label pt-1">{item.label}</dt>
                <dd>
                  <p className="font-medium text-text">{item.title}</p>
                  <p className="mt-1 text-text-muted">{item.body}</p>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Community: the one amber moment on the page */}
      <section aria-labelledby="community-heading">
        <Container className="py-16 sm:py-20">
          <div className="flex flex-col gap-6 rounded-lg border border-border border-l-4 border-l-warm bg-surface p-6 sm:p-10 md:flex-row md:items-center md:justify-between md:gap-10">
            <div className="max-w-[65ch]">
              <p className="text-label text-warm-text">{"// AGENOVERSE COMMUNITY"}</p>
              <h2 id="community-heading" className="mt-2 text-2xl sm:text-3xl">
                Practice with the Agenoverse community
              </h2>
              <p className="mt-3 text-text-body">
                Ageno Quiz is part of Agenoverse. Build with AI. Learn with AI. Rise together.
              </p>
            </div>
            <Button asChild variant="warm" size="lg" className="shrink-0 self-start md:self-auto">
              <a href={agenoverseUrl("/community")} target="_blank" rel="noopener noreferrer">
                Meet the community
                <ArrowUpRight className="size-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </Container>
      </section>
    </div>
  );
}
