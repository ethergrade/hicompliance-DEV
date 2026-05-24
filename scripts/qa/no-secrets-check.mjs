import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanTargets = [
  path.join(root, 'src'),
  path.join(root, 'dist'),
];

const denyPatterns = [
  /INTELX_API_KEY/gi,
  /OPENAI_API_KEY/gi,
  /SUPABASE_SERVICE_ROLE_KEY/gi,
  /sb_secret_[A-Za-z0-9._-]+/g,
  /sk-proj-[A-Za-z0-9._-]+/g,
];

const allowedPathFragments = [
  path.join('scripts', 'qa', 'no-secrets-check.mjs'),
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.map', '.txt', '.md',
  ].includes(ext);
}

const findings = [];

for (const target of scanTargets) {
  const files = walk(target).filter(isTextFile);

  for (const filePath of files) {
    const rel = path.relative(root, filePath);
    if (allowedPathFragments.some((fragment) => rel.includes(fragment))) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    for (const pattern of denyPatterns) {
      const match = content.match(pattern);
      if (match && match.length > 0) {
        findings.push({ file: rel, pattern: String(pattern), sample: match[0] });
      }
    }

    if (rel.startsWith('src/')) {
      if (/Deno\.env\./.test(content) || /SUPABASE_SERVICE_ROLE_KEY/.test(content)) {
        findings.push({
          file: rel,
          pattern: 'server-only-env-in-frontend',
          sample: 'Deno.env or service role reference in src/',
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error('QA no-secrets check failed. Findings:');
  for (const finding of findings) {
    console.error(`- ${finding.file} :: ${finding.pattern} :: ${finding.sample}`);
  }
  process.exit(1);
}

console.log('QA no-secrets check passed.');
