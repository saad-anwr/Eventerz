import type { ReactNode } from "react";
import { Background } from "@/components/layout/background";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Shell for the long-form pages - privacy, terms, docs.
 *
 * They are static text, so they get the marketing chrome (background, navbar,
 * footer) rather than the app shell: someone reading the terms has usually not
 * signed in, and may be deciding whether to.
 *
 * Styling lives here rather than in a `prose` plugin because the site does not
 * use `@tailwindcss/typography`, and adding it for three pages would pull a
 * dependency in to restyle text this file can style directly.
 */
export function ProsePage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** ISO date. Rendered long-form; kept as a machine-readable `datetime`. */
  updated?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Background />
      <Navbar />
      <main className="relative">
        <div className="container max-w-3xl py-20 sm:py-28">
          <header className="border-b border-white/10 pb-8">
            <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            {updated && (
              <p className="mt-3 text-sm text-muted-foreground">
                Last updated{" "}
                <time dateTime={updated}>
                  {new Date(updated).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </p>
            )}
            {intro && (
              <div className="mt-5 text-base leading-relaxed text-muted-foreground">
                {intro}
              </div>
            )}
          </header>

          <div
            className={[
              "mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground",
              "[&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white",
              "[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white",
              "[&_p]:mt-4",
              "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-brand-purple/60",
              "[&_ol]:mt-4 [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:marker:text-brand-purple/60",
              "[&_a]:text-brand-cyan [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white",
              "[&_strong]:font-semibold [&_strong]:text-white",
              "[&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-white",
              "[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
              "[&_th]:border-b [&_th]:border-white/15 [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-semibold [&_th]:text-white",
              "[&_td]:border-b [&_td]:border-white/[0.06] [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top",
            ].join(" ")}
          >
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
