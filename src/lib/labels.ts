export function engineLabel(e: string | null) {
  return e === "gemini+heuristic" ? "AI + rules" : e === "heuristic" ? "rules" : e === "manual" ? "edited by hand" : e === "rollback" ? "rollback" : e === "seed" ? "initial setup" : e === "saved" ? "saved" : e ?? "—";
}
