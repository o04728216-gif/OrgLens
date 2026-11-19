import type { DeviceRegistrationPayload } from '../types/platformTypes';
import { getOrCreateClientDeviceId } from './authClient';

const INSTALL_STORAGE_KEY = 'orglens_hw_install_v2';
const IDB_NAME = 'orglens_device_vault_v2';
const IDB_STORE = 'device_identity';
const CACHE_NAME = 'orglens-device-identity-v2';
const CACHE_URL = '/__orglens_device_seal__';
const COOKIE_NAME = 'ol_client_did';
const WINDOW_NAME_PREFIX = 'OL_DID:';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, timeoutMs);

    promise
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

function generateRandomInstallId(): string {
  const arr = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `did_${hex}`;
}

async function sha256Hex(raw: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic FNV-1a fallback if WebCrypto is unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}`.repeat(4);
}

function readCookieInstallId(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE_NAME && v && v.startsWith('did_')) {
      return decodeURIComponent(v);
    }
  }
  return null;
}

function writeCookieInstallId(id: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      id
    )}; Path=/; Max-Age=315360000; SameSite=Lax`;
  } catch {
    // Ignore cookie write restriction
  }
}

function readLocalStorageId(): string | null {
  try {
    const val = localStorage.getItem(INSTALL_STORAGE_KEY);
    return val && val.startsWith('did_') ? val : null;
  } catch {
    return null;
  }
}

function writeLocalStorageId(id: string): void {
  try {
    localStorage.setItem(INSTALL_STORAGE_KEY, id);
  } catch {
    // Ignore storage quota error
  }
}

function readWindowNameId(): string | null {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.name === 'string' &&
      window.name.includes(WINDOW_NAME_PREFIX)
    ) {
      const idx = window.name.indexOf(WINDOW_NAME_PREFIX);
      const token = window.name
        .slice(idx + WINDOW_NAME_PREFIX.length)
        .split('|')[0]
        .trim();
      if (token.startsWith('did_')) return token;
    }
  } catch {
    // Ignore
  }
  return null;
}

function writeWindowNameId(id: string): void {
  try {
    if (typeof window !== 'undefined') {
      if (!window.name || !window.name.includes(WINDOW_NAME_PREFIX)) {
        window.name = `${WINDOW_NAME_PREFIX}${id}|`;
      }
    }
  } catch {
    // Ignore
  }
}

function readIndexedDbId(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const getReq = store.get('install_id');
          getReq.onsuccess = () => {
            const val = getReq.result;
            db.close();
            resolve(
              typeof val === 'string' && val.startsWith('did_') ? val : null
            );
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeIndexedDbId(id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(id, 'install_id');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function readCacheStorageId(): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(CACHE_URL);
    if (!match) return null;
    const txt = (await match.text()).trim();
    return txt.startsWith('did_') ? txt : null;
  } catch {
    return null;
  }
}

async function writeCacheStorageId(id: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      CACHE_URL,
      new Response(id, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'immutable' },
      })
    );
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Resolves and self-heals a persistent device installation ID across 5 browser
 * storage vaults (localStorage, IndexedDB, CacheStorage, Cookie, window.name).
 */
async function resolvePersistentDeviceInstallId(): Promise<string> {
  const fastSyncId =
    readCookieInstallId() || readLocalStorageId() || readWindowNameId();

  const [idbVal, cacheVal] = await Promise.all([
    withTimeout(readIndexedDbId(), 90, null),
    withTimeout(readCacheStorageId(), 90, null),
  ]);

  const chosen =
    fastSyncId || idbVal || cacheVal || getOrCreateClientDeviceId() || generateRandomInstallId();

  writeLocalStorageId(chosen);
  writeCookieInstallId(chosen);
  writeWindowNameId(chosen);
  // Persist heavy async vaults in background so login/signup UI never hangs
  void writeIndexedDbId(chosen);
  void writeCacheStorageId(chosen);

  return chosen;
}

function collectWebGlHardwareTraits(): {
  vendor: string;
  renderer: string;
  limits: string;
} {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return { vendor: 'no-webgl', renderer: 'no-webgl', limits: 'none' };
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '')
      : String(gl.getParameter(gl.VENDOR) || '');
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxCube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    const maxRender = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const maxVertAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const maxVertUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    const maxFragUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const vpStr = viewportDims
      ? `${viewportDims[0]}x${viewportDims[1]}`
      : '0x0';
    const highpFrag = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT
    );
    const precStr = highpFrag
      ? `${highpFrag.rangeMin}:${highpFrag.rangeMax}:${highpFrag.precision}`
      : 'na';

    return {
      vendor: vendor.trim(),
      renderer: renderer.trim(),
      limits: `${maxTex}|${maxCube}|${maxRender}|${maxVertAttribs}|${maxVertUniforms}|${maxFragUniforms}|${vpStr}|${precStr}`,
    };
  } catch {
    return { vendor: 'err', renderer: 'err', limits: 'err' };
  }
}

async function collectAudioDspSignature(): Promise<string> {
  try {
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OfflineCtx) return 'no-audio-ctx';

    const ctx = new OfflineCtx(1, 4500, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, ctx.currentTime);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-50, ctx.currentTime);
    comp.knee.setValueAtTime(40, ctx.currentTime);
    comp.ratio.setValueAtTime(12, ctx.currentTime);
    comp.attack.setValueAtTime(0, ctx.currentTime);
    comp.release.setValueAtTime(0.25, ctx.currentTime);

    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);

    const rendered = await ctx.startRendering();
    const samples = rendered.getChannelData(0);
    let acc = 0;
    for (let i = 4000; i < samples.length; i += 1) {
      acc += Math.abs(samples[i]);
    }
    return acc.toFixed(6);
  } catch {
    return 'audio-unavailable';
  }
}

async function collectCanvasAndFontSignature(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-2d';

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 4, 120, 24);
    ctx.fillStyle = '#0ea5e9';
    ctx.font = '15px "Arial", sans-serif';
    ctx.fillText('OrgLens-HW-Seal#942', 6, 22);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.78)';
    ctx.font = '16px "Georgia", serif';
    ctx.fillText('OrgLens-HW-Seal#942', 10, 42);

    const testFonts = ['monospace', 'sans-serif', 'serif'];
    const widths = testFonts
      .map((f) => {
        ctx.font = `72px ${f}`;
        return Math.round(ctx.measureText('mmmmmmmmmmlli').width);
      })
      .join(':');

    return await sha256Hex(`${canvas.toDataURL()}|${widths}`);
  } catch {
    return 'canvas-unavailable';
  }
}

function cleanGpuShortName(renderer: string): string {
  if (!renderer || renderer === 'no-webgl' || renderer === 'err') {
    return 'Standard GPU';
  }
  const angleMatch = renderer.match(/ANGLE \((?:[^,]+,\s*)?([^,)]+)/i);
  const extracted = angleMatch ? angleMatch[1] : renderer;
  return extracted.replace(/\s+/g, ' ').trim().slice(0, 42);
}

function collectFastHardwareMeta() {
  const webgl = collectWebGlHardwareTraits();
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);

  const navWithUAData = nav as Navigator & {
    userAgentData?: { platform?: string };
    deviceMemory?: number;
  };

  const platform = String(
    navWithUAData.userAgentData?.platform || nav.platform || 'Unknown OS'
  ).trim();
  const cpuCores = Number(nav.hardwareConcurrency || 0);
  const memoryGb = Number(navWithUAData.deviceMemory || 0);
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const screenW = Math.max(Number(scr.width || 0), Number(scr.height || 0));
  const screenH = Math.min(Number(scr.width || 0), Number(scr.height || 0));
  const colorDepth = Number(scr.colorDepth || 24);
  const pixelRatio = Number((window.devicePixelRatio || 1).toFixed(2));
  const screenProfile = `${screenW}x${screenH}@${pixelRatio}x (${colorDepth}-bit)`;

  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    timezone = 'UTC';
  }

  const shortGpu = cleanGpuShortName(webgl.renderer);
  const deviceLabel = `${platform} · ${shortGpu} · ${screenW}x${screenH}${
    cpuCores ? ` · ${cpuCores} Cores` : ''
  }`;

  return {
    webgl,
    platform,
    cpuCores,
    memoryGb,
    maxTouchPoints,
    screenW,
    screenH,
    colorDepth,
    pixelRatio,
    screenProfile,
    timezone,
    shortGpu,
    deviceLabel,
  };
}

/**
 * Instant (< 0.2ms) device payload for Sign In: skips WebGL context creation,
 * OfflineAudioContext, & async IndexedDB locks so users log straight in immediately.
 */
export function collectFastLoginDevicePayload(): DeviceRegistrationPayload {
  const deviceInstallId = getOrCreateClientDeviceId();
  writeLocalStorageId(deviceInstallId);
  writeCookieInstallId(deviceInstallId);
  writeWindowNameId(deviceInstallId);

  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);
  const navWithUAData = nav as Navigator & {
    userAgentData?: { platform?: string };
    deviceMemory?: number;
  };
  const platform = String(
    navWithUAData.userAgentData?.platform || nav.platform || 'Web'
  ).trim();
  const cpuCores = Number(nav.hardwareConcurrency || 0);
  const memoryGb = Number(navWithUAData.deviceMemory || 0);
  const screenW = Math.max(Number(scr.width || 0), Number(scr.height || 0));
  const screenH = Math.min(Number(scr.width || 0), Number(scr.height || 0));
  const colorDepth = Number(scr.colorDepth || 24);
  const pixelRatio = Number(
    (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1).toFixed(2)
  );
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    timezone = 'UTC';
  }

  return {
    deviceInstallId,
    hardwareHash: '',
    canvasFontHash: '',
    deviceLabel: `${platform} · ${screenW}x${screenH}${
      cpuCores ? ` · ${cpuCores} Cores` : ''
    }`,
    platform,
    gpuRenderer: 'Browser Session',
    screenProfile: `${screenW}x${screenH}@${pixelRatio}x (${colorDepth}-bit)`,
    cpuCores,
    memoryGb,
    timezone,
  };
}

/**
 * Collects physical device traits (independent of IP address) with strict 120ms timeout caps
 * so Sign Up never stalls on browser audio/canvas/storage APIs.
 */
export async function collectDeviceRegistrationPayload(): Promise<DeviceRegistrationPayload> {
  const [deviceInstallId, audioSig, canvasFontHash] = await Promise.all([
    withTimeout(
      resolvePersistentDeviceInstallId(),
      120,
      getOrCreateClientDeviceId()
    ),
    withTimeout(collectAudioDspSignature(), 120, 'audio-fast-skip'),
    withTimeout(collectCanvasAndFontSignature(), 120, 'canvas-fast-skip'),
  ]);

  const meta = collectFastHardwareMeta();

  const hardwareComposite = [
    `plat:${meta.platform.toLowerCase()}`,
    `cores:${meta.cpuCores}`,
    `mem:${meta.memoryGb}`,
    `touch:${meta.maxTouchPoints}`,
    `scr:${meta.screenW}x${meta.screenH}:${meta.colorDepth}:${meta.pixelRatio}`,
    `gpu_v:${meta.webgl.vendor.toLowerCase()}`,
    `gpu_r:${meta.webgl.renderer.toLowerCase()}`,
    `gpu_lim:${meta.webgl.limits}`,
    `aud:${audioSig}`,
    `tz:${meta.timezone}`,
  ].join('||');

  const hardwareHash = await withTimeout(
    sha256Hex(hardwareComposite),
    80,
    deviceInstallId
  );

  return {
    deviceInstallId,
    hardwareHash,
    canvasFontHash,
    deviceLabel: meta.deviceLabel,
    platform: meta.platform,
    gpuRenderer: meta.shortGpu,
    screenProfile: meta.screenProfile,
    cpuCores: meta.cpuCores,
    memoryGb: meta.memoryGb,
    timezone: meta.timezone,
  };
}
