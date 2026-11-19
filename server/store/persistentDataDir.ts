import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AUTH_DB_FILENAME = 'orglens-vps-db.json';
export const AUTH_DB_BACKUP_FILENAME = 'orglens-vps-db.json.bak';
export const VAULT_SQLITE_FILENAME = 'worldwide-companies.sqlite';
export const RECOMMENDED_COOLIFY_MOUNT_PATH = '/app/data';

export interface AuthStoragePaths {
  primaryDir: string;
  primaryDbPath: string;
  primaryBackupPath: string;
  mirrorDir: string | null;
  mirrorDbPath: string | null;
  mirrorBackupPath: string | null;
  candidateReadPaths: string[];
}

export interface StoragePersistenceDiagnostics {
  authDbName: string;
  vaultDbName: string;
  authStoragePath: string;
  vaultStoragePath: string;
  activeDataDir: string;
  isContainerRuntime: boolean;
  isPersistentVolumeMounted: boolean;
  detectedMountPoint: string | null;
  recommendedCoolifyMountPath: string;
}

interface ParsedMountEntry {
  source: string;
  mountPoint: string;
  fsType: string;
}

const COMMON_VOLUME_MOUNT_CANDIDATES = [
  '/app/data',
  '/data',
  '/var/lib/orglens-data',
  '/app/storage',
  '/storage',
  '/mnt/data',
];

const IGNORED_SYSTEM_MOUNTS = new Set([
  '/',
  '/proc',
  '/sys',
  '/dev',
  '/run',
  '/tmp',
  '/etc/hosts',
  '/etc/hostname',
  '/etc/resolv.conf',
  '/dev/shm',
]);

const VIRTUAL_FS_TYPES = new Set([
  'proc',
  'sysfs',
  'tmpfs',
  'devtmpfs',
  'devpts',
  'cgroup',
  'cgroup2',
  'mqueue',
  'debugfs',
  'tracefs',
  'securityfs',
  'pstore',
  'configfs',
  'fusectl',
  'hugetlbfs',
  'autofs',
  'overlay',
  'nsfs',
  'ramfs',
]);

function isWritableDir(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isRelativeDefaultDataDir(raw?: string): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  return trimmed === '' || trimmed === './data' || trimmed === 'data';
}

function detectContainerRuntime(): boolean {
  try {
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) {
      return true;
    }
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (/(docker|containerd|kubepods|podman|lxc)/i.test(cgroup)) {
        return true;
      }
    }
  } catch {
    // Ignore on non-Linux hosts
  }
  return Boolean(process.env.COOLIFY_FQDN || process.env.COOLIFY_URL);
}

function readLinuxMounts(): ParsedMountEntry[] {
  try {
    if (!fs.existsSync('/proc/mounts')) return [];
    const content = fs.readFileSync('/proc/mounts', 'utf8');
    const entries: ParsedMountEntry[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;
      const [source, rawMountPoint, fsType] = parts;
      const mountPoint = rawMountPoint.replace(/\\040/g, ' ');
      entries.push({ source, mountPoint, fsType });
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Checks whether a directory (or one of its non-root parent directories) sits on
 * an explicitly mounted persistent Docker/Coolify volume rather than the ephemeral
 * container overlay filesystem.
 */
function findPersistentMountForPath(
  targetPath: string,
  mounts: ParsedMountEntry[]
): ParsedMountEntry | null {
  if (!targetPath || mounts.length === 0) return null;
  const normalizedTarget = path.resolve(targetPath);

  let bestMatch: ParsedMountEntry | null = null;
  for (const m of mounts) {
    if (IGNORED_SYSTEM_MOUNTS.has(m.mountPoint)) continue;
    if (VIRTUAL_FS_TYPES.has(m.fsType)) continue;
    if (
      m.mountPoint.startsWith('/proc/') ||
      m.mountPoint.startsWith('/sys/') ||
      m.mountPoint.startsWith('/dev/') ||
      m.mountPoint.startsWith('/etc/')
    ) {
      continue;
    }

    const normalizedMount = path.resolve(m.mountPoint);
    const isExactOrParent =
      normalizedTarget === normalizedMount ||
      normalizedTarget.startsWith(`${normalizedMount}${path.sep}`);

    if (
      isExactOrParent &&
      (!bestMatch || normalizedMount.length > bestMatch.mountPoint.length)
    ) {
      bestMatch = m;
    }
  }
  return bestMatch;
}

function getExternalHomeDataDir(): string | null {
  try {
    const home = os.homedir();
    if (!home) return null;
    const candidate = path.resolve(home, '.orglens-data');
    if (path.resolve(candidate) === path.resolve(process.cwd(), 'data')) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Automatically detects the highest-priority mounted persistent volume in Coolify / Docker.
 * Honors explicit env paths first, then checks standard Coolify mount destinations
 * (`/app/data`, `/data`, `/var/lib/orglens-data`, `/app/storage`, `/storage`) so that
 * whichever Persistent Storage path an admin attaches in Coolify is automatically used
 * by BOTH `orglens-vps-db.json` and `worldwide-companies.sqlite`.
 */
function detectPreferredMountedVolumeDir(): {
  dir: string | null;
  mountPoint: string | null;
} {
  const mounts = readLinuxMounts();
  if (mounts.length === 0) {
    return { dir: null, mountPoint: null };
  }

  const explicitAuthDir = (process.env.ORGLENS_AUTH_DIR || '').trim();
  const explicitDataDir = (process.env.ORGLENS_DATA_DIR || '').trim();
  const externalHomeDir = getExternalHomeDataDir();

  const priorityCandidates = Array.from(
    new Set(
      [
        explicitAuthDir ? path.resolve(process.cwd(), explicitAuthDir) : null,
        explicitDataDir ? path.resolve(process.cwd(), explicitDataDir) : null,
        ...COMMON_VOLUME_MOUNT_CANDIDATES,
        externalHomeDir,
      ].filter((p): p is string => Boolean(p))
    )
  );

  for (const candidate of priorityCandidates) {
    const mount = findPersistentMountForPath(candidate, mounts);
    if (mount && isWritableDir(candidate)) {
      return { dir: candidate, mountPoint: mount.mountPoint };
    }
  }

  return { dir: null, mountPoint: null };
}

/**
 * Resolves the directory used by the SQLite worldwide-companies vault.
 * Always aligns with any detected Coolify/Docker persistent volume mount so
 * both `orglens-vps-db.json` and `worldwide-companies.sqlite` survive every redeploy.
 */
export function resolveVaultDataDir(): string {
  const cwdDataDir = path.resolve(process.cwd(), 'data');
  const explicitVault = (process.env.ORGLENS_VAULT_DIR || '').trim();
  if (explicitVault) {
    return path.resolve(process.cwd(), explicitVault);
  }

  const mounted = detectPreferredMountedVolumeDir();
  if (mounted.dir) {
    return mounted.dir;
  }

  const explicitDataDir = (process.env.ORGLENS_DATA_DIR || '').trim();
  if (explicitDataDir) {
    const resolved = path.resolve(process.cwd(), explicitDataDir);
    if (resolved !== cwdDataDir) {
      return resolved;
    }
  }

  if (fs.existsSync(path.join(cwdDataDir, VAULT_SQLITE_FILENAME))) {
    return cwdDataDir;
  }

  const externalDir = getExternalHomeDataDir();
  if (
    externalDir &&
    fs.existsSync(path.join(externalDir, VAULT_SQLITE_FILENAME))
  ) {
    return externalDir;
  }

  return cwdDataDir;
}

/**
 * Resolves redeploy-safe storage paths for the users, admin credentials,
 * billing ledger, and device lock store (`orglens-vps-db.json`).
 *
 * Strategy:
 * 1. If a Coolify/Docker Persistent Storage volume is mounted (e.g., `/app/data`,
 *    `/data`, `/var/lib/orglens-data`, `/app/storage`, or custom `ORGLENS_DATA_DIR`),
 *    ALWAYS make that mounted volume the primary store so container rebuilds never
 *    touch user accounts or Root Admin credentials.
 * 2. On bare-metal/VPS deployments (non-Docker), prefer `~/.orglens-data` outside
 *    the code directory so git pull / folder replacements never wipe users.
 * 3. Maintain a secondary mirror copy and scan all surviving candidate paths on boot
 *    so migrating paths never loses existing users.
 */
export function resolveAuthStoragePaths(): AuthStoragePaths {
  const cwdDataDir = path.resolve(process.cwd(), 'data');
  const externalHomeDir = getExternalHomeDataDir();
  const explicitAuthDir = (process.env.ORGLENS_AUTH_DIR || '').trim();
  const explicitDataDir = (process.env.ORGLENS_DATA_DIR || '').trim();
  const mounted = detectPreferredMountedVolumeDir();

  let primaryDir = cwdDataDir;
  if (explicitAuthDir) {
    primaryDir = path.resolve(process.cwd(), explicitAuthDir);
  } else if (mounted.dir) {
    primaryDir = mounted.dir;
  } else if (!isRelativeDefaultDataDir(explicitDataDir)) {
    primaryDir = path.resolve(process.cwd(), explicitDataDir);
  } else if (externalHomeDir && isWritableDir(externalHomeDir)) {
    primaryDir = externalHomeDir;
  }

  let mirrorDir: string | null = null;
  if (
    externalHomeDir &&
    primaryDir !== externalHomeDir &&
    isWritableDir(externalHomeDir)
  ) {
    mirrorDir = externalHomeDir;
  } else if (primaryDir !== cwdDataDir && isWritableDir(cwdDataDir)) {
    mirrorDir = cwdDataDir;
  }

  const primaryDbPath = path.join(primaryDir, AUTH_DB_FILENAME);
  const primaryBackupPath = path.join(primaryDir, AUTH_DB_BACKUP_FILENAME);
  const mirrorDbPath = mirrorDir
    ? path.join(mirrorDir, AUTH_DB_FILENAME)
    : null;
  const mirrorBackupPath = mirrorDir
    ? path.join(mirrorDir, AUTH_DB_BACKUP_FILENAME)
    : null;

  const extraCandidateDirs = [
    ...COMMON_VOLUME_MOUNT_CANDIDATES,
    externalHomeDir,
    cwdDataDir,
  ].filter((d): d is string => Boolean(d));

  const rawCandidates: string[] = [
    primaryDbPath,
    primaryBackupPath,
    ...(mirrorDbPath ? [mirrorDbPath] : []),
    ...(mirrorBackupPath ? [mirrorBackupPath] : []),
  ];

  for (const dir of extraCandidateDirs) {
    rawCandidates.push(path.join(dir, AUTH_DB_FILENAME));
    rawCandidates.push(path.join(dir, AUTH_DB_BACKUP_FILENAME));
  }

  const candidateReadPaths = Array.from(new Set(rawCandidates));

  return {
    primaryDir,
    primaryDbPath,
    primaryBackupPath,
    mirrorDir,
    mirrorDbPath,
    mirrorBackupPath,
    candidateReadPaths,
  };
}

export function getStoragePersistenceDiagnostics(): StoragePersistenceDiagnostics {
  const authPaths = resolveAuthStoragePaths();
  const vaultDir = resolveVaultDataDir();
  const mounts = readLinuxMounts();
  const primaryMount = findPersistentMountForPath(authPaths.primaryDir, mounts);
  const isContainerRuntime = detectContainerRuntime();

  return {
    authDbName: AUTH_DB_FILENAME,
    vaultDbName: VAULT_SQLITE_FILENAME,
    authStoragePath: authPaths.primaryDbPath,
    vaultStoragePath: path.join(vaultDir, VAULT_SQLITE_FILENAME),
    activeDataDir: authPaths.primaryDir,
    isContainerRuntime,
    isPersistentVolumeMounted: Boolean(primaryMount),
    detectedMountPoint: primaryMount?.mountPoint ?? null,
    recommendedCoolifyMountPath: RECOMMENDED_COOLIFY_MOUNT_PATH,
  };
}
