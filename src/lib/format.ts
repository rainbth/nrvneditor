const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Formatea un tamaño en bytes con una cifra decimal para KB y superiores. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unit]}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

type RelativeUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

const UNITS: ReadonlyArray<{ limit: number; unit: RelativeUnit }> = [
  { limit: 60, unit: "second" },
  { limit: 3600, unit: "minute" },
  { limit: 86400, unit: "hour" },
  { limit: 2592000, unit: "day" },
  { limit: 31536000, unit: "month" },
  { limit: Number.POSITIVE_INFINITY, unit: "year" },
];

const DIVISORS: Record<RelativeUnit, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 2592000,
  year: 31536000,
};

/** Tiempo relativo en es-ES a partir de un timestamp en milisegundos. */
export function formatRelativeTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return "—";
  const deltaSeconds = (timestampMs - Date.now()) / 1000;
  const magnitude = Math.abs(deltaSeconds);
  const entry = UNITS.find((unit) => magnitude < unit.limit) ?? UNITS[UNITS.length - 1];
  const value = Math.round(deltaSeconds / DIVISORS[entry.unit]);
  return RELATIVE.format(value, entry.unit as Intl.RelativeTimeFormatUnit);
}
