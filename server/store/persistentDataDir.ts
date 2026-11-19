import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AuthStoragePaths {
  primaryDir: string;
  primaryDbPath: string;
  primaryBackupPath: string;
  mirrorDir: string | null;
  mirrorDbPath: string | null;
  mirrorBackupPath: string | null;
  candidateReadPaths: string[];
}

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

/**
 * Resolves the directory used by the SQLite worldwide-companies vault.
 * Honors explicit ORGLENS_VAULT_DIR or ORGLENS_DATA_DIR so external persistent mounts
 * or Docker volumes are respected by both JSON & SQLite stores.
 */
export function resolveVaultDataDir(): string {
  const cwdDataDir = path.resolve(process.cwd(), 'data');
  const explicitVault = (process.env.ORGLENS_VAULT_DIR || '').trim();
  if (explicitVault) {
    return path.resolve(process.cwd(), explicitVault);
  }
  const explicitDataDir = (process.env.ORGLENS_DATA_DIR || '').trim();
  if (explicitDataDir) {
    const resolved = path.resolve(process.cwd(), explicitDataDir);
    if (resolved !== cwdDataDir) {
      return resolved;
    }
  }
  if (fs.existsSync(path.join(cwdDataDir, 'worldwide-companies.sqlite'))) {
    return cwdDataDir;
  }
  const externalDir = getExternalHomeDataDir();
  if (
    externalDir &&
    fs.existsSync(path.join(externalDir, 'worldwide-companies.sqlite'))
  ) {
    return externalDir;
  }
  return cwdDataDir;
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
 * Resolves redeploy-safe storage paths for the users, admin credentials,
 * billing ledger, and device lock store (`orglens-vps-db.json`).
 *
 * Strategy:
 * - On VPS deployments where app folders are replaced during redeploys, placing the
 *   primary auth store outside `process.cwd()` (in `~/.orglens-data` or `ORGLENS_AUTH_DIR`
 *   / `ORGLENS_DATA_DIR`) ensures code updates NEVER wipe signed-up users or admin accounts.
 * - Dual-writes a backup mirror between external home storage and `./data` (or vice versa)
 *   whenever writable, and scans all surviving candidates on boot.
 */
export function resolveAuthStoragePaths(): AuthStoragePaths {
  const cwdDataDir = path.resolve(process.cwd(), 'data');
  const externalHomeDir = getExternalHomeDataDir();
  const explicitAuthDir = (process.env.ORGLENS_AUTH_DIR || '').trim();
  const explicitDataDir = (process.env.ORGLENS_DATA_DIR || '').trim();

  let primaryDir = cwdDataDir;
  if (explicitAuthDir) {
    primaryDir = path.resolve(process.cwd(), explicitAuthDir);
  } else if (!isRelativeDefaultDataDir(explicitDataDir)) {
    primaryDir = path.resolve(process.cwd(), explicitDataDir);
  } else if (externalHomeDir && isWritableDir(externalHomeDir)) {
    primaryDir = externalHomeDir;
  }

  let mirrorDir: string | null = null;
  if (primaryDir !== cwdDataDir && isWritableDir(cwdDataDir)) {
    mirrorDir = cwdDataDir;
  } else if (
    externalHomeDir &&
    primaryDir !== externalHomeDir &&
    isWritableDir(externalHomeDir)
  ) {
    mirrorDir = externalHomeDir;
  }

  const primaryDbPath = path.join(primaryDir, 'orglens-vps-db.json');
  const primaryBackupPath = path.join(primaryDir, 'orglens-vps-db.json.bak');
  const mirrorDbPath = mirrorDir
    ? path.join(mirrorDir, 'orglens-vps-db.json')
    : null;
  const mirrorBackupPath = mirrorDir
    ? path.join(mirrorDir, 'orglens-vps-db.json.bak')
    : null;

  const rawCandidates = [
    primaryDbPath,
    primaryBackupPath,
    mirrorDbPath,
    mirrorBackupPath,
    path.join(cwdDataDir, 'orglens-vps-db.json'),
    path.join(cwdDataDir, 'orglens-vps-db.json.bak'),
  ].filter((p): p is string => Boolean(p));

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
