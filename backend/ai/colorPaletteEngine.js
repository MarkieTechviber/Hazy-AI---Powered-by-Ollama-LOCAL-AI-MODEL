'use strict';

// ============================================================================
// HAZY COLOR PALETTE ENGINE
// backend/ai/ui/colorPaletteEngine.js
// ============================================================================
//
// FLOW:
//   analyzeColorIntent(message, history)
//     ↓
//   detectExplicitColors()   → hex codes, named colors, rgb/hsl values
//   detectMoodTheme()        → mood words, theme words, style descriptors
//     ↓
//   If explicit colors found → deriveFullPaletteFromBase(hsl)
//   If mood/theme found      → selectPaletteByMood(mood)
//   If nothing found         → generateRandomPalette()
//     ↓
//   returns PaletteResult {
//     primary, secondary, accent,
//     background, surface, surfaceAlt,
//     text, textMuted, border,
//     name, source, seedColor, mode
//   }
//
// ============================================================================

// ── HSL ↔ HEX Utilities ──────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex) {
  let r = 0, g = 0, b = 0;
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return null;
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function rotateHue(h, degrees) {
  return (h + degrees + 360) % 360;
}

// ── Named Color Registry → HSL ────────────────────────────────────────────────

const NAMED_COLOR_MAP = {
  // Reds
  red:        { h: 0,   s: 85, l: 50 },
  crimson:    { h: 348, s: 83, l: 47 },
  rose:       { h: 330, s: 80, l: 60 },
  coral:      { h: 16,  s: 100, l: 66 },
  salmon:     { h: 6,   s: 93, l: 71 },
  tomato:     { h: 9,   s: 100, l: 56 },
  scarlet:    { h: 10,  s: 90, l: 45 },

  // Oranges
  orange:     { h: 30,  s: 100, l: 50 },
  amber:      { h: 38,  s: 92, l: 50 },
  tangerine:  { h: 25,  s: 95, l: 53 },
  peach:      { h: 28,  s: 87, l: 78 },
  gold:       { h: 43,  s: 74, l: 49 },
  honey:      { h: 40,  s: 86, l: 55 },
  copper:     { h: 28,  s: 65, l: 45 },

  // Yellows
  yellow:     { h: 55,  s: 97, l: 55 },
  lemon:      { h: 57,  s: 100, l: 60 },
  cream:      { h: 48,  s: 60, l: 90 },
  butter:     { h: 50,  s: 90, l: 80 },
  mustard:    { h: 44,  s: 78, l: 46 },

  // Greens
  green:      { h: 120, s: 61, l: 40 },
  lime:       { h: 90,  s: 70, l: 45 },
  mint:       { h: 152, s: 60, l: 62 },
  sage:       { h: 140, s: 30, l: 55 },
  emerald:    { h: 145, s: 63, l: 42 },
  forest:     { h: 134, s: 50, l: 25 },
  olive:      { h: 80,  s: 40, l: 35 },
  teal:       { h: 174, s: 72, l: 36 },
  seafoam:    { h: 160, s: 50, l: 65 },
  jade:       { h: 150, s: 60, l: 40 },

  // Blues
  blue:       { h: 217, s: 90, l: 56 },
  navy:       { h: 220, s: 75, l: 20 },
  sky:        { h: 200, s: 85, l: 60 },
  azure:      { h: 205, s: 75, l: 55 },
  cobalt:     { h: 215, s: 80, l: 42 },
  cerulean:   { h: 199, s: 85, l: 45 },
  indigo:     { h: 240, s: 65, l: 43 },
  denim:      { h: 213, s: 55, l: 45 },
  powder:     { h: 205, s: 70, l: 80 },
  periwinkle: { h: 230, s: 60, l: 72 },
  sapphire:   { h: 222, s: 78, l: 38 },

  // Purples / Violets
  purple:     { h: 270, s: 70, l: 50 },
  violet:     { h: 265, s: 75, l: 58 },
  lavender:   { h: 250, s: 65, l: 75 },
  lilac:      { h: 280, s: 55, l: 72 },
  plum:       { h: 300, s: 47, l: 35 },
  mauve:      { h: 305, s: 35, l: 63 },
  magenta:    { h: 300, s: 78, l: 50 },
  fuchsia:    { h: 296, s: 80, l: 55 },
  orchid:     { h: 302, s: 59, l: 65 },
  grape:      { h: 268, s: 55, l: 40 },
  amethyst:   { h: 280, s: 58, l: 62 },

  // Pinks
  pink:       { h: 340, s: 82, l: 72 },
  blush:      { h: 345, s: 65, l: 82 },
  flamingo:   { h: 337, s: 70, l: 76 },
  hot:        { h: 330, s: 100, l: 56 },  // "hot pink"
  pastel:     { h: 340, s: 40, l: 85 },   // generic pastel

  // Browns / Earthy
  brown:      { h: 25,  s: 55, l: 35 },
  wood:       { h: 30,  s: 60, l: 40 },
  tan:        { h: 34,  s: 44, l: 69 },
  khaki:      { h: 37,  s: 42, l: 65 },
  beige:      { h: 40,  s: 35, l: 82 },
  sand:       { h: 38,  s: 50, l: 75 },
  caramel:    { h: 30,  s: 65, l: 50 },
  chocolate:  { h: 25,  s: 60, l: 28 },
  mocha:      { h: 22,  s: 40, l: 38 },
  walnut:     { h: 20,  s: 55, l: 30 },

  // Neutrals
  white:      { h: 0,   s: 0,  l: 100 },
  black:      { h: 0,   s: 0,  l: 5  },
  gray:       { h: 0,   s: 0,  l: 50 },
  grey:       { h: 0,   s: 0,  l: 50 },
  silver:     { h: 0,   s: 10, l: 75 },
  charcoal:   { h: 210, s: 8,  l: 20 },
  slate:      { h: 210, s: 15, l: 40 },
  ash:        { h: 200, s: 8,  l: 60 },
  ivory:      { h: 48,  s: 40, l: 94 },
  smoke:      { h: 200, s: 5,  l: 88 },

  // Special
  neon:       { h: 120, s: 100, l: 50 }, // generic neon → green
  cyan:       { h: 185, s: 90, l: 50 },
  turquoise:  { h: 174, s: 72, l: 56 },
  bronze:     { h: 30,  s: 65, l: 42 },
  steel:      { h: 207, s: 22, l: 52 },
  electric:   { h: 218, s: 100, l: 60 }, // electric blue
};

// ── Mood / Theme Keyword Registry ─────────────────────────────────────────────
//
// Each mood maps to a curated HSL seed + mode + personality notes
// ─────────────────────────────────────────────────────────────────────────────

const MOOD_PALETTE_MAP = {
  // ── Dark themes ─────────────────────────────────────────────────────────────
  dark:        { seed: { h: 220, s: 15, l: 12 }, mode: 'dark',  name: 'Deep Dark' },
  midnight:    { seed: { h: 228, s: 30, l: 10 }, mode: 'dark',  name: 'Midnight' },
  noir:        { seed: { h: 0,   s: 0,  l: 8  }, mode: 'dark',  name: 'Noir' },
  dracula:     { seed: { h: 265, s: 50, l: 20 }, mode: 'dark',  name: 'Dracula' },
  abyss:       { seed: { h: 240, s: 25, l: 8  }, mode: 'dark',  name: 'Abyss' },
  obsidian:    { seed: { h: 200, s: 10, l: 10 }, mode: 'dark',  name: 'Obsidian' },

  // ── Light themes ────────────────────────────────────────────────────────────
  light:       { seed: { h: 220, s: 15, l: 96 }, mode: 'light', name: 'Clean Light' },
  minimal:     { seed: { h: 0,   s: 0,  l: 97 }, mode: 'light', name: 'Minimal' },
  minimalist:  { seed: { h: 0,   s: 0,  l: 97 }, mode: 'light', name: 'Minimalist' },
  clean:       { seed: { h: 210, s: 20, l: 96 }, mode: 'light', name: 'Clean' },
  paper:       { seed: { h: 40,  s: 15, l: 95 }, mode: 'light', name: 'Paper' },
  snow:        { seed: { h: 210, s: 5,  l: 98 }, mode: 'light', name: 'Snow White' },
  arctic:      { seed: { h: 200, s: 30, l: 95 }, mode: 'light', name: 'Arctic' },
  daylight:    { seed: { h: 45,  s: 20, l: 96 }, mode: 'light', name: 'Daylight' },

  // ── Warm themes ─────────────────────────────────────────────────────────────
  warm:        { seed: { h: 28,  s: 60, l: 52 }, mode: 'warm',  name: 'Warm Amber' },
  cozy:        { seed: { h: 25,  s: 55, l: 45 }, mode: 'warm',  name: 'Cozy' },
  earthy:      { seed: { h: 30,  s: 45, l: 42 }, mode: 'warm',  name: 'Earth Tones' },
  autumn:      { seed: { h: 22,  s: 75, l: 48 }, mode: 'warm',  name: 'Autumn' },
  sunset:      { seed: { h: 15,  s: 80, l: 55 }, mode: 'warm',  name: 'Sunset' },
  desert:      { seed: { h: 35,  s: 55, l: 60 }, mode: 'warm',  name: 'Desert' },
  cafe:        { seed: { h: 24,  s: 50, l: 38 }, mode: 'warm',  name: 'Café Brown' },
  wooden:      { seed: { h: 28,  s: 55, l: 40 }, mode: 'warm',  name: 'Wood' },

  // ── Cool themes ─────────────────────────────────────────────────────────────
  cool:        { seed: { h: 210, s: 60, l: 48 }, mode: 'cool',  name: 'Cool Blue' },
  ocean:       { seed: { h: 200, s: 70, l: 45 }, mode: 'cool',  name: 'Ocean' },
  arctic2:     { seed: { h: 195, s: 55, l: 60 }, mode: 'cool',  name: 'Arctic Blue' },
  winter:      { seed: { h: 210, s: 40, l: 75 }, mode: 'cool',  name: 'Winter' },
  steel2:      { seed: { h: 208, s: 20, l: 45 }, mode: 'cool',  name: 'Steel' },
  ice:         { seed: { h: 195, s: 30, l: 88 }, mode: 'cool',  name: 'Ice' },

  // ── Neon / Cyberpunk ─────────────────────────────────────────────────────────
  neon:        { seed: { h: 155, s: 100, l: 50 }, mode: 'neon', name: 'Neon Green' },
  cyberpunk:   { seed: { h: 300, s: 100, l: 55 }, mode: 'neon', name: 'Cyberpunk' },
  vaporwave:   { seed: { h: 290, s: 80,  l: 65 }, mode: 'neon', name: 'Vaporwave' },
  synthwave:   { seed: { h: 270, s: 90,  l: 60 }, mode: 'neon', name: 'Synthwave' },
  electric:    { seed: { h: 218, s: 100, l: 62 }, mode: 'neon', name: 'Electric' },
  matrix:      { seed: { h: 120, s: 100, l: 45 }, mode: 'neon', name: 'Matrix' },

  // ── Pastel ───────────────────────────────────────────────────────────────────
  pastel:      { seed: { h: 330, s: 40,  l: 85 }, mode: 'pastel', name: 'Pastel Pink' },
  soft:        { seed: { h: 220, s: 35,  l: 88 }, mode: 'pastel', name: 'Soft' },
  cotton:      { seed: { h: 200, s: 30,  l: 87 }, mode: 'pastel', name: 'Cotton Candy' },
  dreamy:      { seed: { h: 260, s: 40,  l: 82 }, mode: 'pastel', name: 'Dreamy' },
  spring:      { seed: { h: 150, s: 40,  l: 82 }, mode: 'pastel', name: 'Spring Pastel' },
  bubblegum:   { seed: { h: 315, s: 50,  l: 80 }, mode: 'pastel', name: 'Bubblegum' },
  kawaii:      { seed: { h: 340, s: 55,  l: 82 }, mode: 'pastel', name: 'Kawaii' },

  // ── Nature / Forest ──────────────────────────────────────────────────────────
  forest:      { seed: { h: 134, s: 45,  l: 28 }, mode: 'nature', name: 'Forest' },
  jungle:      { seed: { h: 128, s: 55,  l: 25 }, mode: 'nature', name: 'Jungle' },
  nature:      { seed: { h: 130, s: 40,  l: 38 }, mode: 'nature', name: 'Nature' },
  botanical:   { seed: { h: 145, s: 38,  l: 40 }, mode: 'nature', name: 'Botanical' },
  moss:        { seed: { h: 88,  s: 40,  l: 32 }, mode: 'nature', name: 'Moss' },
  bamboo:      { seed: { h: 80,  s: 45,  l: 45 }, mode: 'nature', name: 'Bamboo' },

  // ── Space / Galaxy ───────────────────────────────────────────────────────────
  space:       { seed: { h: 240, s: 35,  l: 10 }, mode: 'dark',   name: 'Space' },
  galaxy:      { seed: { h: 255, s: 50,  l: 15 }, mode: 'dark',   name: 'Galaxy' },
  cosmic:      { seed: { h: 265, s: 55,  l: 18 }, mode: 'dark',   name: 'Cosmic' },
  nebula:      { seed: { h: 285, s: 60,  l: 20 }, mode: 'dark',   name: 'Nebula' },

  // ── Professional / Corporate ─────────────────────────────────────────────────
  professional:{ seed: { h: 215, s: 50,  l: 35 }, mode: 'pro',    name: 'Professional' },
  corporate:   { seed: { h: 218, s: 45,  l: 30 }, mode: 'pro',    name: 'Corporate' },
  formal:      { seed: { h: 222, s: 40,  l: 25 }, mode: 'pro',    name: 'Formal' },
  executive:   { seed: { h: 215, s: 35,  l: 20 }, mode: 'pro',    name: 'Executive' },
  business:    { seed: { h: 212, s: 48,  l: 32 }, mode: 'pro',    name: 'Business' },

  // ── Fun / Playful ────────────────────────────────────────────────────────────
  fun:         { seed: { h: 40,  s: 100, l: 55 }, mode: 'vibrant', name: 'Fun' },
  vibrant:     { seed: { h: 25,  s: 95,  l: 55 }, mode: 'vibrant', name: 'Vibrant' },
  playful:     { seed: { h: 32,  s: 90,  l: 58 }, mode: 'vibrant', name: 'Playful' },
  retro:       { seed: { h: 15,  s: 80,  l: 55 }, mode: 'vibrant', name: 'Retro' },
  pop:         { seed: { h: 0,   s: 85,  l: 60 }, mode: 'vibrant', name: 'Pop Art' },
  candy:       { seed: { h: 335, s: 80,  l: 65 }, mode: 'vibrant', name: 'Candy' },

  // ── Luxury / Premium ─────────────────────────────────────────────────────────
  luxury:      { seed: { h: 35,  s: 65,  l: 42 }, mode: 'luxury',  name: 'Luxury Gold' },
  premium:     { seed: { h: 30,  s: 55,  l: 38 }, mode: 'luxury',  name: 'Premium' },
  elegant:     { seed: { h: 275, s: 40,  l: 32 }, mode: 'luxury',  name: 'Elegant' },
  royal:       { seed: { h: 250, s: 65,  l: 35 }, mode: 'luxury',  name: 'Royal' },
  gold:        { seed: { h: 43,  s: 74,  l: 49 }, mode: 'luxury',  name: 'Gold' },
  platinum:    { seed: { h: 210, s: 15,  l: 75 }, mode: 'luxury',  name: 'Platinum' },

  // ── Gaming ───────────────────────────────────────────────────────────────────
  gaming:      { seed: { h: 150, s: 100, l: 45 }, mode: 'gaming',  name: 'Gaming Green' },
  esports:     { seed: { h: 210, s: 100, l: 55 }, mode: 'gaming',  name: 'Esports' },
  gamer:       { seed: { h: 265, s: 90,  l: 55 }, mode: 'gaming',  name: 'Gamer Purple' },
  arcade:      { seed: { h: 50,  s: 100, l: 52 }, mode: 'gaming',  name: 'Arcade' },
};

// ── Random Palette Pool ───────────────────────────────────────────────────────
// 30 hand-picked beautiful palettes guaranteed to look great
// Used when user provides no color or mood hints at all

const RANDOM_PALETTE_POOL = [
  { h: 222, s: 65, l: 45, mode: 'cool',    name: 'Cobalt Night' },
  { h: 265, s: 62, l: 48, mode: 'cool',    name: 'Violet Dusk' },
  { h: 155, s: 58, l: 38, mode: 'nature',  name: 'Emerald Isle' },
  { h: 27,  s: 72, l: 48, mode: 'warm',    name: 'Amber Wood' },
  { h: 340, s: 65, l: 52, mode: 'vibrant', name: 'Crimson Rose' },
  { h: 195, s: 68, l: 42, mode: 'cool',    name: 'Pacific Teal' },
  { h: 35,  s: 80, l: 50, mode: 'warm',    name: 'Burnt Orange' },
  { h: 228, s: 28, l: 15, mode: 'dark',    name: 'Midnight Navy' },
  { h: 134, s: 44, l: 28, mode: 'nature',  name: 'Deep Forest' },
  { h: 300, s: 70, l: 50, mode: 'vibrant', name: 'Electric Orchid' },
  { h: 42,  s: 68, l: 46, mode: 'warm',    name: 'Golden Caramel' },
  { h: 215, s: 85, l: 55, mode: 'cool',    name: 'Azure Sky' },
  { h: 175, s: 55, l: 38, mode: 'nature',  name: 'Jade Sea' },
  { h: 250, s: 75, l: 58, mode: 'cool',    name: 'Indigo Dream' },
  { h: 18,  s: 70, l: 50, mode: 'warm',    name: 'Terracotta' },
  { h: 185, s: 62, l: 44, mode: 'cool',    name: 'Deep Cyan' },
  { h: 330, s: 55, l: 60, mode: 'vibrant', name: 'Cherry Blossom' },
  { h: 30,  s: 42, l: 30, mode: 'dark',    name: 'Dark Espresso' },
  { h: 210, s: 38, l: 18, mode: 'dark',    name: 'Carbon Blue' },
  { h: 160, s: 48, l: 42, mode: 'nature',  name: 'Sage Garden' },
  { h: 285, s: 42, l: 28, mode: 'dark',    name: 'Dark Plum' },
  { h: 50,  s: 82, l: 55, mode: 'vibrant', name: 'Sunflower' },
  { h: 200, s: 55, l: 52, mode: 'cool',    name: 'Steel Blue' },
  { h: 350, s: 80, l: 48, mode: 'vibrant', name: 'Vermillion' },
  { h: 92,  s: 50, l: 38, mode: 'nature',  name: 'Olive Grove' },
  { h: 225, s: 55, l: 58, mode: 'cool',    name: 'Periwinkle' },
  { h: 15,  s: 60, l: 40, mode: 'warm',    name: 'Russet' },
  { h: 270, s: 58, l: 65, mode: 'cool',    name: 'Soft Violet' },
  { h: 145, s: 68, l: 44, mode: 'nature',  name: 'Malachite' },
  { h: 38,  s: 55, l: 68, mode: 'warm',    name: 'Warm Sand' },
];

// ── Palette Derivation from a Seed HSL ────────────────────────────────────────
//
// Given a primary hue/saturation/lightness, derives a full 9-color palette
// using color theory: analogous, complementary, and lightness scale
// ─────────────────────────────────────────────────────────────────────────────

function deriveFullPalette(seed, paletteName, source) {
  const { h, s, l } = seed;
  const mode = seed.mode || (l < 30 ? 'dark' : l > 70 ? 'light' : 'mid');

  // Primary color — the base
  const primary = hslToHex(h, clamp(s, 40, 95), clamp(l, 30, 65));

  // Secondary — analogous (+30° hue), slightly desaturated
  const secondary = hslToHex(
    rotateHue(h, 30),
    clamp(s - 15, 25, 80),
    clamp(l + 5, 30, 70)
  );

  // Accent — complementary (180°) or split-complementary if saturation is low
  const accentHue = s > 50
    ? rotateHue(h, 180)          // full complement for vivid colors
    : rotateHue(h, 150);         // split-complement for muted colors
  const accent = hslToHex(accentHue, clamp(s + 10, 50, 100), clamp(l, 40, 65));

  // Backgrounds and surfaces depend on mode
  let background, surface, surfaceAlt, text, textMuted, border;

  if (mode === 'dark' || mode === 'gaming' || mode === 'neon' || (mode === 'pro' && l < 30)) {
    background  = hslToHex(h, clamp(s * 0.15, 5, 25), clamp(l * 0.6, 6, 15));
    surface     = hslToHex(h, clamp(s * 0.18, 6, 28), clamp(l * 0.8, 10, 22));
    surfaceAlt  = hslToHex(h, clamp(s * 0.20, 8, 30), clamp(l * 1.0, 14, 28));
    text        = hslToHex(h, clamp(s * 0.10, 3, 15), 93);
    textMuted   = hslToHex(h, clamp(s * 0.12, 5, 18), 65);
    border      = hslToHex(h, clamp(s * 0.20, 8, 30), clamp(l * 1.2, 18, 35));
  } else if (mode === 'light' || mode === 'pastel' || (mode !== 'warm' && l > 60)) {
    background  = hslToHex(h, clamp(s * 0.12, 3, 18), 97);
    surface     = hslToHex(h, clamp(s * 0.15, 5, 20), 94);
    surfaceAlt  = hslToHex(h, clamp(s * 0.18, 6, 22), 90);
    text        = hslToHex(h, clamp(s * 0.30, 10, 40), 12);
    textMuted   = hslToHex(h, clamp(s * 0.20, 8, 30), 45);
    border      = hslToHex(h, clamp(s * 0.15, 5, 20), 84);
  } else if (mode === 'warm' || mode === 'luxury') {
    background  = hslToHex(h, clamp(s * 0.20, 8, 28), clamp(l - 30, 10, 22));
    surface     = hslToHex(h, clamp(s * 0.25, 10, 32), clamp(l - 20, 15, 28));
    surfaceAlt  = hslToHex(h, clamp(s * 0.28, 12, 35), clamp(l - 12, 20, 35));
    text        = hslToHex(h, clamp(s * 0.15, 5, 22), 93);
    textMuted   = hslToHex(h, clamp(s * 0.18, 8, 28), 68);
    border      = hslToHex(h, clamp(s * 0.25, 12, 35), clamp(l - 10, 22, 38));
  } else {
    // mid / cool / nature / vibrant — derive intelligently
    const bgL = l < 50 ? 10 : 94;
    background  = hslToHex(h, clamp(s * 0.15, 5, 22), bgL);
    surface     = hslToHex(h, clamp(s * 0.18, 6, 25), bgL < 50 ? bgL + 6 : bgL - 4);
    surfaceAlt  = hslToHex(h, clamp(s * 0.20, 8, 28), bgL < 50 ? bgL + 12 : bgL - 8);
    text        = bgL < 50
      ? hslToHex(h, 5,  92)
      : hslToHex(h, 20, 12);
    textMuted   = bgL < 50
      ? hslToHex(h, 10, 62)
      : hslToHex(h, 15, 40);
    border      = hslToHex(h, clamp(s * 0.18, 6, 25), bgL < 50 ? bgL + 18 : bgL - 12);
  }

  return {
    primary,
    secondary,
    accent,
    background,
    surface,
    surfaceAlt,
    text,
    textMuted,
    border,
    name: paletteName || `${h}° Palette`,
    source: source || 'derived',
    seedColor: hslToHex(h, s, l),
    mode,
    hsl: { h, s, l }
  };
}

// ── Explicit Color Detection ───────────────────────────────────────────────────

function detectExplicitColors(text) {
  const lower = text.toLowerCase();
  const found = [];

  // 1. Hex codes — #fff, #ffffff, #FFFFFF
  const hexMatches = text.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) || [];
  for (const hex of hexMatches) {
    const hsl = hexToHsl(hex);
    if (hsl) found.push({ hsl, raw: hex, confidence: 99 });
  }

  // 2. rgb() / hsl() values
  const rgbMatch = text.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const hex = `#${Number(rgbMatch[1]).toString(16).padStart(2,'0')}${Number(rgbMatch[2]).toString(16).padStart(2,'0')}${Number(rgbMatch[3]).toString(16).padStart(2,'0')}`;
    const hsl = hexToHsl(hex);
    if (hsl) found.push({ hsl, raw: rgbMatch[0], confidence: 99 });
  }

  const hslMatch = text.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
  if (hslMatch) {
    found.push({
      hsl: { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) },
      raw: hslMatch[0],
      confidence: 99
    });
  }

  // 3. Named colors — scan longest match first to avoid "red" matching before "dark red"
  const sortedNames = Object.keys(NAMED_COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    // word-boundary aware check
    const pattern = new RegExp(`\\b${name}\\b`, 'i');
    if (pattern.test(lower)) {
      found.push({ hsl: NAMED_COLOR_MAP[name], raw: name, confidence: 85 });
    }
  }

  // Deduplicate by raw value
  const seen = new Set();
  return found.filter((item) => {
    const key = item.raw.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Mood / Theme Keyword Detection ────────────────────────────────────────────

function detectMoodTheme(text) {
  const lower = text.toLowerCase();
  const found = [];

  // Check compound phrases first (e.g. "dark blue", "warm orange")
  // These should resolve to the named color with mode context, not just mood
  const sortedMoods = Object.keys(MOOD_PALETTE_MAP).sort((a, b) => b.length - a.length);
  for (const mood of sortedMoods) {
    const pattern = new RegExp(`\\b${mood}\\b`, 'i');
    if (pattern.test(lower)) {
      found.push({ mood, entry: MOOD_PALETTE_MAP[mood] });
    }
  }

  // Deduplicate
  const seen = new Set();
  return found.filter((item) => {
    if (seen.has(item.mood)) return false;
    seen.add(item.mood);
    return true;
  });
}

// ── Primary Entry Point ───────────────────────────────────────────────────────

/**
 * analyzeColorIntent
 *
 * @param {string}   message            - The current user message
 * @param {string[]} conversationHistory - Recent conversation turns (optional, for fallback context)
 * @returns {PaletteResult}
 */
function analyzeColorIntent(message = '', conversationHistory = []) {
  const fullContext = [message, ...conversationHistory.slice(0, 5)].join(' ');

  // ── Step 1: Explicit color detection (highest priority) ──────────────────
  const explicitColors = detectExplicitColors(fullContext);
  if (explicitColors.length > 0) {
    // Use the highest confidence / first detected color as the primary seed
    const primary = explicitColors[0];

    // If multiple colors detected, blend hues for a richer seed
    let seedHsl = { ...primary.hsl };
    if (explicitColors.length >= 2) {
      // Slightly pull the primary hue toward the second color for harmony
      const secondary = explicitColors[1];
      seedHsl.h = Math.round((primary.hsl.h * 2 + secondary.hsl.h) / 3);
      seedHsl.s = Math.round((primary.hsl.s + secondary.hsl.s) / 2);
    }

    // Determine mode from lightness
    const lightness = seedHsl.l;
    seedHsl.mode = lightness < 25 ? 'dark' : lightness > 75 ? 'light' : 'mid';

    // Override mode if dark/light mood words also appear in the message
    const moods = detectMoodTheme(message);
    for (const m of moods) {
      if (['dark', 'midnight', 'noir'].includes(m.mood)) { seedHsl.mode = 'dark'; break; }
      if (['light', 'minimal', 'clean'].includes(m.mood)) { seedHsl.mode = 'light'; break; }
    }

    const colorNames = explicitColors.map(c => c.raw).join(' + ');
    return deriveFullPalette(seedHsl, `Custom: ${colorNames}`, 'explicit_color');
  }

  // ── Step 2: Mood / theme keyword detection ───────────────────────────────
  const moods = detectMoodTheme(message);
  if (moods.length > 0) {
    // Use the first (longest-matched) mood as primary
    const primary = moods[0];
    const seed = { ...primary.entry.seed, mode: primary.entry.seed.mode || primary.entry.mode };

    // If a second mood modifies lightness, apply it
    if (moods.length >= 2) {
      const mod = moods[1];
      if (['dark', 'midnight', 'noir'].includes(mod.mood)) seed.mode = 'dark';
      if (['light', 'minimal', 'clean', 'pastel', 'soft'].includes(mod.mood)) seed.mode = 'light';
    }

    return deriveFullPalette(seed, primary.entry.name, 'mood_theme');
  }

  // ── Step 3: No hints at all — generate a random beautiful palette ────────
  const randomEntry = RANDOM_PALETTE_POOL[Math.floor(Math.random() * RANDOM_PALETTE_POOL.length)];
  return deriveFullPalette(
    { h: randomEntry.h, s: randomEntry.s, l: randomEntry.l, mode: randomEntry.mode },
    randomEntry.name,
    'random_generated'
  );
}

// ── Format Palette for Prompt Injection ───────────────────────────────────────
//
// Returns a structured string block that promptBuilder.js injects into the
// system prompt when the request is UI-related
// ─────────────────────────────────────────────────────────────────────────────

function formatPaletteForPrompt(palette) {
  return [
    `## UI COLOR PALETTE — USE THESE EXACT VALUES`,
    `Palette name: ${palette.name}`,
    `Source: ${palette.source} | Mode: ${palette.mode}`,
    ``,
    `PRIMARY COLORS:`,
    `  --color-primary:     ${palette.primary}`,
    `  --color-secondary:   ${palette.secondary}`,
    `  --color-accent:      ${palette.accent}`,
    ``,
    `SURFACES:`,
    `  --color-background:  ${palette.background}`,
    `  --color-surface:     ${palette.surface}`,
    `  --color-surface-alt: ${palette.surfaceAlt}`,
    ``,
    `TEXT:`,
    `  --color-text:        ${palette.text}`,
    `  --color-text-muted:  ${palette.textMuted}`,
    ``,
    `BORDERS:`,
    `  --color-border:      ${palette.border}`,
    ``,
    `CRITICAL RULES:`,
    `  - Use ONLY these hex values for all colors in the generated UI`,
    `  - Do NOT invent new colors outside this palette`,
    `  - Apply --color-primary for buttons, links, headings, highlights`,
    `  - Apply --color-secondary for hover states, tags, badges`,
    `  - Apply --color-accent for call-to-action elements, icons, decorative highlights`,
    `  - Apply --color-background as the page/app background`,
    `  - Apply --color-surface for cards, panels, modals`,
    `  - Apply --color-surface-alt for table rows, input backgrounds, nested panels`,
    `  - Apply --color-text for all body text`,
    `  - Apply --color-text-muted for captions, placeholders, secondary labels`,
    `  - Apply --color-border for dividers, input outlines, card borders`,
    `  - Define these as CSS custom properties at :root { } level`,
    `  - Reference them consistently across ALL files in the project`,
  ].join('\n');
}

// ── isUIRequest ────────────────────────────────────────────────────────────────
//
// Lightweight check: does this coding request involve UI/visual output?
// Used by promptBuilder to decide whether to inject the palette block
// ─────────────────────────────────────────────────────────────────────────────

const UI_REQUEST_PATTERNS = [
  /\b(html|css|ui|interface|frontend|front.end|webpage|website|web\s*app|landing\s*page|dashboard|portfolio|form|layout|design|component|button|card|modal|navbar|sidebar|hero|animation|game|canvas|svg|styled|tailwind|bootstrap|material|chakra|shadcn|theme|dark\s*mode|light\s*mode|responsive|mobile)\b/i,
  /\b(react|vue|svelte|angular|next\.?js|nuxt|astro|remix)\b/i,
  /\.(html|css|scss|sass|less|jsx|tsx|svelte)\b/i,
];

function isUIRequest(message = '', codeAnalysis = null) {
  if (codeAnalysis?.codeType === 'ui' || codeAnalysis?.codeType === 'web') return true;
  if (codeAnalysis?.frameworks?.some(f => /react|vue|svelte|angular|tailwind|bootstrap/i.test(f))) return true;
  return UI_REQUEST_PATTERNS.some(p => p.test(message));
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  analyzeColorIntent,
  formatPaletteForPrompt,
  isUIRequest,
  deriveFullPalette,
  detectExplicitColors,
  detectMoodTheme,
  hslToHex,
  hexToHsl,
  NAMED_COLOR_MAP,
  MOOD_PALETTE_MAP,
  RANDOM_PALETTE_POOL,
};
