/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import { 
  Upload, 
  Download, 
  RefreshCw, 
  Sliders, 
  Image as ImageIcon, 
  Settings2, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  Eye, 
  EyeOff, 
  PlusSquare, 
  ArrowRight,
  Sun,
  Contrast,
  Palette,
  Grid2X2,
  Paintbrush,
  Pipette,
  Layers,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PointSettings {
  mode: 'grid' | 'scatter';
  density: number;
  dotSize: number;
  jitter: number;
  shape: 'circle' | 'polygon' | 'star' | 'custom';
  polygonSides: number;
  starPoints: number;
  customBrushSrc: string | null;
  rotation: number;
  cornerRadius: number; // Percentage of the size
  showPreview: boolean;
  randomRotation: boolean;
  colorSampler: 'exact' | 'vibrant' | 'muted';
  opacity: number;
  background: string;
  sizeVariation: number;
  showReference: boolean;
  artboardWidth: number;
  artboardHeight: number;
  resolution: number;
  colorSpace: 'sRGB' | 'Display P3';
  brightness: number;
  contrast: number;
  grayscale: number;
  blur: number;
  densityVariation: number; // New: 0 to 1, how much density depends on darkness
  posterize: number; // 0 (off) to 20
  monochrome: boolean;
  inkColor: string;
  invertSizeVariation: boolean;
}

// Optimize BrushPreview by separating it from main App re-renders
const BrushPreview = React.memo(({ settings, customBrushRef, drawPointShape, setSettings }: { 
  settings: PointSettings, 
  customBrushRef: React.RefObject<HTMLImageElement | null>,
  drawPointShape: any,
  setSettings: React.Dispatch<React.SetStateAction<PointSettings>>
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 120;
    const h = 120;
    canvas.width = w;
    canvas.height = h;

    // Static Gradient for sampling
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // Clear background
    const paperColor = settings.background === 'transparent' ? '#ffffff' : settings.background;
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, w, h);

    const renderMiniPoint = (ox: number, oy: number) => {
      const sx = Math.floor(Math.max(0, Math.min(w - 1, ox)));
      const sy = Math.floor(Math.max(0, Math.min(h - 1, oy)));
      const i = (sy * w + sx) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const br = (r + g + b) / (3 * 255);
      const darkness = 1 - br;
      const prob = Math.pow(darkness, settings.densityVariation * 3);
      if (Math.random() > prob && settings.densityVariation > 0) return;

      // Miniature size calculation for preview
      const baseSize = (w * settings.dotSize) / 100;
      const sizeFactor = settings.invertSizeVariation ? br : (1 - br);
      const size = baseSize * 2.5 * (1 - settings.sizeVariation + settings.sizeVariation * sizeFactor);
      ctx.globalAlpha = settings.opacity;
      ctx.fillStyle = settings.monochrome ? settings.inkColor : `rgb(${r},${g},${b})`;
      drawPointShape(ctx, ox, oy, size, settings.shape, (settings.rotation * Math.PI) / 180);
    };

    ctx.save();
    if (settings.mode === 'grid') {
      const step = Math.max(4, Math.floor(200 / settings.density));
      for (let y = 8; y < h - 8; y += step) {
        for (let x = 8; x < w - 8; x += step) renderMiniPoint(x, y);
      }
    } else {
      for (let i = 0; i < 300; i++) {
        renderMiniPoint(Math.random() * (w - 16) + 8, Math.random() * (h - 16) + 8);
      }
    }
    ctx.restore();
  }, [
    settings.mode, settings.density, settings.dotSize, settings.jitter, 
    settings.shape, settings.polygonSides, settings.starPoints, 
    settings.cornerRadius, settings.opacity, settings.monochrome, 
    settings.inkColor, settings.background, settings.rotation,
    settings.sizeVariation, settings.densityVariation, settings.invertSizeVariation,
    customBrushRef.current
  ]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute top-4 left-[80px] z-50 bg-white/80 backdrop-blur-md rounded-2xl border border-white/40 shadow-2xl overflow-hidden pointer-events-auto"
    >
      <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between bg-white/50">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-tight">Brush Preview</span>
        <button onClick={() => setSettings(s => ({ ...s, showPreview: false }))} className="p-1 hover:bg-black/5 rounded">
          <Minimize2 className="w-3 h-3 text-text-muted" />
        </button>
      </div>
      <div className="p-3">
        <canvas ref={canvasRef} className="rounded-lg shadow-inner bg-white w-[120px] h-[120px]" />
      </div>
    </motion.div>
  );
});

export default function App() {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderRequestIdRef = useRef<number | null>(null);
  const cachedPathRef = useRef<Path2D | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActiveTool(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const [settings, setSettings] = useState<PointSettings>({
    mode: 'grid',
    density: 50,
    dotSize: 0.8, // Now represents % of artboard width
    jitter: 0.5,
    shape: 'circle',
    polygonSides: 5,
    starPoints: 5,
    customBrushSrc: null,
    rotation: 0,
    cornerRadius: 0,
    showPreview: true,
    randomRotation: false,
    colorSampler: 'exact',
    opacity: 0.8,
    background: '#ffffff',
    sizeVariation: 0.5,
    showReference: false,
    artboardWidth: 1080,
    artboardHeight: 1080,
    resolution: 1,
    colorSpace: 'sRGB',
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    blur: 0,
    densityVariation: 0.5,
    posterize: 0,
    monochrome: false,
    inkColor: '#000000',
    invertSizeVariation: false,
  });

  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      setSourceImage(img);
      setSettings(s => ({ ...s, artboardWidth: img.width, artboardHeight: img.height }));
      renderSourceToCanvas(img, img.width, img.height);
    };
    img.src = URL.createObjectURL(file);
  };

  // Support pasting image from clipboard (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (!file) continue;

          const img = new Image();
          img.onload = () => {
            setSourceImage(img);
            setSettings(s => ({ ...s, artboardWidth: img.width, artboardHeight: img.height }));
            renderSourceToCanvas(img, img.width, img.height);
          };
          img.src = URL.createObjectURL(file);
          e.preventDefault();
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [settings.resolution, settings.brightness, settings.contrast, settings.grayscale, settings.blur, settings.posterize]);

  const customBrushRef = useRef<HTMLImageElement | null>(null);
  const brushInputRef = useRef<HTMLInputElement>(null);

  const handleBrushUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        customBrushRef.current = img;
        setSettings(s => ({ ...s, customBrushSrc: event.target?.result as string, shape: 'custom' }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const renderSourceToCanvas = (img: HTMLImageElement, targetW: number, targetH: number) => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Added 50px margin (100px total) for "Save Area"
    const margin = 50 * settings.resolution;
    const w = targetW * settings.resolution + (margin * 2);
    const h = targetH * settings.resolution + (margin * 2);

    canvas.width = w;
    canvas.height = h;
    
    ctx.clearRect(0, 0, w, h);

    ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) grayscale(${settings.grayscale}%) blur(${settings.blur}px)`;
    
    const innerW = targetW * settings.resolution;
    const innerH = targetH * settings.resolution;
    const scale = Math.min(innerW / img.width, innerH / img.height);
      
    const x = (w / 2) - (img.width / 2) * scale;
    const y = (h / 2) - (img.height / 2) * scale;
    
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

    // Apply Manual Posterize Filter
    if (settings.posterize >= 2) {
      const levels = Math.floor(settings.posterize);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        if (levels === 2) {
          // Binary thresholding for 2 levels
          const avg = (data[i] + data[i+1] + data[i+2]) / 3;
          const val = avg > 127 ? 255 : 0;
          data[i] = data[i+1] = data[i+2] = val;
        } else {
          // Quantize to N levels
          const step = 255 / (levels - 1);
          data[i] = Math.round(Math.round(data[i] / step) * step);
          data[i+1] = Math.round(Math.round(data[i+1] / step) * step);
          data[i+2] = Math.round(Math.round(data[i+2] / step) * step);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
    
    if (outputCanvasRef.current) {
      outputCanvasRef.current.width = w;
      outputCanvasRef.current.height = h;
    }
  };

  useEffect(() => {
    // Re-cache Path2D when shape-related settings change
    const path = new Path2D();
    const size = 100; // Fixed scale for cache
    const cornerRad = (size / 2) * (settings.cornerRadius / 100);

    switch (settings.shape) {
      case 'circle':
        path.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        break;
      case 'polygon': {
        const sides = settings.polygonSides;
        const pts = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
          pts.push({
            x: (size / 2) + (size / 2) * Math.cos(angle),
            y: (size / 2) + (size / 2) * Math.sin(angle)
          });
        }
        if (cornerRad > 0) {
          const p1 = pts[pts.length - 1];
          const p2 = pts[0];
          path.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const next = pts[(i + 1) % pts.length];
            path.arcTo(p.x, p.y, next.x, next.y, cornerRad);
          }
          path.closePath();
        } else {
          pts.forEach((p, i) => i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y));
          path.closePath();
        }
        break;
      }
      case 'star': {
        const points = settings.starPoints;
        const outerR = size / 2;
        const innerR = size / 4;
        const pts = [];
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          pts.push({
            x: (size / 2) + r * Math.cos(angle),
            y: (size / 2) + r * Math.sin(angle)
          });
        }
        if (cornerRad > 0) {
          const p1 = pts[pts.length - 1];
          const p2 = pts[0];
          path.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const next = pts[(i + 1) % pts.length];
            path.arcTo(p.x, p.y, next.x, next.y, cornerRad * 0.5);
          }
          path.closePath();
        } else {
          pts.forEach((p, i) => i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y));
          path.closePath();
        }
        break;
      }
    }
    cachedPathRef.current = path;
  }, [settings.shape, settings.polygonSides, settings.starPoints, settings.cornerRadius]);

  const processImage = useCallback(() => {
    if (!sourceCanvasRef.current || !outputCanvasRef.current || !sourceImage) return;

    // Clear any existing rendering task
    if (renderRequestIdRef.current) cancelAnimationFrame(renderRequestIdRef.current);
    
    setIsProcessing(true);
    setRenderProgress(0);
    
    const sCanvas = sourceCanvasRef.current;
    const oCanvas = outputCanvasRef.current;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    const oCtx = oCanvas.getContext('2d');
    if (!sCtx || !oCtx) return;

    const { width, height } = sCanvas;
    const imageData = sCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    oCtx.clearRect(0, 0, width, height);
    if (settings.background !== 'transparent') {
      oCtx.fillStyle = settings.background;
      oCtx.fillRect(0, 0, width, height);
    }

    const points: {x: number, y: number}[] = [];
    if (settings.mode === 'grid') {
      const step = Math.max(1, Math.floor(100 / settings.density));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const jX = (Math.random() - 0.5) * step * settings.jitter * 2;
          const jY = (Math.random() - 0.5) * step * settings.jitter * 2;
          points.push({ x: x + jX, y: y + jY });
        }
      }
    } else {
      const count = (width * height * settings.density) / 1000;
      for (let i = 0; i < count; i++) {
        points.push({ x: Math.random() * width, y: Math.random() * height });
      }
    }

    // Shuffle points for global random appearance if not grid mode
    if (settings.mode === 'scatter') {
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
    } else if (settings.mode === 'grid') {
      // Even for grid, shuffle a bit to avoid row-by-row look
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
    }

    let currentIndex = 0;
    const chunkSize = 4000;

    const renderChunk = () => {
      const nextIndex = Math.min(currentIndex + chunkSize, points.length);
      
      for (let i = currentIndex; i < nextIndex; i++) {
        renderPoint(oCtx, data, points[i].x, points[i].y, width, height);
      }

      currentIndex = nextIndex;
      setRenderProgress(Math.floor((currentIndex / points.length) * 100));

      if (currentIndex < points.length) {
        renderRequestIdRef.current = requestAnimationFrame(renderChunk);
      } else {
        setIsProcessing(false);
        renderRequestIdRef.current = null;
      }
    };

    renderRequestIdRef.current = requestAnimationFrame(renderChunk);
  }, [settings, sourceImage]);

  const renderPoint = (
    oCtx: CanvasRenderingContext2D, 
    data: Uint8ClampedArray, 
    drawX: number, 
    drawY: number,
    width: number,
    height: number
  ) => {
    // ... existing sampling logic ...
    const sampleX = Math.floor(Math.max(0, Math.min(width - 1, drawX)));
    const sampleY = Math.floor(Math.max(0, Math.min(height - 1, drawY)));
    const i = (sampleY * width + sampleX) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

    if (a < 10) return;
    
    // Luminance and Probability
    const br = (r + g + b) / (3 * 255);
    const darkness = 1 - br;
    if (Math.random() > Math.pow(darkness, settings.densityVariation * 3) && settings.densityVariation > 0) return;

    // Calculate absolute size from % of width
    const baseSize = (width * settings.dotSize) / 100;
    const sizeFactor = settings.invertSizeVariation ? br : (1 - br);
    const size = baseSize * (1 - settings.sizeVariation + settings.sizeVariation * sizeFactor);
    const rotation = settings.randomRotation ? Math.random() * Math.PI * 2 : (settings.rotation * Math.PI) / 180;

    oCtx.save();
    oCtx.translate(drawX, drawY);
    oCtx.rotate(rotation);
    oCtx.globalAlpha = settings.opacity;
    
    if (settings.monochrome) {
      oCtx.fillStyle = settings.inkColor;
    } else {
      oCtx.fillStyle = `rgba(${r},${g},${b},${a/255})`;
    }

    if (settings.shape === 'custom' && customBrushRef.current) {
        oCtx.drawImage(customBrushRef.current, -size/2, -size/2, size, size);
    } else if (cachedPathRef.current) {
        oCtx.scale(size / 100, size / 100);
        oCtx.translate(-50, -50);
        oCtx.fill(cachedPathRef.current);
    }
    
    oCtx.restore();
  };

  const drawRoundedPath = (ctx: CanvasRenderingContext2D, points: {x: number, y: number}[], radius: number) => {
    if (points.length < 2) return;
    
    // Move to the middle of the last and first point
    const p1 = points[points.length - 1];
    const p2 = points[0];
    ctx.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[(i + 1) % points.length];
      ctx.arcTo(p.x, p.y, next.x, next.y, radius);
    }
  };

  const drawPointShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: string, rotation: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    const cornerRad = (size / 2) * (settings.cornerRadius / 100);
    
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'polygon': {
        const sides = settings.polygonSides;
        const pts = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
          pts.push({
            x: (size / 2) * Math.cos(angle),
            y: (size / 2) * Math.sin(angle)
          });
        }
        if (cornerRad > 0) {
          drawRoundedPath(ctx, pts, cornerRad);
        } else {
          pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
        }
        ctx.fill();
        break;
      }
      case 'star': {
        const points = settings.starPoints;
        const outerRadius = size / 2;
        const innerRadius = size / 4;
        const pts = [];
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const r = i % 2 === 0 ? outerRadius : innerRadius;
          pts.push({
            x: r * Math.cos(angle),
            y: r * Math.sin(angle)
          });
        }
        if (cornerRad > 0) {
          // Adjust corner radio for inner points
          drawRoundedPath(ctx, pts, cornerRad * 0.5);
        } else {
          pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
        }
        ctx.fill();
        break;
      }
      case 'custom':
        if (customBrushRef.current) {
          ctx.drawImage(customBrushRef.current, -size / 2, -size / 2, size, size);
        } else {
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
    ctx.restore();
  };

  useEffect(() => {
    if (sourceImage) {
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      
      processingTimeoutRef.current = setTimeout(() => {
        renderSourceToCanvas(sourceImage, settings.artboardWidth, settings.artboardHeight);
        processImage();
      }, 150); // Debounce high-res rendering
    }
    return () => {
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, [processImage, sourceImage, settings.brightness, settings.contrast, settings.grayscale, settings.blur, settings.artboardWidth, settings.artboardHeight, settings.resolution, settings.posterize]);

  const downloadImage = () => {
    if (!outputCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'pointillist-art.png';
    link.href = outputCanvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-bg-main text-text-primary font-sans overflow-hidden p-0 sm:p-2">
      <div className="flex-1 flex flex-col bg-white/40 border border-white/20 sm:rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden glass-panel relative">
        {/* macOS App Header */}
        <header className="h-[52px] bg-white/20 border-b border-black/5 flex items-center justify-between px-4 shrink-0 z-30 relative select-none">
          <div className="flex items-center gap-4">
            {/* Traffic Lights */}
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-black/5" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/5" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-black/5" />
            </div>
            
            <div className="h-4 w-px bg-black/10 mx-2" />
            
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="px-3 py-1.5 rounded-lg bg-accent-blue text-white text-[11px] font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Image
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="w-5 h-5 bg-accent-blue rounded-md flex items-center justify-center text-[10px] text-white shadow-sm font-black">P</div>
            <span className="text-[13px] font-semibold text-text-primary tracking-tight">Pointillist Studio</span>
          </div>

          <div className="flex items-center gap-4">
             <div className="text-[11px] text-text-secondary font-medium bg-black/5 px-2 py-1 rounded-md">
              {sourceImage ? `${settings.artboardWidth}x${settings.artboardHeight} px` : 'No Canvas'}
            </div>
            <button 
              onClick={downloadImage}
              disabled={!sourceImage}
              className="p-2 rounded-lg hover:bg-black/5 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden relative">
          <AnimatePresence>
            {settings.showPreview && sourceImage && (
              <BrushPreview 
                settings={settings} 
                customBrushRef={customBrushRef}
                drawPointShape={drawPointShape}
              />
            )}
          </AnimatePresence>
          {/* Left Slim Toolbar - macOS Style */}
          <aside className="w-[64px] border-r border-black/5 flex flex-col items-center py-4 gap-4 shrink-0 z-40 glass-panel bg-white/10">
            <div className="flex flex-col gap-3 w-full items-center">
              <button 
                onClick={() => setActiveTool(activeTool === 'canvas' ? null : 'canvas')}
                className={`p-3 rounded-2xl transition-all ${activeTool === 'canvas' ? 'bg-accent-blue text-white shadow-lg' : 'text-text-secondary hover:bg-black/5 hover:text-text-primary'}`}
                title="Canvas Settings"
              >
                <Layers className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setActiveTool(activeTool === 'import' ? null : 'import')}
                className={`p-3 rounded-2xl transition-all ${activeTool === 'import' ? 'bg-accent-blue text-white shadow-lg' : 'text-text-secondary hover:bg-black/5 hover:text-text-primary'}`}
                title="Import/Export"
              >
                <ImageIcon className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mt-auto flex flex-col gap-3 items-center">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-2xl text-accent-blue hover:bg-accent-blue/10 transition-all"
                title="Import Image"
              >
                <PlusSquare className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setSourceImage(null)}
                disabled={!sourceImage}
                className="p-3 rounded-2xl text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-20"
                title="Clear canvas"
              >
                <Trash2 className="w-6 h-6" />
              </button>
            </div>
          </aside>

          {/* Popover Panels */}
          <AnimatePresence>
            {activeTool && (
              <motion.div
                ref={popoverRef}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute left-[74px] top-4 bottom-4 w-[280px] z-50 glass-panel bg-white/90 shadow-[20px_0_60px_rgba(0,0,0,0.1)] rounded-[24px] border border-white/40 overflow-hidden flex flex-col"
              >
                <div className="p-5 border-b border-black/5 flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-text-primary capitalize">{activeTool} Settings</h3>
                  <button onClick={() => setActiveTool(null)} className="p-1 hover:bg-black/5 rounded-full">
                    <Minimize2 className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6">
                  {activeTool === 'canvas' && (
                    <div className="space-y-6">
                       {/* Ink Color Picker */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-black/5 rounded-xl">
                          <span className="text-[11px] font-bold">Monochrome</span>
                          <button 
                            onClick={() => setSettings(s => ({ ...s, monochrome: !s.monochrome }))}
                            className={`w-9 h-5 rounded-full transition-all relative ${settings.monochrome ? 'bg-[#34c759]' : 'bg-black/10'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${settings.monochrome ? 'left-4.5' : 'left-0.5'}`} />
                          </button>
                        </div>
                        
                        <div className="space-y-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted px-1">Dot Color</span>
                          <div className="grid grid-cols-5 gap-2">
                            {['#000000', '#2d3436', '#0984e3', '#d63031', 'custom'].map(c => (
                              <button 
                                key={c}
                                onClick={() => c !== 'custom' && setSettings(s => ({ ...s, inkColor: c, monochrome: true }))}
                                className={`aspect-square rounded-lg border-2 transition-all ${settings.inkColor === c && settings.monochrome ? 'border-accent-blue scale-105' : 'border-transparent'}`}
                                style={{ backgroundColor: c === 'custom' ? '#eee' : c }}
                              >
                                {c === 'custom' && (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    <Paintbrush className="w-3 h-3 text-text-muted" />
                                    <input type="color" value={settings.inkColor} onChange={(e) => setSettings(s => ({ ...s, inkColor: e.target.value, monochrome: true }))} className="absolute inset-0 opacity-0 cursor-pointer" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted px-1">Paper Color</span>
                          <div className="grid grid-cols-5 gap-2">
                            {['#ffffff', '#fdfdfd', '#f1f2f6', '#1d1d1f', 'custom'].map(c => (
                              <button 
                                key={c}
                                onClick={() => c !== 'custom' && setSettings(s => ({ ...s, background: c }))}
                                className={`aspect-square rounded-lg border-2 transition-all ${settings.background === c ? 'border-accent-blue scale-105' : 'border-transparent'}`}
                                style={{ backgroundColor: c === 'custom' ? '#eee' : c }}
                              >
                                {c === 'custom' && (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    <Pipette className="w-3 h-3 text-text-muted" />
                                    <input type="color" value={settings.background} onChange={(e) => setSettings(s => ({ ...s, background: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-text-secondary">Ink Translucency</span>
                            <span className="text-accent-blue">{Math.round(settings.opacity * 100)}%</span>
                          </div>
                          <input 
                            type="range" min="0.1" max="1" step="0.05"
                            value={settings.opacity}
                            onChange={(e) => setSettings(s => ({ ...s, opacity: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-black/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTool === 'import' && (
                    <div className="space-y-4">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white border border-black/5 hover:bg-black/[0.02] transition-all group"
                      >
                        <div className="p-3 bg-accent-blue/10 rounded-xl text-accent-blue group-hover:scale-110 transition-transform">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-[12px] font-bold">Import Image</p>
                          <p className="text-[10px] text-text-muted">JPG, PNG, WebP supported</p>
                        </div>
                      </button>

                      <button 
                        onClick={downloadImage}
                        disabled={!sourceImage}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-accent-blue text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all group disabled:opacity-30 disabled:shadow-none"
                      >
                        <div className="p-3 bg-white/20 rounded-xl">
                          <Download className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-[12px] font-bold">Export Art</p>
                          <p className="text-[10px] text-white/70">Save as high-res PNG</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Canvas Viewport */}
          <main className="flex-1 bg-white flex items-center justify-center overflow-auto relative p-8 cursor-default select-none shadow-inner">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <input 
              type="file" 
              ref={brushInputRef} 
              onChange={handleBrushUpload} 
              accept="image/*" 
              className="hidden" 
            />

            {!sourceImage ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-sm aspect-square bg-white shadow-xl rounded-[32px] flex flex-col items-center justify-center gap-6 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all group border border-white"
              >
                <div className="w-20 h-20 rounded-[22px] bg-accent-blue flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:rotate-6 transition-transform">
                  <ImageIcon className="w-10 h-10 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary tracking-tight">Create Artboard</p>
                  <p className="text-[13px] text-text-secondary mt-1">Import an image to start your pointillism project</p>
                </div>
              </div>
            ) : (
              <div className="relative group p-4">
                <canvas ref={sourceCanvasRef} className="hidden" />
                <div className={`relative p-0 overflow-hidden rounded-md shadow-[0_30px_70px_rgba(0,0,0,0.25)] ${settings.background === 'transparent' ? 'bg-[#f0f0f0] bg-[radial-gradient(#d0d0d0_1px,transparent_1px)] bg-[size:20px_20px]' : 'bg-white'}`}>
                  {settings.showReference && (
                    <img 
                      src={sourceImage.src} 
                      alt="Reference"
                      className="absolute inset-0 w-full h-full object-contain mix-blend-normal opacity-20 pointer-events-none z-0"
                    />
                  )}
                  
                  <canvas 
                    ref={outputCanvasRef} 
                    className="max-w-full max-h-[calc(100vh-180px)] block relative z-10 shadow-sm mx-auto"
                  />
                </div>

                <div className="absolute top-8 right-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                  <button 
                    onClick={() => setSettings(s => ({ ...s, showReference: !s.showReference }))}
                    className={`h-9 px-3 rounded-full backdrop-blur-xl border border-white/20 shadow-lg flex items-center gap-2 text-[11px] font-bold ${settings.showReference ? 'bg-accent-blue text-white' : 'bg-white/80 text-text-secondary hover:text-text-primary'}`}
                  >
                    {settings.showReference ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    Reference
                  </button>
                </div>
              </div>
            )}
          </main>

          {/* Properties Panel - macOS Inspector Style */}
          <aside className="w-[300px] border-l border-black/5 flex flex-col shrink-0 z-20 glass-panel bg-white/50">
            <div className="flex-1 overflow-y-auto custom-scrollbar select-none p-5 space-y-8">
              {/* Technique Section */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[#8e8e93]">Brush & Technique</h3>
                
                {/* Brush Type Selector */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'circle', label: 'Circle', icon: <div className="w-3 h-3 rounded-full border border-current" /> },
                    { id: 'polygon', label: 'Polygon', icon: <div className="w-3 h-3 border border-current rotate-45" /> },
                    { id: 'star', label: 'Star', icon: <Star className="w-3.5 h-3.5" /> },
                    { id: 'custom', label: 'Custom', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                  ].map(b => (
                    <button
                      key={b.id}
                      onClick={() => {
                        if (b.id === 'custom' && !settings.customBrushSrc) {
                          brushInputRef.current?.click();
                        } else {
                          setSettings(s => ({ ...s, shape: b.id as any }));
                        }
                      }}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold border transition-all ${settings.shape === b.id ? 'bg-accent-blue border-accent-blue text-white shadow-md' : 'bg-black/5 border-transparent text-text-secondary hover:bg-black/10'}`}
                    >
                      {b.icon}
                      {b.label}
                    </button>
                  ))}
                </div>

                {/* Corner Rounding Toggle for Polygons/Stars */}
                {(settings.shape === 'polygon' || settings.shape === 'star') && (
                  <div className="space-y-2 p-3 bg-black/5 rounded-2xl border border-black/5 mb-2">
                    <div className="flex justify-between text-[11px] font-medium text-text-secondary">
                      <span>Corner Rounding</span>
                      <span className="text-accent-blue font-bold">{settings.cornerRadius}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="1"
                      value={settings.cornerRadius}
                      onChange={(e) => setSettings(s => ({ ...s, cornerRadius: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-black/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                    />
                  </div>
                )}

                <div className="space-y-4">
                  {settings.shape === 'polygon' && (
                    <div className="space-y-2 p-3 bg-accent-blue/5 rounded-2xl border border-accent-blue/10">
                      <div className="flex justify-between text-[11px] font-bold text-accent-blue">
                        <span>Polygon Sides</span>
                        <span>{settings.polygonSides}</span>
                      </div>
                      <input 
                        type="range" min="3" max="12" step="1"
                        value={settings.polygonSides}
                        onChange={(e) => setSettings(s => ({ ...s, polygonSides: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-accent-blue/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                      />
                    </div>
                  )}

                  {settings.shape === 'star' && (
                    <div className="space-y-2 p-3 bg-accent-blue/5 rounded-2xl border border-accent-blue/10">
                      <div className="flex justify-between text-[11px] font-bold text-accent-blue">
                        <span>Star Points</span>
                        <span>{settings.starPoints}</span>
                      </div>
                      <input 
                        type="range" min="3" max="20" step="1"
                        value={settings.starPoints}
                        onChange={(e) => setSettings(s => ({ ...s, starPoints: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-accent-blue/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                      />
                    </div>
                  )}

                  {settings.shape === 'custom' && settings.customBrushSrc && (
                    <div className="flex items-center gap-3 p-3 bg-black/5 rounded-2xl border border-black/5">
                      <img src={settings.customBrushSrc} className="w-10 h-10 object-contain bg-white rounded-lg p-1 border border-black/10" alt="Brush" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold">Custom Brush Active</p>
                        <button onClick={() => brushInputRef.current?.click()} className="text-[10px] text-accent-blue font-bold hover:underline">Change Shape</button>
                      </div>
                    </div>
                  )}

                  <div className="p-1 bg-[#767680]/10 rounded-lg flex mt-4">
                    <button 
                      onClick={() => setSettings(s => ({ ...s, mode: 'grid' }))}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${settings.mode === 'grid' ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      Grid
                    </button>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, mode: 'scatter' }))}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${settings.mode === 'scatter' ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      Scatter
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-black/5 rounded-xl mt-2">
                    <span className="text-[11px] font-bold">Brush Preview</span>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, showPreview: !s.showPreview }))}
                      className={`w-9 h-5 rounded-full transition-all relative ${settings.showPreview ? 'bg-accent-blue' : 'bg-black/10'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${settings.showPreview ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  <div className="space-y-4 pt-2">
                    {[
                      { label: 'Density', key: 'density', min: 5, max: 100, unit: '%' },
                      { label: 'Diameter', key: 'dotSize', min: 0.1, max: 8, unit: '%' },
                      { label: 'Jitter', key: 'jitter', min: 0, max: 2, scale: 100, unit: '%' },
                    ].map(control => (
                      <div key={control.key} className="space-y-2">
                        <div className="flex justify-between text-[11px] font-medium text-text-secondary">
                          <span>{control.label}</span>
                          <span className="text-accent-blue font-bold">
                            {control.scale ? Math.round((settings as any)[control.key] * control.scale) : (settings as any)[control.key]}{control.unit}
                          </span>
                        </div>
                        <input 
                          type="range" min={control.min} max={control.max} step={control.key === 'dotSize' ? 0.05 : 1}
                          value={(settings as any)[control.key]}
                          onChange={(e) => setSettings(s => ({ ...s, [control.key]: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-black/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Advanced Mapping - macOS UI */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[#8e8e93] border-t border-black/5 pt-5">Luminance Mapping</h3>
                
                <div className="space-y-4">
                  {[
                    { label: 'Size Variance', key: 'sizeVariation', min: 0, max: 1, scale: 100, unit: '%' },
                    { label: 'Density Scale', key: 'densityVariation', min: 0, max: 1, scale: 100, unit: '%' },
                  ].map(control => (
                    <div key={control.key} className="space-y-2">
                      <div className="flex justify-between text-[11px] font-medium text-text-secondary">
                        <span>{control.label}</span>
                        <span className="text-accent-blue font-bold">{Math.round((settings as any)[control.key] * control.scale)}%</span>
                      </div>
                      <input 
                        type="range" min={control.min} max={control.max} step="0.1"
                        value={(settings as any)[control.key]}
                        onChange={(e) => setSettings(s => ({ ...s, [control.key]: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-black/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                      />
                      {control.key === 'sizeVariation' && (
                        <div className="flex items-center gap-2 mt-1">
                          <input 
                            type="checkbox" 
                            id="invert-size"
                            checked={settings.invertSizeVariation}
                            onChange={(e) => setSettings(s => ({ ...s, invertSizeVariation: e.target.checked }))}
                            className="w-3 h-3 rounded text-accent-blue focus:ring-accent-blue/30"
                          />
                          <label htmlFor="invert-size" className="text-[10px] font-bold text-text-muted cursor-pointer select-none">Invert Variance (Bright = Large)</label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Processing Settings */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[#8e8e93] border-t border-black/5 pt-5">Image Processing</h3>
                
                <div className="space-y-4">
                  {[
                    { label: 'Brightness', key: 'brightness', min: 0, max: 200, unit: '' },
                    { label: 'Contrast', key: 'contrast', min: 0, max: 200, unit: '' },
                    { label: 'Grayscale', key: 'grayscale', min: 0, max: 100, unit: '%' },
                    { label: 'Posterize', key: 'posterize', min: 0, max: 20, unit: ' levels' },
                    { label: 'Ink Translucency', key: 'opacity', min: 0.1, max: 1, scale: 100, unit: '%' },
                  ].map(control => (
                    <div key={control.key} className="space-y-2">
                      <div className="flex justify-between text-[11px] font-medium text-text-secondary">
                        <span>{control.label}</span>
                        <span className="text-accent-blue font-bold">
                          {control.key === 'posterize' && (settings as any)[control.key] < 2 ? 'Off' : (control.scale ? Math.round((settings as any)[control.key] * control.scale) : (settings as any)[control.key])}{control.key === 'posterize' && (settings as any)[control.key] < 2 ? '' : control.unit}
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min={control.min} 
                        max={control.max} 
                        step={control.key === 'opacity' ? 0.05 : 1}
                        value={(settings as any)[control.key]}
                        onChange={(e) => setSettings(s => ({ ...s, [control.key]: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-black/10 rounded-full appearance-none accent-accent-blue cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-auto p-4 border-t border-black/5 flex flex-col gap-3 bg-black/5">
                {isProcessing && (
                  <div className="space-y-1.5 px-1">
                    <div className="flex justify-between text-[9px] font-bold text-accent-blue uppercase tracking-tighter">
                      <span>Generating Points...</span>
                      <span>{renderProgress}%</span>
                    </div>
                    <div className="w-full h-1 bg-accent-blue/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-accent-blue" 
                        initial={{ width: 0 }}
                        animate={{ width: `${renderProgress}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-center">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-tighter">Pointillist Vector Engine</span>
                </div>
            </div>
          </aside>
        </div>

        {/* macOS Bottom Status */}
        <footer className="h-[28px] bg-white/20 border-t border-black/5 flex items-center justify-between px-4 text-[11px] shrink-0 font-medium text-text-secondary">
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-orange-400 animate-pulse' : 'bg-green-500'}`} />
            <span>{isProcessing ? 'Rendering Point Cloud...' : 'Engine Idle (Standard)'}</span>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-4 font-mono">
              <span>Artboard: {settings.artboardWidth}x{settings.artboardHeight} @ {settings.resolution}x</span>
              <span>Zoom: 100%</span>
              <span>Color: {settings.colorSpace}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
