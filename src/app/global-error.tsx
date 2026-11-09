"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#f4f2ed", color: "#242722" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <h1 style={{ fontSize: 16 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#6b6d66" }}>Nothing was changed. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: 0, background: "#3f5e4a", color: "#fff" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
