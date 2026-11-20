/**
 * Numero finito nell'intervallo [min, max], altrimenti null.
 *
 * Il backend su PostgreSQL restituiva CVSS ed EPSS come stringhe ("9.8"):
 * `toFixed()` su una stringa mandava in crash il dettaglio dei finding.
 * Accetta numeri e stringhe numeriche; scarta vuoti, testo e valori fuori scala.
 */
export const toBoundedNumber = (value: unknown, min: number, max: number): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/** CVSS: scala 0–10. */
export const toCvss = (value: unknown): number | null => toBoundedNumber(value, 0, 10);

/** EPSS: probabilità 0–1. */
export const toEpss = (value: unknown): number | null => toBoundedNumber(value, 0, 1);
