"use client";

/**
 * Last-resort boundary.
 *
 * `error.tsx` handles a route that throws, but it renders *inside* the root
 * layout - so it cannot catch an error thrown by the root layout itself, or by
 * one of the providers wrapped around it (wallet, auth, React Query). Those
 * failures escape to here, and without this file they reach Next's built-in
 * fallback: a white page reading "Application error: a client-side exception
 * has occurred".
 *
 * This replaces the entire document, which is why it declares its own `<html>`
 * and `<body>` - the root layout is exactly what has failed, so nothing from it
 * is available. That also means no fonts, no Tailwind config and no components:
 * every style here is inline, and every one of them has to be, because the
 * stylesheet is part of what may not have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#050816",
          color: "#e2e8f0",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto",
              borderRadius: 14,
              background: "rgba(153, 69, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
            aria-hidden="true"
          >
            !
          </div>

          <h1
            style={{
              margin: "20px 0 0",
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            Eventerz could not start
          </h1>

          <p style={{ margin: "14px 0 0", lineHeight: 1.6, color: "#94a3b8" }}>
            Something failed before the page could load. Reloading usually
            clears it.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "14px 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                color: "rgba(148, 163, 184, 0.7)",
              }}
            >
              Reference {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              marginTop: 26,
              padding: "11px 22px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(90deg, #9945ff, #2f80ff)",
            }}
          >
            Reload
          </button>

          <p style={{ margin: "26px 0 0", fontSize: 12, color: "#64748b" }}>
            Still stuck?{" "}
            <a
              href="mailto:eventerz.web@gmail.com"
              style={{ color: "#22d3ee" }}
            >
              eventerz.web@gmail.com
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
