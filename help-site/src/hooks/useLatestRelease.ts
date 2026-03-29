import { useState, useEffect } from 'react';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

interface UseLatestReleaseResult {
  dmgUrl: string | null;
  version: string | null;
  arch: 'arm64' | 'x64';
  altDmgUrl: string | null;
  altArch: 'arm64' | 'x64';
  loading: boolean;
  error: Error | null;
}

type Arch = 'arm64' | 'x64';

// Simple in-memory cache to avoid redundant API calls
let cachedRelease: Release | null = null;
let cachePromise: Promise<Release> | null = null;

async function fetchLatestRelease(): Promise<Release> {
  if (cachedRelease) return cachedRelease;
  if (cachePromise) return cachePromise;

  cachePromise = fetch('https://api.github.com/repos/kshehadeh/devdash/releases/latest')
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    })
    .then((release: Release) => {
      cachedRelease = release;
      return release;
    })
    .finally(() => {
      cachePromise = null;
    });

  return cachePromise;
}

function detectArchitecture(): Arch {
  // Try navigator.userAgentData (Chromium-based browsers)
  if ('userAgentData' in navigator && navigator.userAgentData) {
    const uaData = navigator.userAgentData as {
      getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
    };
    if (uaData.getHighEntropyValues) {
      // This is async, but we'll do a sync check via getPlatform() if available
      // For now, we'll use a WebGL fallback below
    }
  }

  // WebGL renderer heuristic - check for Apple GPU
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        // Apple Silicon GPUs have "Apple" in the renderer string
        // Intel GPUs show "Intel" but may also show "Intel Iris" etc.
        if (typeof renderer === 'string') {
          if (renderer.toLowerCase().includes('apple')) {
            return 'arm64';
          }
          // Intel integrated graphics on Mac
          if (renderer.toLowerCase().includes('intel')) {
            return 'x64';
          }
        }
      }
    }
  } catch {
    // WebGL not available, continue to fallback
  }

  // Default to arm64 since most Macs from 2020+ are M-series
  return 'arm64';
}

function findDmgUrl(assets: ReleaseAsset[], arch: Arch): string | null {
  const pattern = arch === 'arm64' 
    ? /-arm64\.dmg$/i 
    : /\.dmg$/i;
  
  // For x64, we need to match .dmg but NOT -arm64.dmg
  const dmg = assets.find((a) => {
    if (arch === 'x64') {
      return a.name.endsWith('.dmg') && !a.name.toLowerCase().includes('-arm64');
    }
    return pattern.test(a.name);
  });
  
  return dmg?.browser_download_url ?? null;
}

export function useLatestRelease(): UseLatestReleaseResult {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [arch, setArch] = useState<Arch>('arm64');

  useEffect(() => {
    // Detect architecture on mount
    setArch(detectArchitecture());
    
    // Fetch latest release
    fetchLatestRelease()
      .then(setRelease)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const version = release?.tag_name ?? null;
  const dmgUrl = release ? findDmgUrl(release.assets, arch) : null;
  const altArch: Arch = arch === 'arm64' ? 'x64' : 'arm64';
  const altDmgUrl = release ? findDmgUrl(release.assets, altArch) : null;

  return {
    dmgUrl,
    version,
    arch,
    altDmgUrl,
    altArch,
    loading,
    error,
  };
}
