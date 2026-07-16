import type { HiTrackTrendWindow } from "@/lib/hitrack/types";

export function normalizeClientAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function matchCollectorAlias(clientName: string, collectorName: string) {
  const clientAlias = normalizeClientAlias(clientName);
  const collectorAlias = normalizeClientAlias(collectorName);
  return (
    collectorAlias === clientAlias ||
    collectorAlias.includes(clientAlias) ||
    clientAlias.includes(collectorAlias)
  );
}

export function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Dato non disponibile";
  return `${value.toFixed(1)}%`;
}

export function formatGiB(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Dato non disponibile";
  return `${value.toFixed(2)} GiB`;
}

export function formatMillis(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Dato non disponibile";
  return `${value.toFixed(1)} ms`;
}

export function formatFreshness(seconds: number | null) {
  if (seconds === null || seconds < 0) return "Dato non disponibile";
  if (seconds < 60) return "meno di 1 minuto";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minuti`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore`;
  return `${Math.floor(seconds / 86400)} giorni`;
}

export function pickTrend(
  values: { trend24h: number[]; trend7d: number[]; trend30d: number[] },
  window: HiTrackTrendWindow,
) {
  if (window === "7d") return values.trend7d;
  if (window === "30d") return values.trend30d;
  return values.trend24h;
}

export function classifyUsageStatus(value: number | null) {
  if (value === null) return "muted" as const;
  if (value >= 90) return "error" as const;
  if (value >= 75) return "warning" as const;
  return "success" as const;
}
