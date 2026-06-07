'use client'

/**
 * Platform detection hook for Electron renderer.
 * Uses the electronAPI.platform exposed by preload.js.
 *
 * On macOS, the app uses hiddenInset titlebar with traffic-light buttons,
 * which requires extra left padding (pl-20 / 80px).
 * On Windows/Linux, the native frame is used, so minimal padding (pl-4) is sufficient.
 */

type Platform = 'darwin' | 'win32' | 'linux'

function getPlatform(): Platform {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.platform) {
    return (window as any).electronAPI.platform as Platform
  }
  // Fallback for non-Electron environments (e.g. dev server in browser)
  if (typeof navigator !== 'undefined') {
    if (navigator.platform?.startsWith('Mac')) return 'darwin'
    if (navigator.platform?.startsWith('Win')) return 'win32'
  }
  return 'win32' // Default to Windows for this Windows edition
}

/** Returns true if the app is running on macOS (needs traffic-light padding) */
export function isMacOS(): boolean {
  return getPlatform() === 'darwin'
}

/** Returns the appropriate header left padding class based on platform */
export function headerPaddingLeft(): string {
  return isMacOS() ? 'pl-20' : 'pl-4'
}