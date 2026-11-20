/**
 * Fascia di rischio SurfaceScan360: una sola regola per tutta l'interfaccia.
 *
 * La fascia la decide il server (`SurfaceScanMonthlyReportService::riskLevel`,
 * sui punti di rischio). Qui c'è lo specchio di quella regola solo per i dati
 * che arrivano senza fascia (es. il riepilogo di un singolo job): prima ogni
 * componente aveva soglie sue, sulla postura, e lo stesso snapshot compariva
 * con due fasce diverse.
 */
export type SurfaceRiskLevel = "Critico" | "Alto" | "Medio" | "Basso";

const LEVELS: readonly SurfaceRiskLevel[] = ["Critico", "Alto", "Medio", "Basso"];

/** Soglie del server sui punti di rischio (0 = nessun rischio). */
export const surfaceRiskLevelFromPoints = (riskPoints: unknown): SurfaceRiskLevel | null => {
  if (riskPoints === null || riskPoints === undefined || riskPoints === "") return null;
  const points = Number(riskPoints);
  if (!Number.isFinite(points)) return null;
  if (points >= 60) return "Critico";
  if (points >= 25) return "Alto";
  if (points >= 11) return "Medio";
  return "Basso";
};

/** Una fascia già calcolata dal server, se valida. */
export const asSurfaceRiskLevel = (value: unknown): SurfaceRiskLevel | null =>
  LEVELS.find((level) => level.toLowerCase() === String(value ?? "").trim().toLowerCase()) ?? null;

type JobSummary = {
  posture_score?: unknown;
  overall_score?: unknown;
  risk_points?: unknown;
  risk_level?: unknown;
} | null | undefined;

/** Postura del job (100 = ottima). `overall_score` è il nome dei job più vecchi. */
export const jobPostureScore = (summary: JobSummary): number | null => {
  const raw = summary?.posture_score ?? summary?.overall_score;
  if (raw === null || raw === undefined || raw === "") return null;
  const score = Number(raw);
  return Number.isFinite(score) ? score : null;
};

/** Fascia del job: quella del server se c'è, altrimenti dai punti di rischio. */
export const jobRiskLevel = (summary: JobSummary): SurfaceRiskLevel | null =>
  asSurfaceRiskLevel(summary?.risk_level) ?? surfaceRiskLevelFromPoints(summary?.risk_points);
