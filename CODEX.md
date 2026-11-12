# CODEX.md - AI Coding Assistant Context & Guide

This file provides system context, architecture details, and coding conventions for OpenAI Codex, Claude, Cursor, and other AI coding assistants working on **Pointillism Studio**.

---

## 🎯 Project Overview

- **Project**: Pointillism Studio
- **Core Purpose**: A client-side web application that transforms user-supplied images into pointillist and halftone vector/bitmap art using stochastic sampling and customizable geometric/image brushes.
- **Tech Stack**: React 19, TypeScript (~5.8), Vite 6, Tailwind CSS v4, Lucide React, Motion.
- **Primary Source File**: `src/App.tsx` (contains the rendering engine, toolbar controls, preset manager, and export routines).

---

## 🏗️ Architecture & Key Components

### 1. Canvas Pipeline (`src/App.tsx`)

There are three key canvas references:
- `sourceCanvasRef`: Hidden canvas that holds the sampled source image with applied CSS filters (brightness, contrast, grayscale, blur, posterize).
- `outputCanvasRef`: The interactive artboard canvas visible to the user.
- `brushPreview canvas`: Mini canvas rendered inside `BrushPreview` component for real-time visualization of dot/shape dynamics.

### 2. State Specification (`PointSettings`)

```typescript
interface PointSettings {
  mode: 'random' | 'grid';
  density: number;             // 5 - 100
  dotSize: number;             // 0.1 - 10 (% of artboard width)
  jitter: number;              // 0 - 50 (spatial deviation)
  shape: 'circle' | 'square' | 'diamond' | 'hexagon' | 'polygon' | 'star' | 'heart' | 'cross' | 'custom';
  polygonSides: number;        // 3 - 10
  starPoints: number;          // 3 - 10
  cornerRadius: number;        // 0 - 100%
  opacity: number;             // 0.05 - 1.0
  rotation: number;            // 0 - 360 deg
  randomRotation: boolean;
  sizeVariation: number;       // 0 - 1 (luminance-dependent scale)
  invertSizeVariation: boolean;// false: dark = large, true: bright = large
  densityVariation: number;    // 0 - 1 (darkness-based probability drop)
  background: string;          // hex color or 'transparent'
  resolution: number;          // 0.5 - 3x artboard multiplier
  artboardWidth: number;
  artboardHeight: number;
  showPreview: boolean;
  // Image Filters
  brightness: number;          // 0 - 200%
  contrast: number;            // 0 - 200%
  grayscale: number;           // 0 - 100%
  blur: number;                // 0 - 20px
  posterize: number;           // 0 (off) - 20 levels
  // Ink
  monochrome: boolean;
  inkColor: string;
}
```

### 3. Progressive Chunked Rendering

To maintain 60fps responsiveness during high-density stochastic rendering:
- Rendering is executed in batches (`renderPointChunk`) using `requestAnimationFrame`.
- A cancellation ref (`renderRequestIdRef`) ensures that rapid parameter changes cancel in-flight frames before starting a new render.
- `renderProgress` state tracks 0–100% completion for the top-bar progress indicator.

### 4. Input & Clipboard Handling

- **File Upload**: File input ref triggered by toolbar or empty-state Artboard click.
- **Clipboard Paste (`paste` event listener)**:
  - Listens globally on `document` for clipboard events.
  - Extracts image blobs from `clipboardData.items`.
  - Creates object URLs, updates `sourceImage`, adjusts artboard dimensions, and triggers re-render.

---

## 📐 Coding Conventions

1. **Tailwind CSS v4**:
   - Uses `@import "tailwindcss";` in `src/index.css`.
   - Uses `--color-*` CSS variables defined in `@theme` block:
     - `bg-bg-main`, `bg-bg-panel`, `text-text-primary`, `text-text-secondary`, `text-accent-blue`.
   - Do NOT create separate `.module.css` or arbitrary inline CSS rules unless dealing with dynamic Canvas context.

2. **Canvas 2D Performance**:
   - Cache `ctx.getImageData()` once per frame/batch into a local `Uint8ClampedArray`.
   - Never call `getImageData` inside the inner point loop.
   - Use `ctx.save()` and `ctx.restore()` carefully around rotations and translations.

3. **React 19 & Hooks**:
   - Avoid unnecessary re-renders of the main canvas when popovers open/close.
   - Components like `BrushPreview` are wrapped in `React.memo`.

---

## 🛠️ Common Tasks for Codex

### Adding a New Shape
1. Add shape name to `PointSettings['shape']` union.
2. In `drawPointShape(ctx, x, y, size, shape, rotation)`, add a new case to the switch statement.
3. In the shape selection modal in `App.tsx`, add the button with a corresponding Lucide icon.

### Adding an Export Format
1. Locate `exportImage` or `exportSVG` in `App.tsx`.
2. Follow the existing pattern using `URL.createObjectURL` and a temporary `<a download="...">` element.

### Adding a Preset
1. Add new preset object to `defaultPresets` array with default `PointSettings` overrides.
