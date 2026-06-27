import { isHiddenSurfaceSource } from '@/lib/surfaceSourceLabels';

type ReportRecord = Record<string, any>;

const visibleEntry = (entry: ReportRecord): boolean => !isHiddenSurfaceSource(
  entry?.source,
  entry?.provider,
  entry?.module,
  entry?.module_key,
  entry?.observation_type,
  entry?.category,
  entry?.title,
  entry?.summary_text,
);

const sanitizeDump = (dump: ReportRecord): ReportRecord | null => {
  const originalSources = Array.isArray(dump?.sources) ? dump.sources : [];
  const sources = originalSources.filter((source: unknown) => !isHiddenSurfaceSource(source));
  if (originalSources.length > 0 && sources.length === 0) return null;

  const results = Array.isArray(dump?.results)
    ? dump.results.filter((entry: ReportRecord) => visibleEntry(entry))
    : [];

  return {
    ...dump,
    sources,
    results,
    total_returned: results.length,
  };
};

export const sanitizeSurfaceScanReport = <T extends ReportRecord>(report: T): T => {
  const subdomainDumps = (Array.isArray(report?.subdomain_dumps) ? report.subdomain_dumps : [])
    .map((dump: ReportRecord) => sanitizeDump(dump))
    .filter(Boolean);

  return {
    ...report,
    assets_in_scope: (Array.isArray(report?.assets_in_scope) ? report.assets_in_scope : []).filter(visibleEntry),
    findings: (Array.isArray(report?.findings) ? report.findings : []).filter(visibleEntry),
    intel: (Array.isArray(report?.intel) ? report.intel : []).filter(visibleEntry),
    observations: (Array.isArray(report?.observations) ? report.observations : []).filter(visibleEntry),
    asset_module_details: (Array.isArray(report?.asset_module_details) ? report.asset_module_details : []).filter(visibleEntry),
    subdomain_dumps: subdomainDumps,
  } as T;
};
