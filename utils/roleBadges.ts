import type { CSSProperties } from "react";

export const ROLE_BADGE_COLOR_HEX: Record<string, string> = {
  slate: "#334155",
  gray: "#374151",
  zinc: "#3f3f46",
  neutral: "#404040",
  stone: "#44403c",
  red: "#b91c1c",
  orange: "#c2410c",
  amber: "#b45309",
  yellow: "#a16207",
  lime: "#4d7c0f",
  green: "#15803d",
  emerald: "#047857",
  teal: "#0f766e",
  cyan: "#0e7490",
  sky: "#0369a1",
  blue: "#1d4ed8",
  indigo: "#4338ca",
  violet: "#6d28d9",
  purple: "#7e22ce",
  fuchsia: "#a21caf",
  pink: "#be185d",
  rose: "#be123c",
  neon_blue: "#00ccff",
  neon_pink: "#ff00a0",
  neon_green: "#39ff14",
  neon_purple: "#bc13fe",
  hot_orange: "#ff5300",
  bright_yellow: "#ffeb00",
  magenta: "#ff00ff",
  cyber_yellow: "#ffd300",
  electric_lime: "#ccff00",
  fluorescent_blue: "#15f2d6",
  laser_lemon: "#ffff66",
  neon_cyan: "#00ffff",
  neon_red: "#ff003c",
  neon_orange: "#ff9900",
  plasma_pink: "#ff0099",
  toxic_green: "#66ff00",
  uranium_green: "#00ff33",
  vivid_violet: "#9f00ff",
  proton_purple: "#8a2be2",
  hyper_pink: "#ff1493",
  radiant_red: "#ff3131",
  electric_indigo: "#6f00ff",
  chartreuse_yellow: "#dfff00",
  aquamarine: "#7fffd4",
  spring_green: "#00fa9a",
};

export const ROLE_BADGE_COLOR_OPTIONS = [
  { value: "slate", label: "Slate" },
  { value: "gray", label: "Gray" },
  { value: "zinc", label: "Zinc" },
  { value: "neutral", label: "Neutral" },
  { value: "stone", label: "Stone" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "amber", label: "Amber" },
  { value: "yellow", label: "Yellow" },
  { value: "lime", label: "Lime" },
  { value: "green", label: "Green" },
  { value: "emerald", label: "Emerald" },
  { value: "teal", label: "Teal" },
  { value: "cyan", label: "Cyan" },
  { value: "sky", label: "Sky" },
  { value: "blue", label: "Blue" },
  { value: "indigo", label: "Indigo" },
  { value: "violet", label: "Violet" },
  { value: "purple", label: "Purple" },
  { value: "fuchsia", label: "Fuchsia" },
  { value: "pink", label: "Pink" },
  { value: "rose", label: "Rose" },
];

export const ROLE_BADGE_NEON_COLOR_OPTIONS = [
  { value: "neon_blue", label: "Neon Blue" },
  { value: "neon_pink", label: "Neon Pink" },
  { value: "neon_green", label: "Neon Green" },
  { value: "neon_purple", label: "Neon Purple" },
  { value: "hot_orange", label: "Hot Orange" },
  { value: "bright_yellow", label: "Bright Yellow" },
  { value: "magenta", label: "Magenta" },
  { value: "cyber_yellow", label: "Cyber Yellow" },
  { value: "electric_lime", label: "Electric Lime" },
  { value: "fluorescent_blue", label: "Fluorescent Blue" },
  { value: "laser_lemon", label: "Laser Lemon" },
  { value: "neon_cyan", label: "Neon Cyan" },
  { value: "neon_red", label: "Neon Red" },
  { value: "neon_orange", label: "Neon Orange" },
  { value: "plasma_pink", label: "Plasma Pink" },
  { value: "toxic_green", label: "Toxic Green" },
  { value: "uranium_green", label: "Uranium Green" },
  { value: "vivid_violet", label: "Vivid Violet" },
  { value: "proton_purple", label: "Proton Purple" },
  { value: "hyper_pink", label: "Hyper Pink" },
  { value: "radiant_red", label: "Radiant Red" },
  { value: "electric_indigo", label: "Electric Indigo" },
  { value: "chartreuse_yellow", label: "Chartreuse Yellow" },
  { value: "aquamarine", label: "Aquamarine" },
  { value: "spring_green", label: "Spring Green" },
];

const DEFAULT_ROLE_BADGE_COLORS: Record<string, string> = {
  "super admin": "blue",
  "registry editor": "emerald",
  "inventory lead": "amber",
  viewer: "slate",
  "report contributor": "violet",
};

const FALLBACK_ROLE_BADGE_COLORS = [
  "blue",
  "emerald",
  "amber",
  "violet",
  "rose",
  "cyan",
  "slate",
];

export const isValidRoleBadgeColor = (badgeColor?: string): boolean =>
  Boolean(badgeColor && ROLE_BADGE_COLOR_HEX[badgeColor]);

export const getDefaultRoleBadgeColor = (
  roleName?: string,
  fallbackIndex = 0,
): string => {
  const normalizedName = roleName?.trim().toLowerCase() || "";
  if (normalizedName && DEFAULT_ROLE_BADGE_COLORS[normalizedName]) {
    return DEFAULT_ROLE_BADGE_COLORS[normalizedName];
  }

  return FALLBACK_ROLE_BADGE_COLORS[
    Math.abs(fallbackIndex) % FALLBACK_ROLE_BADGE_COLORS.length
  ];
};

export const normalizeRoleBadgeColor = (
  badgeColor: string | undefined,
  roleName?: string,
  fallbackIndex = 0,
): string =>
  isValidRoleBadgeColor(badgeColor)
    ? badgeColor!
    : getDefaultRoleBadgeColor(roleName, fallbackIndex);

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(29, 78, 216, ${alpha})`;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getRoleBadgeStyle = (badgeColor?: string): CSSProperties => {
  const normalizedColor = normalizeRoleBadgeColor(badgeColor, undefined, 0);
  const baseColor = ROLE_BADGE_COLOR_HEX[normalizedColor];

  return {
    color: baseColor,
    backgroundColor: hexToRgba(baseColor, 0.12),
    borderColor: hexToRgba(baseColor, 0.28),
  };
};
