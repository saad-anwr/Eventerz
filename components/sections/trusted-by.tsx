import { Marquee } from "@/components/ui/marquee";
import { trustedBy } from "@/lib/data";

export function TrustedBy() {
  return (
    <section className="relative py-14">
      <div className="container">
        <p className="text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Powering events across the Solana ecosystem
        </p>
      </div>

      <div className="relative mt-8">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-brand-bg to-transparent sm:w-40" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-brand-bg to-transparent sm:w-40" />

        <Marquee>
          {trustedBy.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2.5 opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <span className="size-3.5 rounded-[3px] bg-brand-gradient" />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-white/90">
                {name}
              </span>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
