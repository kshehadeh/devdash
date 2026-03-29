import React from 'react';
import { useLatestRelease } from '../hooks/useLatestRelease';
import styles from '../pages/index.module.css';

const archLabels: Record<'arm64' | 'x64', string> = {
  arm64: 'Apple Silicon',
  x64: 'Intel',
};

export function DownloadButton(): React.ReactElement {
  const { dmgUrl, version, arch, altDmgUrl, altArch, loading, error } = useLatestRelease();

  // Loading state
  if (loading) {
    return (
      <button className="button button--secondary button--lg" disabled>
        Checking latest release...
      </button>
    );
  }

  // Error or no URL - fall back to releases page
  if (error || !dmgUrl) {
    return (
      <a
        className="button button--secondary button--lg"
        href="https://github.com/kshehadeh/devdash/releases">
        Download for macOS
      </a>
    );
  }

  const versionDisplay = version ? ` ${version}` : '';
  const archDisplay = archLabels[arch];
  const altArchDisplay = archLabels[altArch];

  return (
    <span className={styles.downloadButtonWrapper}>
      <a className="button button--secondary button--lg" href={dmgUrl}>
        Download{versionDisplay} for {archDisplay}
      </a>
      {altDmgUrl && (
        <a className={styles.downloadAltLink} href={altDmgUrl}>
          Looking for {altArchDisplay}?
        </a>
      )}
    </span>
  );
}
