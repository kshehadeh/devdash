---
sidebar_position: 1
title: Installation
---

# Installation

## Download

1. Go to the [DevDash Releases page](https://github.com/kshehadeh/devdash/releases).
2. Under the latest release, download the `.dmg` for your Mac architecture:
   - **Apple Silicon (M1/M2/M3/M4)** — `DevDash-*-arm64.dmg`
   - **Intel** — `DevDash-*-x64.dmg`
3. Open the `.dmg`, drag **DevDash** into your Applications folder, and eject the disk image.

:::tip Unsure which to pick?
Go to **Apple menu → About This Mac**. If it says "Apple M…" under Chip, download the arm64 build. If it says "Intel Core…" download x64.
:::

<!-- screenshot placeholder: GitHub releases page with download links highlighted -->

## First launch

When you open DevDash for the first time, macOS may show a Gatekeeper prompt because the app is downloaded from the internet. Click **Open** to proceed. DevDash is notarized and code-signed by Apple.

The app opens directly into the **onboarding flow** to create your developer profile and connect your first integration.

## Staying up to date

DevDash checks for new releases in the background. When an update is available, a notice appears in the status bar at the bottom of the app. You can also check manually at any time via **Settings → General → Check for updates now**.

Auto-update checks can be disabled in Settings → General if you prefer to manage updates manually.

## Uninstalling

Drag **DevDash** from your Applications folder to the Trash. DevDash stores its database in `~/Library/Application Support/DevDash/` — delete that folder to remove all local data.
