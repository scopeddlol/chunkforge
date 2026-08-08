/**
 * The Chunkforge mark as a 32px tray icon, inlined as a data URL.
 *
 * Embedded rather than loaded from disk because the tray is created before any
 * window exists, and a packaged app resolving an image path across dev,
 * asar, and installed layouts is three ways to end up with a blank tray icon.
 */
export const trayIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAv0lEQVR42u3SPQqAMAyAUW/oZVw9jcdxcvYM7oKgkqFQQpof26YdDASky/taHIZ/MmZdrge2GYy3KV49QoKrhVjhYiEW5NjvsiE5OBdT/LktuBiyTKcLDjuPWzpCExJj8K3FAU7i1ogvtxbxOEAKoXDqLMDqACoCh2hwDKtxLgKW+vniMwo241KE5dafcS4Av0QKzg5IRQAevqvimpeojncRwEW44FyEG95FABXhilMR7jiOaIJ3ERAimuH/lJoXyWffWtQ6bJwAAAAASUVORK5CYII='
