"use client";

/**
 * ColorPickerWidget
 *
 * A self-contained color picker with:
 *   - Saturation/brightness 2D gradient area
 *   - Hue rainbow slider
 *   - Alpha slider
 *   - Format selector (Hex / RGB / HSL / OKLCH)
 *   - Color value text input
 *
 * Usage:
 *   <ColorPickerWidget value="#7F56D9" onChange={(v) => ...} />
 *
 * Also exports <ColorPickerField> which wraps the picker in a Popover
 * with a swatch + text preview trigger.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "./popover";

// ── Color math ────────────────────────────────────────────────────────────────

export type RGBA = { r: number; g: number; b: number; a: number };
type HSVA = { h: number; s: number; v: number; a: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === rn) h = (((gn - bn) / d) % 6) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    const c0 = clean[0] ?? "";
    const c1 = clean[1] ?? "";
    const c2 = clean[2] ?? "";
    const r = parseInt(c0 + c0, 16);
    const g = parseInt(c1 + c1, 16);
    const b = parseInt(c2 + c2, 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

// sRGB linear ↔ gamma
function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// OKLCH → RGB
function oklchToRgb(l: number, c: number, h: number): { r: number; g: number; b: number } {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bv = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bv;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bv;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bv;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  const linR = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const linG = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const linB = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return {
    r: Math.round(clamp(linearToSrgb(linR), 0, 1) * 255),
    g: Math.round(clamp(linearToSrgb(linG), 0, 1) * 255),
    b: Math.round(clamp(linearToSrgb(linB), 0, 1) * 255),
  };
}

// RGB → OKLCH
function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const linR = srgbToLinear(r / 255);
  const linG = srgbToLinear(g / 255);
  const linB = srgbToLinear(b / 255);

  const l = 0.4122214708 * linR + 0.5363325363 * linG + 0.0514459929 * linB;
  const m = 0.2119034982 * linR + 0.6806995451 * linG + 0.1073969566 * linB;
  const s = 0.0883024619 * linR + 0.2817188376 * linG + 0.6299787005 * linB;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bv = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + bv * bv);
  let h = (Math.atan2(bv, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

// ── CSS color parser ──────────────────────────────────────────────────────────

/** Parse a CSS channel value — e.g. "50%" → 127.5 (with max=255) or "127" → 127 */
function parseCssChannel(v: string, max: number) {
  return v.endsWith("%") ? (parseFloat(v) / 100) * max : parseFloat(v);
}

/** Parse any CSS color string to RGBA. Returns null if unparseable. */
export function parseCssColor(css: string): RGBA | null {
  if (!css || typeof css !== "string") return null;
  const s = css.trim();

  // Hex — supports #RGB (3), #RGBA (4), #RRGGBB (6), #RRGGBBAA (8).
  // hexToRgb only handles 3 and 6 char; expand shorthand and strip alpha before calling it.
  if (s.startsWith("#")) {
    const clean = s.replace(/^#/, "");
    let hexForRgb = s;
    let a = 1;

    if (clean.length === 4) {
      // #RGBA → expand each nibble, parse alpha from the 4th char.
      const [r, g, b, alpha] = [clean[0]!, clean[1]!, clean[2]!, clean[3]!];
      hexForRgb = `#${r}${r}${g}${g}${b}${b}`;
      a = parseInt(alpha + alpha, 16) / 255;
    } else if (clean.length === 8) {
      // #RRGGBBAA → strip the last two bytes for hexToRgb, parse alpha separately.
      hexForRgb = `#${clean.slice(0, 6)}`;
      a = parseInt(clean.slice(6, 8), 16) / 255;
    }

    const rgb = hexToRgb(hexForRgb);
    if (!rgb) return null;
    return { ...rgb, a };
  }

  // rgb / rgba
  const rgbMatch = s.match(
    /rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)/,
  );
  if (rgbMatch) {
    const rStr = rgbMatch[1] ?? "0";
    const gStr = rgbMatch[2] ?? "0";
    const bStr = rgbMatch[3] ?? "0";
    const aStr = rgbMatch[4];
    return {
      r: clamp(parseCssChannel(rStr, 255), 0, 255),
      g: clamp(parseCssChannel(gStr, 255), 0, 255),
      b: clamp(parseCssChannel(bStr, 255), 0, 255),
      a: aStr !== undefined ? (aStr.endsWith("%") ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1,
    };
  }

  // hsl / hsla
  const hslMatch = s.match(
    /hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)/,
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1] ?? "0");
    const sl = parseFloat(hslMatch[2] ?? "0") / 100;
    const l = parseFloat(hslMatch[3] ?? "0") / 100;
    const aStr = hslMatch[4];
    const a =
      aStr !== undefined ? (aStr.endsWith("%") ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1;
    // HSL → RGB
    const c = (1 - Math.abs(2 * l - 1)) * sl;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
      a,
    };
  }

  // oklch
  const oklchMatch = s.match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/,
  );
  if (oklchMatch) {
    const lvStr = oklchMatch[1] ?? "0";
    const lv = lvStr.endsWith("%") ? parseFloat(lvStr) / 100 : parseFloat(lvStr);
    const c = parseFloat(oklchMatch[2] ?? "0");
    const h = parseFloat(oklchMatch[3] ?? "0");
    const aStr = oklchMatch[4];
    const a =
      aStr !== undefined ? (aStr.endsWith("%") ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1;
    const rgb = oklchToRgb(lv, c, h);
    return { ...rgb, a };
  }

  return null;
}

// ── Format serializers ────────────────────────────────────────────────────────

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

function serializeColor(hsva: HSVA, format: ColorFormat): string {
  const { r, g, b } = hsvToRgb(hsva.h, hsva.s, hsva.v);
  const a = hsva.a;

  if (format === "hex") {
    const hex = rgbToHex(r, g, b);
    if (a < 1) {
      const ah = Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
      return hex + ah;
    }
    return hex;
  }

  if (format === "rgb") {
    if (a < 1) {
      return `rgb(${r} ${g} ${b} / ${Math.round(a * 100)}%)`;
    }
    return `rgb(${r} ${g} ${b})`;
  }

  if (format === "hsl") {
    // RGB → HSL
    const rn = r / 255,
      gn = g / 255,
      bn = b / 255;
    const max = Math.max(rn, gn, bn),
      min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0,
      s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = (((gn - bn) / d) % 6) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else h = ((rn - gn) / d + 4) * 60;
      if (h < 0) h += 360;
    }
    const hs = Math.round(h),
      ss = Math.round(s * 100),
      ls = Math.round(l * 100);
    if (a < 1) {
      return `hsl(${hs} ${ss}% ${ls}% / ${Math.round(a * 100)}%)`;
    }
    return `hsl(${hs} ${ss}% ${ls}%)`;
  }

  if (format === "oklch") {
    const { l, c, h } = rgbToOklch(r, g, b);
    const ls = l.toFixed(3),
      cs = c.toFixed(3),
      hs = Math.round(h);
    if (a < 1) {
      return `oklch(${ls} ${cs} ${hs} / ${Math.round(a * 100)}%)`;
    }
    return `oklch(${ls} ${cs} ${hs})`;
  }

  return rgbToHex(r, g, b);
}

// ── HSVA from CSS string ──────────────────────────────────────────────────────

function cssToHsva(css: string): HSVA {
  const rgba = parseCssColor(css);
  if (!rgba) return { h: 0, s: 1, v: 1, a: 1 };
  const { h, s, v } = rgbToHsv(rgba.r, rgba.g, rgba.b);
  return { h, s, v, a: rgba.a };
}

function hueToHex(h: number): string {
  const { r, g, b } = hsvToRgb(h, 1, 1);
  return rgbToHex(r, g, b);
}

// ── Color Picker Widget ───────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: "Hex",
  rgb: "RGB",
  hsl: "HSL",
  oklch: "OKLCH",
};

interface ColorPickerWidgetProps {
  value: string;
  onChange: (value: string) => void;
  defaultFormat?: ColorFormat;
}

export function ColorPickerWidget({
  value,
  onChange,
  defaultFormat = "hex",
}: ColorPickerWidgetProps) {
  const [hsva, setHsva] = useState<HSVA>(() => cssToHsva(value));
  const [format, setFormat] = useState<ColorFormat>(() => {
    // infer format from incoming value
    const v = value.trim();
    if (v.startsWith("#")) return "hex";
    if (v.startsWith("rgb")) return "rgb";
    if (v.startsWith("hsl")) return "hsl";
    if (v.startsWith("oklch")) return "oklch";
    return defaultFormat;
  });
  const [textInput, setTextInput] = useState(() => serializeColor(cssToHsva(value), format));
  const [formatOpen, setFormatOpen] = useState(false);

  const satRef = useRef<HTMLDivElement>(null);
  const isDraggingSat = useRef(false);

  // Sync external value changes (only when not dragging)
  useEffect(() => {
    if (!isDraggingSat.current) {
      const parsed = cssToHsva(value);
      setHsva(parsed);
      setTextInput(serializeColor(parsed, format));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitColor = useCallback(
    (next: HSVA) => {
      const serialized = serializeColor(next, format);
      setTextInput(serialized);
      onChange(serialized);
    },
    [format, onChange],
  );

  // Saturation/brightness pick
  const handleSatPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = satRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
      const next = { ...hsva, s, v };
      setHsva(next);
      emitColor(next);
    },
    [hsva, emitColor],
  );

  const startSatDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDraggingSat.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      handleSatPointer(e);
    },
    [handleSatPointer],
  );

  const endSatDrag = useCallback(() => {
    isDraggingSat.current = false;
  }, []);

  // Hue slider
  const handleHueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = parseFloat(e.target.value);
      const next = { ...hsva, h };
      setHsva(next);
      emitColor(next);
    },
    [hsva, emitColor],
  );

  // Alpha slider
  const handleAlphaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const a = parseFloat(e.target.value) / 100;
      const next = { ...hsva, a };
      setHsva(next);
      emitColor(next);
    },
    [hsva, emitColor],
  );

  // Text input
  const handleTextInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTextInput(e.target.value);
      const parsed = cssToHsva(e.target.value);
      const rgba = parseCssColor(e.target.value);
      if (rgba) {
        setHsva(parsed);
        onChange(e.target.value);
      }
    },
    [onChange],
  );

  // Format change
  const handleFormatChange = useCallback(
    (f: ColorFormat) => {
      setFormat(f);
      setFormatOpen(false);
      const serialized = serializeColor(hsva, f);
      setTextInput(serialized);
      onChange(serialized);
    },
    [hsva, onChange],
  );

  // Alpha text (opacity %)
  const handleAlphaTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = clamp(parseFloat(e.target.value) || 0, 0, 100);
      const a = pct / 100;
      const next = { ...hsva, a };
      setHsva(next);
      emitColor(next);
    },
    [hsva, emitColor],
  );

  // Derived values for rendering
  const hueColor = hueToHex(hsva.h);
  const { r, g, b } = hsvToRgb(hsva.h, hsva.s, hsva.v);
  const currentRgba = `rgba(${r},${g},${b},${hsva.a})`;
  const currentOpaque = `rgb(${r},${g},${b})`;
  const thumbX = `${hsva.s * 100}%`;
  const thumbY = `${(1 - hsva.v) * 100}%`;

  const FORMATS: ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];

  return (
    <div className="w-[260px] select-none space-y-3 p-3">
      {/* Saturation / Brightness area */}
      <div
        ref={satRef}
        className="relative h-40 w-full cursor-crosshair overflow-hidden rounded-lg"
        style={{
          background: `
            linear-gradient(to right, white, transparent),
            linear-gradient(to bottom, transparent, black),
            ${hueColor}
          `,
        }}
        onPointerDown={startSatDrag}
        onPointerMove={(e) => {
          if (e.buttons === 1 && isDraggingSat.current) handleSatPointer(e);
        }}
        onPointerUp={endSatDrag}
        onPointerCancel={endSatDrag}
      >
        {/* Thumb */}
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{
            left: thumbX,
            top: thumbY,
            background: currentOpaque,
          }}
        />
      </div>

      {/* Hue + alpha sliders */}
      <div className="space-y-2">
        {/* Hue slider */}
        <div className="relative h-3 w-full">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
            }}
          />
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(hsva.h)}
            onChange={handleHueChange}
            className="color-picker-range absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Hue"
          />
          {/* Thumb indicator */}
          <div
            className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{
              left: `${(hsva.h / 360) * 100}%`,
              background: hueColor,
            }}
          />
        </div>

        {/* Alpha slider */}
        <div className="relative h-3 w-full">
          {/* Checkerboard background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23fff'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23fff'/%3E%3C/svg%3E\")",
              backgroundRepeat: "repeat",
              backgroundSize: "8px 8px",
              borderRadius: "9999px",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(to right, transparent, ${currentOpaque})`,
            }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(hsva.a * 100)}
            onChange={handleAlphaChange}
            className="color-picker-range absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Opacity"
          />
          {/* Thumb indicator */}
          <div
            className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{
              left: `${hsva.a * 100}%`,
              background: currentRgba,
            }}
          />
        </div>
      </div>

      {/* Format + value inputs */}
      <div className="flex items-center gap-1.5">
        {/* Color swatch */}
        <div
          className="size-7 shrink-0 overflow-hidden rounded-md border border-border shadow-xs/5"
          style={{
            background: `
              url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23fff'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23fff'/%3E%3C/svg%3E"),
              ${currentRgba}
            `,
          }}
        />

        {/* Format selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFormatOpen((o) => !o)}
            className="flex items-center gap-0.5 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            {FORMAT_LABELS[format]}
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </button>
          {formatOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[70px] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleFormatChange(f)}
                  className={cn(
                    "block w-full px-3 py-1.5 text-left text-xs hover:bg-accent",
                    f === format && "bg-accent font-medium",
                  )}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Value input */}
        <input
          type="text"
          value={textInput}
          onChange={handleTextInput}
          onBlur={() => setTextInput(serializeColor(hsva, format))}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          spellCheck={false}
          aria-label="Color value"
        />

        {/* Opacity % */}
        <div className="flex items-center">
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(hsva.a * 100)}
            onChange={handleAlphaTextChange}
            className="w-12 rounded-md border border-input bg-background px-1.5 py-1 text-center font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            aria-label="Opacity percent"
          />
          <span className="ml-0.5 text-[10px] text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  );
}

// ── ColorPickerField: swatch + popover trigger ────────────────────────────────

interface ColorPickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

/**
 * A compact color field: shows a color swatch + the current value text.
 * Clicking opens a popover with the full color picker.
 */
export function ColorPickerField({
  value,
  onChange,
  placeholder = "Not set",
  label,
  className,
}: ColorPickerFieldProps) {
  const rgba = parseCssColor(value);
  const hasColor = rgba !== null && value !== "";
  const swatchBg = hasColor ? `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})` : "transparent";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-2 rounded-lg border border-input bg-background px-2 py-1.5 text-xs transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={label ?? "Pick a color"}
      >
        {/* Swatch */}
        <span
          className="relative size-5 shrink-0 overflow-hidden rounded-sm border border-border"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Crect width='3' height='3' fill='%23ccc'/%3E%3Crect x='3' y='3' width='3' height='3' fill='%23ccc'/%3E%3Crect x='3' y='0' width='3' height='3' fill='%23fff'/%3E%3Crect x='0' y='3' width='3' height='3' fill='%23fff'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat",
          }}
        >
          <span className="absolute inset-0" style={{ background: swatchBg }} />
        </span>

        {/* Value text */}
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
          {hasColor ? value : placeholder}
        </span>
      </PopoverTrigger>

      <PopoverPopup side="bottom" align="start" className="w-auto p-0">
        <ColorPickerWidget value={value || "#888888"} onChange={onChange} />
      </PopoverPopup>
    </Popover>
  );
}
