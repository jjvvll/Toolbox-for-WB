export type PresetId = "small" | "balanced" | "high" | "custom";

export type Settings = {
  preset: PresetId;
  /** Target size of the *short* side in px (480 = "480p" for landscape and portrait); 0 = keep. */
  shortSide: number;
  videoKbps: number;
  audioKbps: number;
  /** Frame rate cap; 0 = keep the source rate. */
  fpsCap: number;
  /** When set, the video bitrate is derived from this and the duration. */
  targetMB: number | null;
  pattern: string;
  subfolder: string;
  scanSubfolders: boolean;
  sideBySide: boolean;
};

export const PRESETS: Record<Exclude<PresetId, "custom">, { label: string; hint: string; shortSide: number; videoKbps: number; audioKbps: number; fpsCap: number }> = {
  small: { label: "Small", hint: "480p · ~0.9 Mbps", shortSide: 480, videoKbps: 800, audioKbps: 64, fpsCap: 30 },
  balanced: { label: "Balanced", hint: "720p · ~2 Mbps", shortSide: 720, videoKbps: 2000, audioKbps: 128, fpsCap: 60 },
  high: { label: "High quality", hint: "1080p · ~5 Mbps", shortSide: 1080, videoKbps: 5000, audioKbps: 160, fpsCap: 60 },
};

export const DEFAULT_SETTINGS: Settings = {
  preset: "balanced",
  shortSide: PRESETS.balanced.shortSide,
  videoKbps: PRESETS.balanced.videoKbps,
  audioKbps: PRESETS.balanced.audioKbps,
  fpsCap: PRESETS.balanced.fpsCap,
  targetMB: null,
  pattern: "{name}-compressed.mp4",
  subfolder: "",
  scanSubfolders: false,
  sideBySide: false,
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size for a source, scaling the short side down to `shortSide` (never up). */
export function outputDims(width: number, height: number, shortSide: number): { width: number; height: number } {
  if (!width || !height) return { width, height };
  const short = Math.min(width, height);
  const scale = shortSide && short > shortSide ? shortSide / short : 1;
  return { width: even(width * scale), height: even(height * scale) };
}

/** Video bitrate to use: from the target file size when set, else the chosen bitrate. */
export function videoKbpsFor(settings: Settings, durationSec: number | null): number {
  if (settings.targetMB && durationSec && durationSec > 0) {
    const totalKbps = (settings.targetMB * 8 * 1024 * 1024) / durationSec / 1000;
    // ~4% headroom for container overhead.
    return Math.max(150, Math.round(totalKbps * 0.96 - settings.audioKbps));
  }
  return settings.videoKbps;
}

export function estimateBytes(durationSec: number, videoKbps: number, audioKbps: number, hasAudio = true): number {
  return ((videoKbps + (hasAudio ? audioKbps : 0)) * 1000 * durationSec) / 8 * 1.02;
}

const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g;

/** "{name}-compressed.mp4" applied to "Trip.MOV" -> "Trip-compressed.mp4". Always ends in .mp4. */
export function outputName(original: string, pattern: string): string {
  const base = original.replace(/\.[^.]+$/, "");
  let name = (pattern.trim() || "{name}-compressed.mp4").replace(/\{name\}/g, base).replace(INVALID, "_").trim();
  name = name.replace(/\.[a-z0-9]{2,4}$/i, "") + ".mp4";
  return name === ".mp4" ? `${base}-compressed.mp4` : name;
}

/** "clip-compressed.mp4" -> "clip-compressed-2.mp4" -> "-3"… */
export function numberedName(name: string, n: number): string {
  return n < 2 ? name : name.replace(/(\.[^.]+)$/, `-${n}$1`);
}

const HAS_INVALID = /[<>:"/\\|?*\u0000-\u001f]/;
export const isValidSubfolder = (s: string) => !s || (!HAS_INVALID.test(s) && s.trim() !== "." && s.trim() !== "..");
