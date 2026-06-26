type StorageFindingInput = {
  finding_type?: string | null;
  title?: string | null;
  description?: string | null;
  severity?: string | null;
  affected_asset?: string | null;
  remediation?: string | null;
  evidence?: Record<string, any> | null;
};

const STORAGE_FINDING_TYPE = 'exposed_storage_bucket';

const PLACEHOLDER_VALUES = new Set([
  'unknown',
  'sconosciuto',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  '-',
  '--',
  'not available',
  'non disponibile',
]);

const cleanValue = (value: unknown): string => String(value || '').trim();

const isUsableValue = (value: unknown): boolean => {
  const normalized = cleanValue(value).toLowerCase();
  return Boolean(normalized) && !PLACEHOLDER_VALUES.has(normalized);
};

const firstUsable = (...values: unknown[]): string => {
  for (const value of values) {
    if (isUsableValue(value)) return cleanValue(value);
  }
  return '';
};

const bucketRecord = (evidence?: Record<string, any> | null): Record<string, any> => {
  const raw = evidence?.bucket;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') return raw as Record<string, any>;
  if (Array.isArray(raw)) {
    const objectEntry = raw.find((entry) => entry && !Array.isArray(entry) && typeof entry === 'object');
    return objectEntry ? objectEntry as Record<string, any> : {};
  }
  return {};
};

export const isStorageBucketFinding = (finding: StorageFindingInput): boolean =>
  String(finding.finding_type || '').toLowerCase() === STORAGE_FINDING_TYPE;

export const storageBucketEvidence = (finding: StorageFindingInput) => {
  const evidence = finding.evidence || {};
  const bucket = bucketRecord(evidence);
  const name = firstUsable(
    evidence.bucket_name,
    bucket.bucket_name,
    bucket.bucketName,
    bucket.bucket,
    bucket.name,
  );
  const url = firstUsable(
    evidence.bucket_url,
    bucket.url,
    bucket.uri,
    bucket.endpoint,
    bucket.host,
    bucket.hostname,
  );
  return {
    name,
    url,
    hasConcreteEvidence: Boolean(name || url),
  };
};

export const isUnverifiedStorageBucketFinding = (finding: StorageFindingInput): boolean => {
  if (!isStorageBucketFinding(finding)) return false;
  if (storageBucketEvidence(finding).hasConcreteEvidence) return false;
  const title = String(finding.title || '').toLowerCase();
  const description = String(finding.description || '').toLowerCase();
  return (
    title.includes('sconosciuto') ||
    title.includes('unknown') ||
    description.includes('bucket  ()') ||
    Boolean(finding.evidence?.storage_signal_quality === 'unverified') ||
    Array.isArray(finding.evidence?.bucket)
  );
};

export const presentStorageBucketFinding = <T extends StorageFindingInput>(finding: T): T => {
  if (!isStorageBucketFinding(finding)) return finding;

  const evidence = storageBucketEvidence(finding);
  const asset = cleanValue(finding.affected_asset) || 'asset monitorato';

  if (!evidence.hasConcreteEvidence) {
    return {
      ...finding,
      title: 'Possibile esposizione storage da verificare',
      description:
        `Il motore ASM esterno ha segnalato un indicatore storage per ${asset}, ` +
        'ma non ha fornito nome, URL o endpoint del bucket. Trattalo come segnale da validare, non come conferma di bucket pubblico.',
      severity: finding.severity === 'critical' || finding.severity === 'high' ? 'medium' : finding.severity,
      remediation:
        'Verificare manualmente nel portale ASM/cloud se esistono bucket o endpoint storage collegati al dominio. ' +
        'Se confermato, disabilitare accesso pubblico anonimo e restringere policy/ACL.',
      evidence: {
        ...(finding.evidence || {}),
        storage_signal_quality: 'unverified',
        needs_manual_validation: true,
      },
    };
  }

  const label = evidence.name || evidence.url;
  return {
    ...finding,
    title: `Bucket storage pubblico rilevato: ${label}`,
    description:
      `Il motore ASM esterno ha rilevato un bucket o endpoint storage pubblicamente accessibile collegato a ${asset}. ` +
      `Evidenza disponibile: ${label}.`,
    remediation:
      'Verificare ownership del bucket, disabilitare accesso pubblico anonimo, restringere policy/ACL e ruotare eventuali credenziali o oggetti sensibili esposti.',
    evidence: {
      ...(finding.evidence || {}),
      bucket_name: evidence.name || null,
      bucket_url: evidence.url || null,
      storage_signal_quality: 'verified_identifier',
    },
  };
};
