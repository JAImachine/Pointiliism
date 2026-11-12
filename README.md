# Pointillism Studio 🎨

> A high-performance, macOS-styled creative web app that transforms images into stunning pointillist and halftone artwork using stochastic sampling, luminance-based sizing, and customizable vector brush shapes.

![Pointillism Studio](https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1200&auto=format&fit=crop&q=80)

---

## ✨ Features

- **⚡ High-Performance Canvas Engine**: Progressive chunked rendering with `requestAnimationFrame` keeps UI fluid even with 500,000+ rendered points.
- **📋 Direct Clipboard Paste**: Press `Ctrl+V` (or `Cmd+V`) anywhere on the canvas to instantly load copied images from the web or clipboard.
- **🎲 Stochastic & Grid Sampling**:
  - **Stochastic (Random)**: Organically places points based on darkness probability curves (simulating stippling and classic pointillism).
  - **Grid**: Regularly spaced dot-matrix halftone effect with customizable jitter.
- **📐 Rich Shape Library**:
  - Circles, Squares, Diamonds, Hexagons, Polygons (3–10 sides), Stars (3–10 points), Hearts, Crosses, and Custom Image/PNG Brushes.
  - Corner radius smoothing for polygonal shapes.
- **🎛️ Detailed Control Parameters**:
  - Density, dot size, size variance, density variance, and invert variance (bright = large or dark = large).
  - Jitter, base rotation, random rotation, opacity, and monochrome ink color.
- **🖼️ Image Preprocessing**:
  - Live adjustment of Brightness, Contrast, Grayscale, Blur, and Posterization before point rendering.
- **💾 High-Res Export**:
  - PNG export with customizable resolution scaling.
  - Vector SVG export for print and graphic design workflows.
  - One-click Preset management (Save, Load, Export/Import presets).

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite 6](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (macOS glassmorphic aesthetic)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Motion](https://motion.dev/)
- **Rendering**: HTML5 2D Canvas with offscreen image sampling and chunked rendering

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ or 20+ recommended)
- `npm`, `pnpm`, `yarn`, or `bun`

### Installation

```bash
# Clone or navigate to the project directory
git clone <repository-url>
cd pointillism-studio

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
# Compile and bundle for production
npm run build

# Preview production build locally
npm run preview
```

### Type Checking & Linting

```bash
npm run lint
```

---

## 📂 Project Structure

```
├── .cursorrules           # Guidelines for AI coding assistants (Codex, Cursor, Copilot)
├── CODEX.md               # Quick-start context file for Codex / LLM agents
├── index.html             # HTML entry point with metadata and root mount
├── package.json           # Dependencies, scripts, and project metadata
├── tsconfig.json          # TypeScript compiler configuration
├── vite.config.ts         # Vite bundler configuration
└── src/
    ├── main.tsx           # React DOM root render
    ├── index.css          # Tailwind CSS v4 setup, macOS glassmorphism, fonts
    └── App.tsx            # Full Pointillism Studio application:
                           #   - Canvas pointillism rendering engine
                           #   - Image preprocessing & clipboard paste handlers
                           #   - Floating toolbar, parameter popovers, inspector
                           #   - Brush preview, preset management, SVG/PNG export
```

---

## 🧠 Core Architecture for Codex & Contributors

### 1. The Rendering Loop (`App.tsx`)

Point rendering uses a two-canvas pipeline:
1. **Source Canvas (`sourceCanvasRef`)**: Stores the preprocessed bitmap (grayscale, brightness, contrast, blur, posterize).
2. **Output Canvas (`outputCanvasRef`)**: Renders points onto the artboard with progressive chunks (`renderPointChunk`) to prevent blocking the UI thread.

```typescript
// Sample point generation pipeline:
const sampleDarkness = (ox: number, oy: number): number => {
  const i = (Math.floor(oy) * width + Math.floor(ox)) * 4;
  const brightness = (data[i] + data[i+1] + data[i+2]) / (3 * 255);
  return 1 - brightness; // 0 = white, 1 = black
};
```

### 2. State Model (`PointSettings`)

All adjustable settings are encapsulated in the `PointSettings` interface in `src/App.tsx`:
- `mode`: `'random' | 'grid'`
- `density`, `dotSize`, `sizeVariation`, `densityVariation`, `invertSizeVariation`
- `jitter`, `rotation`, `randomRotation`, `opacity`
- `shape`: `'circle' | 'square' | 'diamond' | 'hexagon' | 'polygon' | 'star' | 'heart' | 'cross' | 'custom'`
- `monochrome`, `inkColor`, `background`
- `brightness`, `contrast`, `grayscale`, `blur`, `posterize`

### 3. Adding New Shapes

To add a new shape:
1. Extend the `shape` union in `PointSettings`:
   ```typescript
   shape: 'circle' | 'square' | ... | 'myNewShape';
   ```
2. Implement the path logic in `drawPointShape(ctx, x, y, size, shape, rotation)` in `src/App.tsx`.
3. Add the shape button/icon in the Toolbar shape selector modal.

---

## 📄 License

MIT License. Free for personal and commercial creative use.
