import * as fs from 'fs';
import * as path from 'path';

/**
 * Static guard for the "append-only through the application" rule.
 *
 * It scans the production sources (everything under src/ except *.spec.ts) and
 * fails the build if any code could modify or delete audit rows, if the audit
 * table is touched outside the audit module, or if a raw-SQL escape hatch or
 * a purge switch appears. It is a code-level safety net; the database-level
 * protection is the migration's triggers.
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');
const AUDIT_DIR = path.resolve(__dirname);

function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listSources(full);
    }

    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

const sources = listSources(SRC_ROOT).map((file) => ({
  file,
  inAudit: file.startsWith(AUDIT_DIR),
  text: fs.readFileSync(file, 'utf8'),
}));

const rel = (file: string) => path.relative(SRC_ROOT, file);

describe('audit log static guard', () => {
  it('scans a realistic number of source files', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('no code can update, delete or upsert audit rows', () => {
    const offenders = sources
      .filter((s) =>
        /auditLog\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/.test(
          s.text,
        ),
      )
      .map((s) => rel(s.file));

    expect(offenders).toEqual([]);
  });

  it('only the audit module touches the auditLog delegate', () => {
    const offenders = sources
      .filter((s) => !s.inAudit && /\.auditLog\b/.test(s.text))
      .map((s) => rel(s.file));

    expect(offenders).toEqual([]);
  });

  it('has no unsafe raw SQL, no purge switch and no TRUNCATE/trigger tampering', () => {
    const offenders = sources
      .filter((s) =>
        /(\$queryRawUnsafe|\$executeRawUnsafe|audit_purge|DISABLE\s+TRIGGER|session_replication_role|TRUNCATE\s+(TABLE\b|"))/.test(
          s.text,
        ),
      )
      .map((s) => rel(s.file));

    expect(offenders).toEqual([]);
  });

  it('the audit module exposes no delete/purge/remove/update method', () => {
    const offenders = sources
      .filter((s) => s.inAudit)
      .filter((s) =>
        /\b(async\s+)?(delete|remove|purge|update|destroy)\w*\s*\(/i.test(
          s.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
        ),
      )
      .map((s) => rel(s.file));

    expect(offenders).toEqual([]);
  });
});
