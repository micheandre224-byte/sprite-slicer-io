/**
 * 🛠️ SPRITE SLICER - FERRAMENTA ORIGINAL
 * -----------------------------------------------------------
 * Autor: [Michel André L. Da Silva]
 * Ano: 2026
 * Licença: Creative Commons (CC BY-NC-ND 4.0)
 * * Este software é de uso público e gratuito. 
 * É PROIBIDA a cópia total ou parcial deste código para:
 * 1. Fins comerciais ou venda de licenças.
 * 2. Criação de sites clones com anúncios ou microtransações.
 * * O respeito ao tempo e à privacidade do desenvolvedor é a base deste projeto.
 * -----------------------------------------------------------
 */
import React, { useState, useRef, useEffect, useMemo, useCallback, ErrorInfo, ReactNode } from 'react';
import { Upload, Play, Pause, Download, Maximize, MousePointer2, Loader2, Image as ImageIcon, Smartphone, ZoomIn, ZoomOut, Move, Undo2, Redo2, Save, FolderOpen, HelpCircle, ArrowRight, ArrowDown, ArrowLeft, Globe, CheckSquare, Square, RefreshCw, Scissors, Trash2, Layers, FileJson, AlertTriangle, AlertCircle, SkipBack, SkipForward, Tag, Zap, Sparkles, Wand2, Crop, X, Palette, Settings, Pencil, Check, Archive } from 'lucide-react';
import { detectSprites, Rect } from '../lib/sprite-detection';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import localforage from 'localforage';
import { Language, translations } from '../lib/translations';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';

localforage.config({
  name: 'SlicerioApp',
  driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
  storeName: 'sprite_slicer_data'
});

// --- Sortable Item Component ---
function SortableFrame({ id, globalIndex, isDisabled, onToggle, onDelete }: { id: string, globalIndex: number, isDisabled: boolean, onToggle: () => void, onDelete: () => void, key?: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    touchAction: 'none' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group p-0.5">
      <button
        type="button"
        onClick={(e) => {
          if (!isDragging) {
             onToggle();
          }
        }}
        className={`w-9 h-9 flex flex-col items-center justify-center rounded text-[10px] font-bold transition-all relative select-none ${
          isDisabled 
            ? 'bg-neutral-800 text-neutral-500 hover:bg-neutral-750 border border-neutral-700/30' 
            : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 font-mono'
        } ${isDragging ? 'opacity-50 ring-2 ring-emerald-500 scale-95' : ''}`}
        title={`Arraste para reordenar, Clique para ativar/desativar Frame ${globalIndex}`}
      >
        <span className="text-[8px] text-neutral-400 font-mono select-none">F{globalIndex}</span>
        {/* Handle for drag-and-drop */}
        <div 
          className="absolute inset-0 cursor-grab active:cursor-grabbing rounded" 
          {...attributes} 
          {...listeners} 
        />
      </button>

      {/* Delete absolute button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDelete();
        }}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-[8px] flex items-center justify-center font-bold z-20 cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity border border-neutral-900"
        title="Apagar Frame definitivamente"
      >
        ✕
      </button>
    </div>
  );
}

// --- Helper to remove background color ---
const removeBackground = (imageData: ImageData, bgColor: number[], tolerance: number) => {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    if (a === 0) continue;
    
    const diff = Math.max(
      Math.abs(r - bgColor[0]),
      Math.abs(g - bgColor[1]),
      Math.abs(b - bgColor[2])
    );
    
    if (diff <= tolerance) {
      data[i + 3] = 0; // Set alpha to 0
    }
  }
};

const addOutlineToCanvas = (sourceCanvas: HTMLCanvasElement, hexColor: string): HTMLCanvasElement => {
  const destCanvas = document.createElement('canvas');
  destCanvas.width = sourceCanvas.width + 4; // 2px padding each side
  destCanvas.height = sourceCanvas.height + 4;
  const ctx = destCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;
  
  const silhouetteCanvas = document.createElement('canvas');
  silhouetteCanvas.width = sourceCanvas.width;
  silhouetteCanvas.height = sourceCanvas.height;
  const sCtx = silhouetteCanvas.getContext('2d');
  if (!sCtx) return sourceCanvas;
  
  sCtx.drawImage(sourceCanvas, 0, 0);
  sCtx.globalCompositeOperation = 'source-in';
  sCtx.fillStyle = hexColor;
  sCtx.fillRect(0, 0, silhouetteCanvas.width, silhouetteCanvas.height);
  
  ctx.imageSmoothingEnabled = false;
  // Offset by +2 to center the silhouette inside the new padded destCanvas
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [ox, oy] of offsets) {
    ctx.drawImage(silhouetteCanvas, 2 + ox, 2 + oy);
  }
  
  // Draw the original image over the outline centered
  ctx.drawImage(sourceCanvas, 2, 2);
  return destCanvas;
};

// --- Security Hardening: Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

// --- Frame Canvas Component for efficient real-time filtering ---
function FrameCanvas({ 
  frame,
  cropLeft = 0, cropRight = 0, cropTop = 0, cropBottom = 0,
  chromaEnabled = false, chromaColor = '#00ff00', chromaColor2 = '', chromaColor3 = '',
  chromaTolerance = 30, chromaSmoothing = 5,
  pixelateEnabled = false, pixelateSize = 4
}: { 
  frame: string;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
  chromaEnabled?: boolean;
  chromaColor?: string;
  chromaColor2?: string;
  chromaColor3?: string;
  chromaTolerance?: number;
  chromaSmoothing?: number;
  pixelateEnabled?: boolean;
  pixelateSize?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.width;
      const h = img.height;

      // Calcular dimensões do Crop
      const startX = Math.floor(w * (cropLeft / 100));
      const endX = Math.floor(w * (1 - cropRight / 100));
      const startY = Math.floor(h * (cropTop / 100));
      const endY = Math.floor(h * (1 - cropBottom / 100));

      const cropW = Math.max(1, endX - startX);
      const cropH = Math.max(1, endY - startY);

      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Desenhar apenas os pixels recortados (Crop)
      ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

      // Se Chroma Key estiver ativo, removemos cores específicas
      if (chromaEnabled) {
        const imgData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imgData.data;

        // Converter hex para RGB
        const hexToRgb = (hex: string) => {
          const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return match ? [
            parseInt(match[1], 16),
            parseInt(match[2], 16),
            parseInt(match[3], 16)
          ] : null;
        };

        const rgb1 = hexToRgb(chromaColor);
        const rgb2 = chromaColor2 ? hexToRgb(chromaColor2) : null;
        const rgb3 = chromaColor3 ? hexToRgb(chromaColor3) : null;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];

          if (a === 0) continue;

          let minDiff = Infinity;

          const checkColorMatch = (rgb: number[]) => {
            const diff = Math.abs(r - rgb[0]) + Math.abs(g - rgb[1]) + Math.abs(b - rgb[2]);
            if (diff < minDiff) minDiff = diff;
          };

          if (rgb1) checkColorMatch(rgb1);
          if (rgb2) checkColorMatch(rgb2);
          if (rgb3) checkColorMatch(rgb3);

          if (minDiff < chromaTolerance) {
            if (minDiff > chromaTolerance - chromaSmoothing && chromaSmoothing > 0) {
              const alphaRatio = (minDiff - (chromaTolerance - chromaSmoothing)) / chromaSmoothing;
              data[i+3] = Math.min(a, Math.floor(alphaRatio * 255));
            } else {
              data[i+3] = 0;
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Aplica efeito Pixel Art se ativado
      if (pixelateEnabled && pixelateSize > 1) {
        const offscreenCanvas = document.createElement('canvas');
        const offW = Math.max(1, Math.floor(cropW / pixelateSize));
        const offH = Math.max(1, Math.floor(cropH / pixelateSize));
        
        offscreenCanvas.width = offW;
        offscreenCanvas.height = offH;
        const offCtx = offscreenCanvas.getContext('2d');
        if (offCtx) {
          // Desativa o antialiasing
          offCtx.imageSmoothingEnabled = false;
          // Desenha a imagem na resolução reduzida
          offCtx.drawImage(canvas, 0, 0, offW, offH);

          // Limpa o canvas original
          ctx.clearRect(0, 0, cropW, cropH);
          // Desativa antialiasing no original também para ampliar "duro"
          ctx.imageSmoothingEnabled = false;
          // Desenha a imagem reduzida de volta, esticada
          ctx.drawImage(offscreenCanvas, 0, 0, offW, offH, 0, 0, cropW, cropH);
        }
      }
    };
    img.src = frame;
  }, [frame, cropLeft, cropRight, cropTop, cropBottom, chromaEnabled, chromaColor, chromaColor2, chromaColor3, chromaTolerance, chromaSmoothing, pixelateEnabled, pixelateSize]);

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-neutral-950 overflow-hidden select-none">
      {/* Tabuleiro xadrez transparente sutil ao fundo */}
      <div className="absolute inset-0 bg-neutral-900 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(#1c1c1e 20%, transparent 20%), radial-gradient(#1c1c1e 20%, transparent 20%)',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 4px 4px',
        opacity: 0.15
      }} />
      <canvas 
        ref={canvasRef} 
        className="max-w-full max-h-full object-contain relative z-10 select-none pointer-events-none"
      />
    </div>
  );
}

export type BoxType = 'hitbox' | 'hurtbox';
export interface EditBox {
  id: string;
  type: BoxType;
  x: number; // Percent % centered
  y: number; // Percent % centered
  w: number; // Percent % scaled
  h: number; // Percent % scaled
}

export default function SpriteSlicer({
  isCombatMode: isCombatModeProp,
  setIsCombatMode: setIsCombatModeProp
}: {
  isCombatMode?: boolean;
  setIsCombatMode?: (val: boolean) => void;
} = {}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  
  const [bgColor, setBgColor] = useState<number[]>([255, 255, 255, 255]);
  const [tolerance, setTolerance] = useState(30);
  const [mergeDist, setMergeDist] = useState(2);
  const [minSize, setMinSize] = useState(1);
  
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  
  const [animationSpeed, setAnimationSpeed] = useState(0.1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [blendMode, setBlendMode] = useState<'normal' | 'screen'>('normal');
  const currentFrameRef = useRef(currentFrame);
  
  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);
  const [animationName, setAnimationName] = useState('animation_name');
  const [characterName, setCharacterName] = useState('');
  const [selectedRow, setSelectedRow] = useState<number | 'all'>('all');
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [disabledIndices, setDisabledIndices] = useState<Set<number>>(new Set());
  const [rowDisabledFrames, setRowDisabledFrames] = useState<Record<number, Set<number>>>({});
  
  // Hitboxes & Hurtboxes setup
  const [frameBoxes, setFrameBoxes] = useState<Record<number, EditBox[]>>({});
  const [activeBoxType, setActiveBoxType] = useState<BoxType>('hitbox');
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [drawingStart, setDrawingStart] = useState<{x: number, y: number} | null>(null);
  const [drawingCurrent, setDrawingCurrent] = useState<{x: number, y: number} | null>(null);
  
  // Crop Modal state
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [multiCropWindows, setMultiCropWindows] = useState<Rect[]>([]);
  const [stitchedWindows, setStitchedWindows] = useState<{yStart: number, yEnd: number, id: number}[]>([]);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [isDrawingNewCrop, setIsDrawingNewCrop] = useState(false);
  
  // Custom ordering of frames
  const [customOrder, setCustomOrder] = useState<number[]>([]);
  const [frameDurations, setFrameDurations] = useState<Record<number, number>>({});
  const [rowNames, setRowNames] = useState<Record<number, string>>({});
  const [rowPivots, setRowPivots] = useState<Record<number, 'center' | 'bottom'>>({});
  const [rowTypes, setRowTypes] = useState<Record<number, string>>({});
  const [rowPixelateEnabled, setRowPixelateEnabled] = useState<Record<number, boolean>>({});
  const [rowPixelateSize, setRowPixelateSize] = useState<Record<number, number>>({});
  
  // Palette State
  const [palette, setPalette] = useState<string[]>([]);
  const [showPalette, setShowPalette] = useState(false);

  // Engine Export formats
  const [exportFormat, setExportFormat] = useState<'json' | 'godot' | 'gamemaker'>('json');

  // Zoom and Pan state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isManualSelecting, setIsManualSelecting] = useState(false);
  const [isMagicWandMode, setIsMagicWandMode] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [manualSelectionRect, setManualSelectionRect] = useState<Rect | null>(null);
  const [manualRects, setManualRects] = useState<Rect[]>([]);
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
  const [gridCols, setGridCols] = useState(1);
  const [gridRows, setGridRows] = useState(1);

  const [history, setHistory] = useState<{ 
    rects: Rect[], 
    customOrder: number[], 
    disabledIndices: Set<number>, 
    rowDisabledFrames: Record<number, Set<number>>, 
    frameDurations: Record<number, number>,
    rowPixelateEnabled: Record<number, boolean>,
    rowPixelateSize: Record<number, number>,
    rowSpeeds: Record<number, number>,
    rowLoopPoints: Record<number, number | null>
  }[]>([]);
  const [redoStack, setRedoStack] = useState<{ 
    rects: Rect[], 
    customOrder: number[], 
    disabledIndices: Set<number>, 
    rowDisabledFrames: Record<number, Set<number>>, 
    frameDurations: Record<number, number>,
    rowPixelateEnabled: Record<number, boolean>,
    rowPixelateSize: Record<number, number>,
    rowSpeeds: Record<number, number>,
    rowLoopPoints: Record<number, number | null>
  }[]>([]);
  const [showSmartTips, setShowSmartTips] = useState(true);
  const [showSmartTipsModal, setShowSmartTipsModal] = useState(false);
  const [activeHint, setActiveHint] = useState<string | null>(null);
  
  // Video Frame Selection Mode
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [showVideoFrameSelector, setShowVideoFrameSelector] = useState(false);
  const [selectedVideoFrames, setSelectedVideoFrames] = useState<Set<number>>(new Set());
  const [videoFrameSize, setVideoFrameSize] = useState({ width: 0, height: 0 });
  
  // Estados Avançados de Recorte de Vídeo
  const [videoCropLeft, setVideoCropLeft] = useState<number>(0);
  const [videoCropRight, setVideoCropRight] = useState<number>(0);
  const [videoCropTop, setVideoCropTop] = useState<number>(0);
  const [videoCropBottom, setVideoCropBottom] = useState<number>(0);
  const [videoChromaEnabled, setVideoChromaEnabled] = useState<boolean>(false);
  const [videoChromaColor, setVideoChromaColor] = useState<string>('#0d0f1a');
  const [videoChromaColor2, setVideoChromaColor2] = useState<string>('');
  const [videoChromaColor3, setVideoChromaColor3] = useState<string>('');
  const [videoChromaTolerance, setVideoChromaTolerance] = useState<number>(45);
  const [videoChromaSmoothing, setVideoChromaSmoothing] = useState<number>(10);
  const [videoAutoCenter, setVideoAutoCenter] = useState<boolean>(true);
  const [videoAutoCenterPadding, setVideoAutoCenterPadding] = useState<number>(48);
  const [videoPixelateEnabled, setVideoPixelateEnabled] = useState<boolean>(false);
  const [videoPixelateSize, setVideoPixelateSize] = useState<number>(4);
  const [videoPreviewIndex, setVideoPreviewIndex] = useState<number>(0);

  const [skipAutoDetection, setSkipAutoDetection] = useState(false);
  const [preventAutoSlicing, setPreventAutoSlicing] = useState<boolean>(false);
  const [showImportOptionsModal, setShowImportOptionsModal] = useState<boolean>(false);
  const [useVideoPagination, setUseVideoPagination] = useState<boolean>(true);
  const [videoWindowSize, setVideoWindowSize] = useState<number>(12); // Default to 12 frames (keeping state matching user import)
  const [currentVideoWindow, setCurrentVideoWindow] = useState<number>(0);
  const [importedVideoFrameUrls, setImportedVideoFrameUrls] = useState<string[]>([]);
  const [previewAllVideoFrames, setPreviewAllVideoFrames] = useState<boolean>(true);
  const [showAudioZipPrompt, setShowAudioZipPrompt] = useState<boolean>(false);
  const audioZipInputRef = useRef<HTMLInputElement>(null);

  // Missing state variables
  const [imageError, setImageError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'settings' | 'workspace' | 'export'>('workspace');
  const [language, setLanguage] = useState<Language>('pt');
  const [isDirty, setIsDirty] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [exportTransparent, setExportTransparent] = useState(true);
  const [exportBgColor, setExportBgColor] = useState('#ffffff');
  const [exportOutline, setExportOutline] = useState(false);
  const [exportOutlineColor, setExportOutlineColor] = useState('#ffffff');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [previewBg, setPreviewBg] = useState('#ffffff');
  const [animationZoom, setAnimationZoom] = useState<'fit' | '1x' | '2x' | '3x' | '4x' | '5x' | '6x'>('fit');

  // Combat Moveset states
  const [isCombatModeState, setIsCombatModeState] = useState(false);
  const isCombatMode = isCombatModeProp !== undefined ? isCombatModeProp : isCombatModeState;
  const setIsCombatMode = setIsCombatModeProp !== undefined ? setIsCombatModeProp : setIsCombatModeState;
  const [customRows, setCustomRows] = useState<Rect[][]>([]);

  // Helpers to name rows based on StitchedWindows presence
  const getRowLabel = (i: number | string) => {
    if (i === 'all') return 'Todas as Linhas';
    const index = Number(i);
    return stitchedWindows.length > 0 ? `Janela ${index + 1}` : `Linha ${index + 1}`;
  };
  
  const getActionName = (i: number) => rowNames[i] || rowTypes[i] || (stitchedWindows.length > 0 ? `Janela ${i + 1}` : `Ação ${i + 1}`);

  const [rowKeys, setRowKeys] = useState<Record<number, string>>({});
  const [rowSpeeds, setRowSpeeds] = useState<Record<number, number>>({});
  const [rowHits, setRowHits] = useState<Record<number, number>>({});
  const [rowLoopPoints, setRowLoopPoints] = useState<Record<number, number | null>>({});
  
  // Sandbox State Machine
  const [sandboxActiveRow, setSandboxActiveRow] = useState<number | 'none'>('none');
  const [sandboxFrame, setSandboxFrame] = useState(0);
  const [sandboxIsPlaying, setSandboxIsPlaying] = useState(true);
  const [isPlayingNonLooping, setIsPlayingNonLooping] = useState(false);
  const [dummyHp, setDummyHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [arenaLogs, setArenaLogs] = useState<string[]>([]);
  const [isDummyHurt, setIsDummyHurt] = useState(false);
  const [showVfx, setShowVfx] = useState<string | null>(null);
  const [dummyAutoAttack, setDummyAutoAttack] = useState(false);
  const [isPlayerHurt, setIsPlayerHurt] = useState(false);

  // Mobile long-press and frame customization states
  const [longPressRowIndex, setLongPressRowIndex] = useState<number | null>(null);
  const [mobileEditModalRow, setMobileEditModalRow] = useState<number | null>(null);
  const [mobileEditSelectedFrame, setMobileEditSelectedFrame] = useState<number>(0);
  const longPressTimerRef = useRef<any>(null);
  const isLongPressActive = useRef(false);
  const mobileCanvasRef = useRef<HTMLCanvasElement>(null);

  // Create Moveset modal States
  const [showCreateMovesetModal, setShowCreateMovesetModal] = useState(false);
  const [movesetRowIndex, setMovesetRowIndex] = useState<number>(0);
  const [movesetType, setMovesetType] = useState<string>('idle');
  const [movesetName, setMovesetName] = useState<string>('');
  const [movesetKey, setMovesetKey] = useState<string>('NONE');
  const [movesetSpeed, setMovesetSpeed] = useState<number>(1.0);
  const [movesetHitFrame, setMovesetHitFrame] = useState<number>(0);
  const [movesetSelectedFrames, setMovesetSelectedFrames] = useState<number[]>([]);
  const movesetCanvasRef = useRef<HTMLCanvasElement>(null);

  // States for renaming the active combat combo name (pencil button)
  const [editingComboRowIndex, setEditingComboRowIndex] = useState<number | null>(null);
  const [editingComboRowName, setEditingComboRowName] = useState<string>('');

  // States for single row download selection modal
  const [showDownloadRowModal, setShowDownloadRowModal] = useState<boolean>(false);
  const [downloadRowIndex, setDownloadRowIndex] = useState<number>(0);
  const downloadRowCanvasRef = useRef<HTMLCanvasElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sandboxCanvasRef = useRef<HTMLCanvasElement>(null);

  // --- Smart Tips Logic ---
  useEffect(() => {
    if (!showSmartTips || !imageSrc) return;

    // Hint: Many sprites detected
    if (rects.length > 50 && !activeHint) {
      setActiveHint(translations[language].hints.multipleCharacters);
    }

    // Hint: Transparency issue (if background is opaque and no sprites detected)
    if (rects.length === 0 && bgColor[3] > 200 && !activeHint) {
      setActiveHint(translations[language].hints.transparencyIssue);
    }

    // Hint: Reorder frames (if multiple frames and haven't reordered yet)
    const isDefaultOrder = customOrder.length > 1 && customOrder.every((val, index) => val === index);
    if (customOrder.length > 1 && isDefaultOrder && !activeHint) {
      setActiveHint(translations[language].hints.reorderFrames);
    }
  }, [rects.length, bgColor, imageSrc, imageElement, showSmartTips, language, customOrder]);

  const pushToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      rowDisabledFrames: Object.fromEntries(Object.entries(rowDisabledFrames).map(([k, v]) => [k, new Set(v)])),
      frameDurations: { ...frameDurations },
      rowPixelateEnabled: { ...rowPixelateEnabled },
      rowPixelateSize: { ...rowPixelateSize },
      rowSpeeds: { ...rowSpeeds },
      rowLoopPoints: { ...rowLoopPoints }
    }]);
    setRedoStack([]);
  }, [rects, customOrder, disabledIndices, rowDisabledFrames, frameDurations, rowPixelateEnabled, rowPixelateSize, rowSpeeds, rowLoopPoints]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prevState = history[history.length - 1];
    
    // Save current to redo stack
    setRedoStack(prev => [...prev, { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      rowDisabledFrames: Object.fromEntries(Object.entries(rowDisabledFrames).map(([k, v]) => [k, new Set(v)])),
      frameDurations: { ...frameDurations },
      rowPixelateEnabled: { ...rowPixelateEnabled },
      rowPixelateSize: { ...rowPixelateSize },
      rowSpeeds: { ...rowSpeeds },
      rowLoopPoints: { ...rowLoopPoints }
    }]);
    
    // Restore previous
    setRects(prevState.rects);
    setCustomOrder(prevState.customOrder);
    setDisabledIndices(prevState.disabledIndices);
    setRowDisabledFrames(prevState.rowDisabledFrames || {});
    setFrameDurations(prevState.frameDurations || {});
    setRowPixelateEnabled(prevState.rowPixelateEnabled || {});
    setRowPixelateSize(prevState.rowPixelateSize || {});
    setRowSpeeds(prevState.rowSpeeds || {});
    setRowLoopPoints(prevState.rowLoopPoints || {});
    
    setHistory(prev => prev.slice(0, -1));
    setSelectedRectIndex(null);
  }, [history, rects, customOrder, disabledIndices, rowDisabledFrames, frameDurations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    
    // Save current to history
    setHistory(prev => [...prev, { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      rowDisabledFrames: Object.fromEntries(Object.entries(rowDisabledFrames).map(([k, v]) => [k, new Set(v)])),
      frameDurations: { ...frameDurations },
      rowPixelateEnabled: { ...rowPixelateEnabled },
      rowPixelateSize: { ...rowPixelateSize },
      rowSpeeds: { ...rowSpeeds },
      rowLoopPoints: { ...rowLoopPoints }
    }]);
    
    // Restore next
    setRects(nextState.rects);
    setCustomOrder(nextState.customOrder);
    setDisabledIndices(nextState.disabledIndices);
    setRowDisabledFrames(nextState.rowDisabledFrames || {});
    setFrameDurations(nextState.frameDurations || {});
    setRowPixelateEnabled(nextState.rowPixelateEnabled || {});
    setRowPixelateSize(nextState.rowPixelateSize || {});
    setRowSpeeds(nextState.rowSpeeds || {});
    setRowLoopPoints(nextState.rowLoopPoints || {});
    
    setRedoStack(prev => prev.slice(0, -1));
    setSelectedRectIndex(null);
  }, [redoStack, rects, customOrder, disabledIndices, rowDisabledFrames, frameDurations]);

  // --- Project Persistence ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (imageSrc || rects.length > 0) {
      setIsDirty(true);
    }
  }, [imageSrc, rects, bgColor, tolerance, mergeDist, minSize, animationSpeed, animationName, characterName, customOrder, disabledIndices, rowNames, rowPivots, rowTypes]);

  // --- Auto-Save Persistence ---
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const loadAutoSave = async () => {
      try {
        const data = await localforage.getItem<any>('spriteSlicerAutoSave');
        if (data && data.version === '1.0') {
          // If there's an image, set it. 
          // Prevent setting expired blob URLs which cause "Failed to load image" errors
          if (data.imageSrc && !data.imageSrc.startsWith('blob:')) {
            setImageSrc(data.imageSrc);
          }
          
          if (data.rects) setRects(data.rects);
          if (data.bgColor) setBgColor(data.bgColor);
          if (data.tolerance) setTolerance(data.tolerance);
          if (data.mergeDist) setMergeDist(data.mergeDist);
          if (data.minSize) setMinSize(data.minSize);
          if (data.animationSpeed) setAnimationSpeed(data.animationSpeed);
          if (data.animationName) setAnimationName(data.animationName);
          if (data.characterName !== undefined) setCharacterName(data.characterName);
          if (data.customOrder) setCustomOrder(data.customOrder);
          if (data.disabledIndices) setDisabledIndices(new Set(data.disabledIndices));
          if (data.frameDurations) setFrameDurations(data.frameDurations);
          if (data.rowNames) setRowNames(data.rowNames);
          if (data.rowPivots) setRowPivots(data.rowPivots);
          if (data.rowTypes) setRowTypes(data.rowTypes);
          if (data.rowSpeeds) setRowSpeeds(data.rowSpeeds);
          if (data.rowLoopPoints) setRowLoopPoints(data.rowLoopPoints);
          if (data.rowPixelateEnabled) setRowPixelateEnabled(data.rowPixelateEnabled);
          if (data.rowPixelateSize) setRowPixelateSize(data.rowPixelateSize);
          console.log('Auto-saved project restored.');
        }
      } catch (err) {
        console.error('Failed to load auto-save:', err);
      } finally {
        setIsInitialized(true);
      }
    };
    loadAutoSave();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    
    const saveToLocalForage = async () => {
      if (!imageSrc && rects.length === 0) return; // Don't save empty state
      
      const projectData = {
        version: '1.0',
        imageSrc,
        rects,
        bgColor,
        tolerance,
        mergeDist,
        minSize,
        animationSpeed,
        animationName,
        characterName,
        customOrder,
        disabledIndices: Array.from(disabledIndices),
        frameDurations,
        rowNames,
        rowPivots,
        rowTypes,
        rowSpeeds,
        rowLoopPoints,
        rowPixelateEnabled,
        rowPixelateSize,
      };
      
      try {
        if (projectData.imageSrc && projectData.imageSrc.length > 100000) {
          console.log(`Saving large image to auto-save: ${Math.round(projectData.imageSrc.length / 1024)} KB`);
        }
        await localforage.setItem('spriteSlicerAutoSave', projectData);
      } catch (err) {
        console.error('Failed to auto-save project. Sprite sheet might be too large for browser storage quota:', err);
      }
    };

    const timeoutId = setTimeout(saveToLocalForage, 1000); // Debounce auto-save
    return () => clearTimeout(timeoutId);
  }, [isInitialized, imageSrc, rects, bgColor, tolerance, mergeDist, minSize, animationSpeed, animationName, characterName, customOrder, disabledIndices, frameDurations, rowNames, rowPivots, rowTypes, rowSpeeds, rowLoopPoints, rowPixelateEnabled, rowPixelateSize]);

  const handleSaveProject = () => {
    const projectData = {
      version: '1.0',
      imageSrc,
      rects,
      bgColor,
      tolerance,
      mergeDist,
      minSize,
      animationSpeed,
      animationName,
      characterName,
      customOrder,
      disabledIndices: Array.from(disabledIndices),
      frameDurations,
      rowNames,
      rowPivots,
      rowTypes,
      rowSpeeds, // Include rowSpeeds
      rowLoopPoints, // Include rowLoopPoints
      rowPixelateEnabled,
      rowPixelateSize
    };

    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName || 'sprite_project'}.slicer`;
    a.click();
    URL.revokeObjectURL(url);
    setIsDirty(false);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.imageSrc) {
          // If the imageSrc is a blob URL, it might be invalid across sessions.
          // However, since it's saved in the project, we try to load it.
          // A better approach would be to save the image data as base64, but for now we'll just set it.
          setImageSrc(data.imageSrc);
        }
        if (data.rects) setRects(data.rects);
        if (data.bgColor) setBgColor(data.bgColor);
        if (data.tolerance) setTolerance(data.tolerance);
        if (data.mergeDist) setMergeDist(data.mergeDist);
        if (data.minSize) setMinSize(data.minSize);
        if (data.animationSpeed) setAnimationSpeed(data.animationSpeed);
        if (data.animationName) setAnimationName(data.animationName);
        if (data.characterName !== undefined) setCharacterName(data.characterName);
        if (data.customOrder) setCustomOrder(data.customOrder);
        if (data.disabledIndices) setDisabledIndices(new Set(data.disabledIndices));
        if (data.frameDurations) setFrameDurations(data.frameDurations);
        if (data.rowNames) setRowNames(data.rowNames);
        if (data.rowPivots) setRowPivots(data.rowPivots);
        if (data.rowTypes) setRowTypes(data.rowTypes);
        if (data.rowSpeeds) setRowSpeeds(data.rowSpeeds); // Restore rowSpeeds
        if (data.rowLoopPoints) setRowLoopPoints(data.rowLoopPoints); // Restore rowLoopPoints
        if (data.rowPixelateEnabled) setRowPixelateEnabled(data.rowPixelateEnabled);
        if (data.rowPixelateSize) setRowPixelateSize(data.rowPixelateSize);
        
        setIsDirty(false);
        setHistory([]);
        setRedoStack([]);
      } catch (err) {
        console.error('Error loading project:', err);
        alert('Erro ao carregar o projeto. Verifique se o arquivo é válido.');
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('spriteSlicerTutorialSeen');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
    const hasSeenUpdate = localStorage.getItem('spriteSlicerUpdate2_2');
    if (!hasSeenUpdate) {
      setShowUpdateModal(true);
      localStorage.setItem('spriteSlicerUpdate2_2', 'true');
    }
    
    const savedLang = localStorage.getItem('spriteSlicerLanguage');
    if (savedLang && (savedLang === 'pt' || savedLang === 'en' || savedLang === 'es')) {
      setLanguage(savedLang as Language);
    } else {
      setShowLanguageModal(true);
    }
  }, []);

  const closeTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('spriteSlicerTutorialSeen', 'true');
  };

  const handleLanguageSelect = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('spriteSlicerLanguage', lang);
    setShowLanguageModal(false);
  };

  const t = translations[language];

  const tutorialSteps = [
    {
      title: t.tutorial.welcome.title,
      content: t.tutorial.welcome.content,
      icon: <Maximize className="w-12 h-12 text-emerald-500" />
    },
    {
      title: t.tutorial.step1.title,
      content: t.tutorial.step1.content,
      icon: <Upload className="w-12 h-12 text-blue-500" />
    },
    {
      title: (t.tutorial as any).stepVideo.title,
      content: (t.tutorial as any).stepVideo.content,
      icon: <AlertCircle className="w-12 h-12 text-amber-500" />
    },
    {
      title: t.tutorial.step2.title,
      content: t.tutorial.step2.content,
      icon: <MousePointer2 className="w-12 h-12 text-purple-500" />
    },
    {
      title: t.tutorial.step3.title,
      content: (
        <div className="text-left space-y-2 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500" />
            <span className="text-xs text-neutral-300"><strong className="text-emerald-500">{t.tutorial.step3.green}:</strong> {t.tutorial.step3.greenDesc}.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/20 border border-red-500" />
            <span className="text-xs text-neutral-300"><strong className="text-red-500">{t.tutorial.step3.red}:</strong> {t.tutorial.step3.redDesc}.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-500" />
            <span className="text-xs text-neutral-300"><strong className="text-blue-500">{t.tutorial.step3.blue}:</strong> {t.tutorial.step3.blueDesc}.</span>
          </div>
        </div>
      ),
      icon: <div className="relative"><ArrowRight className="w-12 h-12 text-emerald-500 animate-bounce" /></div>
    },
    {
      title: t.tutorial.step4.title,
      content: (
        <div className="text-left space-y-3 mt-2">
          <p className="text-xs text-neutral-400">{t.tutorial.step4.content}</p>
          <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-6 h-6 bg-emerald-500/20 border border-emerald-500 rounded flex items-center justify-center text-[10px]">1</div>
              <ArrowRight className="w-3 h-3 text-neutral-500" />
              <div className="w-6 h-6 bg-emerald-500/20 border border-emerald-500 rounded flex items-center justify-center text-[10px]">2</div>
              <ArrowRight className="w-3 h-3 text-neutral-500" />
              <div className="w-6 h-6 bg-emerald-500/20 border border-emerald-500 rounded flex items-center justify-center text-[10px]">3</div>
            </div>
          </div>
        </div>
      ),
      icon: <div className="relative"><ArrowDown className="w-12 h-12 text-blue-500 animate-bounce" /></div>
    },
    {
      title: t.tutorial.step5.title,
      content: t.tutorial.step5.content,
      icon: <ImageIcon className="w-12 h-12 text-orange-500" />
    },
    {
      title: (t.tutorial as any).stepArena.title,
      content: (t.tutorial as any).stepArena.content,
      icon: <Zap className="w-12 h-12 text-yellow-400" />
    },
    {
      title: t.tutorial.step6.title,
      content: t.tutorial.step6.content,
      icon: <Play className="w-12 h-12 text-pink-500" />
    },
    {
      title: t.tutorial.manifesto.title,
      content: t.tutorial.manifesto.content,
      icon: <HelpCircle className="w-12 h-12 text-emerald-400" />
    }
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceDown(true);
        if (!isManualSelecting && !isPickingColor) setIsPanMode(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      
      // Delete selected rect
      if (selectedRectIndex !== null && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        pushToHistory();
        setRects(prev => prev.filter((_, i) => i !== selectedRectIndex));
        setSelectedRectIndex(null);
      }

      // Nudge selected rect
      if (selectedRectIndex !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        pushToHistory();
        setRects(prev => prev.map((r, i) => {
          if (i !== selectedRectIndex) return r;
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp') return { ...r, y: r.y - step };
          if (e.key === 'ArrowDown') return { ...r, y: r.y + step };
          if (e.key === 'ArrowLeft') return { ...r, x: r.x - step };
          if (e.key === 'ArrowRight') return { ...r, x: r.x + step };
          return r;
        }));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
        setIsPanMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isManualSelecting, isPickingColor, handleUndo, handleRedo, selectedRectIndex, pushToHistory]);

  const processVideoFile = async (file: File) => {
    // Security: Limit file size to 50MB for videos
    if (file.size > 50 * 1024 * 1024) {
      alert("Security Limit: Video file is too large (Max 50MB).");
      return;
    }

    setIsProcessingVideo(true);
    setVideoProgress(0);

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    
    video.onloadedmetadata = async () => {
      try {
        if (video.duration < 1 || video.duration > 30) {
          alert("Video must be between 1 and 30 seconds.");
          setIsProcessingVideo(false);
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsProcessingVideo(false);
          return;
        }

        // Dynamically adjust FPS based on duration to capture fast movements 
        // while keeping the total frame count reasonable (max ~150 frames)
        let fps = 12; // Default for short videos
        if (video.duration > 12) {
          fps = Math.max(5, Math.floor(150 / video.duration));
        } else if (video.duration <= 5) {
          fps = 15; // Higher FPS for very short, fast videos
        }
        
        const frames = [];
        const frameCount = Math.floor(video.duration * fps);
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Ensure video has enough data before seeking
        if (video.readyState < 2) {
          await new Promise(resolve => {
            video.onloadeddata = resolve;
          });
        }

        // Kickstart the decoder (helps on some mobile browsers)
        try {
          await video.play();
          video.pause();
        } catch (e) {
          // Ignore play errors
        }

        for (let i = 0; i < frameCount; i++) {
          const targetTime = i / fps;
          video.currentTime = targetTime;
          
          await new Promise<void>(resolve => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              // Small delay to ensure frame is rendered internally
              setTimeout(resolve, 10);
            };
            video.addEventListener('seeked', handleSeeked);
            
            // Fallback in case seeked doesn't fire
            setTimeout(() => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            }, 500);
          });
          
          ctx.drawImage(video, 0, 0);
          
          // Downscale to a reasonable size to prevent OOM
          // Most sprites don't need to be 1080p. 800px is a good compromise.
          const maxDim = 800;
          let frameDataUrl;
          if (video.videoWidth > maxDim || video.videoHeight > maxDim) {
            const scale = maxDim / Math.max(video.videoWidth, video.videoHeight);
            const sw = Math.floor(video.videoWidth * scale);
            const sh = Math.floor(video.videoHeight * scale);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sw;
            tempCanvas.height = sh;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(video, 0, 0, sw, sh);
              frameDataUrl = tempCanvas.toDataURL('image/png');
            } else {
              frameDataUrl = canvas.toDataURL('image/png');
            }
          } else {
            frameDataUrl = canvas.toDataURL('image/png');
          }
          
          frames.push(frameDataUrl);
          setVideoProgress(Math.round(((i + 1) / frameCount) * 100));
        }

        setVideoFrames(frames);
        // We need to get the size of the first frame to know the grid size
        const img = new Image();
        img.onload = () => {
          setVideoFrameSize({ width: img.width, height: img.height });
          setSelectedVideoFrames(new Set(frames.map((_, i) => i)));
          setShowVideoFrameSelector(true);
        };
        img.src = frames[0];
        
      } catch (error) {
        console.error("Error processing video:", error);
        alert("Error processing video.");
      } finally {
        setIsProcessingVideo(false);
        URL.revokeObjectURL(video.src);
      }
    };

    video.onerror = () => {
      alert("Error loading video file.");
      setIsProcessingVideo(false);
    };
  };

  const assembleSelectedFrames = async (
    forcePreventSlicing?: boolean,
    windowIndex: number = 0,
    customFrameUrls?: string[]
  ) => {
    if (!customFrameUrls && (videoFrames.length === 0 || selectedVideoFrames.size === 0)) return;

    setIsProcessingVideo(true);
    setVideoProgress(1); // Visual feedback that assembly has started

    const isWholeFrame = forcePreventSlicing !== undefined ? forcePreventSlicing : preventAutoSlicing;

    const selectedIndices = Array.from(selectedVideoFrames).sort((a, b) => a - b);
    const allSelectedUrls = customFrameUrls || selectedIndices.map(i => videoFrames[i]);

    // Save to state for later pagination if it's the first import
    if (!customFrameUrls) {
      setImportedVideoFrameUrls(allSelectedUrls);
      setCurrentVideoWindow(windowIndex);
    } else {
      setCurrentVideoWindow(windowIndex);
    }

    let targetUrls = allSelectedUrls;
    if (isWholeFrame && useVideoPagination) {
      const start = windowIndex * videoWindowSize;
      const end = Math.min(allSelectedUrls.length, start + videoWindowSize);
      targetUrls = allSelectedUrls.slice(start, end);
    }

    const frameCount = targetUrls.length;

    // 1. Primeiramente, carregar todos os frames selecionados e processá-los com Crop e Chroma Key
    const processedFrames: { canvas: HTMLCanvasElement, bbox?: { minX: number, maxX: number, minY: number, maxY: number, w: number, h: number } }[] = [];

    // Helper para converter Hex para RGB
    const hexToRgb = (hex: string) => {
      const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return match ? [
        parseInt(match[1], 16),
        parseInt(match[2], 16),
        parseInt(match[3], 16)
      ] : null;
    };

    const rgb1 = hexToRgb(videoChromaColor);
    const rgb2 = videoChromaColor2 ? hexToRgb(videoChromaColor2) : null;
    const rgb3 = videoChromaColor3 ? hexToRgb(videoChromaColor3) : null;

    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = targetUrls[i];
      await new Promise(resolve => { img.onload = resolve; });

      // Calcular dimensões do Crop
      const w = img.width;
      const h = img.height;
      const startX = Math.floor(w * (videoCropLeft / 100));
      const endX = Math.floor(w * (1 - videoCropRight / 100));
      const startY = Math.floor(h * (videoCropTop / 100));
      const endY = Math.floor(h * (1 - videoCropBottom / 100));
      const cropW = Math.max(1, endX - startX);
      const cropH = Math.max(1, endY - startY);

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = cropW;
      frameCanvas.height = cropH;
      const frameCtx = frameCanvas.getContext('2d');
      if (!frameCtx) continue;

      // Desenhar recortado
      frameCtx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

      // Aplicar Chroma Key se ativado ou necessário para bounding box (e se não for frame inteiro)
      let bbox = undefined;
      const imgData = frameCtx.getImageData(0, 0, cropW, cropH);
      const data = imgData.data;

      let minX = cropW;
      let maxX = -1;
      let minY = cropH;
      let maxY = -1;
      let hasVisiblePixels = false;

      for (let j = 0; j < data.length; j += 4) {
        const r = data[j];
         const g = data[j+1];
         const b = data[j+2];
         const a = data[j+3];

        if (a === 0) continue;

        let minDiff = Infinity;

        const checkColorMatch = (rgb: number[]) => {
          const diff = Math.abs(r - rgb[0]) + Math.abs(g - rgb[1]) + Math.abs(b - rgb[2]);
          if (diff < minDiff) minDiff = diff;
        };

        if (videoChromaEnabled && !isWholeFrame) {
          if (rgb1) checkColorMatch(rgb1);
          if (rgb2) checkColorMatch(rgb2);
          if (rgb3) checkColorMatch(rgb3);

          if (minDiff < videoChromaTolerance) {
            if (minDiff > videoChromaTolerance - videoChromaSmoothing && videoChromaSmoothing > 0) {
              const alphaRatio = (minDiff - (videoChromaTolerance - videoChromaSmoothing)) / videoChromaSmoothing;
              data[j+3] = Math.min(a, Math.floor(alphaRatio * 255));
            } else {
              data[j+3] = 0;
            }
          }
        }
      }

      // Devolver os dados modificados pelo Chroma Key ao canvas do frame
      if (videoChromaEnabled && !isWholeFrame) {
        frameCtx.putImageData(imgData, 0, 0);
      }

      // Aplica efeito Pixel Art se ativado
      if (videoPixelateEnabled && videoPixelateSize > 1) {
        const offscreenCanvas = document.createElement('canvas');
        const offW = Math.max(1, Math.floor(cropW / videoPixelateSize));
        const offH = Math.max(1, Math.floor(cropH / videoPixelateSize));
        
        offscreenCanvas.width = offW;
        offscreenCanvas.height = offH;
        const offCtx = offscreenCanvas.getContext('2d');
        if (offCtx) {
          offCtx.imageSmoothingEnabled = false;
          offCtx.drawImage(frameCanvas, 0, 0, offW, offH);

          frameCtx.clearRect(0, 0, cropW, cropH);
          frameCtx.imageSmoothingEnabled = false;
          frameCtx.drawImage(offscreenCanvas, 0, 0, offW, offH, 0, 0, cropW, cropH);
        }
      }

      // Re-calcular a bounding box caso a pixelização ou chroma key tenha alterado/removido as bordas ativas
      const finalImgData = frameCtx.getImageData(0, 0, cropW, cropH);
      const finalData = finalImgData.data;

      minX = cropW;
      maxX = -1;
      minY = cropH;
      maxY = -1;
      hasVisiblePixels = false;

      for (let j = 0; j < finalData.length; j += 4) {
        if (finalData[j+3] > 15) {
          const pixelIndex = j / 4;
          const px = pixelIndex % cropW;
          const py = Math.floor(pixelIndex / cropW);

          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          hasVisiblePixels = true;
        }
      }

      if (hasVisiblePixels && maxX >= minX && maxY >= minY) {
        bbox = {
          minX, maxX, minY, maxY,
          w: maxX - minX + 1,
          h: maxY - minY + 1
        };
      }

      processedFrames.push({
        canvas: frameCanvas,
        bbox
      });

      setVideoProgress(Math.round((i / frameCount) * 100));
    }

    // 2. Determinar as dimensões finais das células
    let cellW = Math.max(1, videoFrameSize.width * (1 - (videoCropLeft + videoCropRight) / 100));
    let cellH = Math.max(1, videoFrameSize.height * (1 - (videoCropTop + videoCropBottom) / 100));

    // Se a auto-centralização estiver habilitada, as células podem ter tamanho menor e mais uniforme! (apenas se não for frame inteiro)
    if (videoAutoCenter && !isWholeFrame) {
      let maxCharW = 0;
      let maxCharH = 0;
      let validBboxCount = 0;

      for (const f of processedFrames) {
        if (f.bbox) {
          if (f.bbox.w > maxCharW) maxCharW = f.bbox.w;
          if (f.bbox.h > maxCharH) maxCharH = f.bbox.h;
          validBboxCount++;
        }
      }

      if (validBboxCount > 0) {
        // Enquadrar com uma margem extra de segurança selecionada pelo usuário
        cellW = maxCharW + videoAutoCenterPadding;
        cellH = maxCharH + videoAutoCenterPadding;
      }
    }

    // Limitar dimensão total da folha para evitar estourar o limite de textura da GPU (Max 4096px)
    const cols = Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / cols);
    const MAX_SHEET_DIM = 4096;

    if (cols * cellW > MAX_SHEET_DIM || rows * cellH > MAX_SHEET_DIM) {
      const scaleX = MAX_SHEET_DIM / (cols * cellW);
      const scaleY = MAX_SHEET_DIM / (rows * cellH);
      const scale = Math.min(scaleX, scaleY);
      cellW = Math.floor(cellW * scale);
      cellH = Math.floor(cellH * scale);
    }

    cellW = Math.floor(cellW);
    cellH = Math.floor(cellH);

    // 3. Montar a folha de sprites final desenhando cada célula centralizada ou recortada
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = cols * cellW;
    sheetCanvas.height = rows * cellH;
    const sheetCtx = sheetCanvas.getContext('2d');
    
    if (!sheetCtx) {
      setIsProcessingVideo(false);
      return;
    }

    for (let i = 0; i < frameCount; i++) {
      const pf = processedFrames[i];
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;

      if (videoAutoCenter && !isWholeFrame && pf.bbox) {
        const bx1 = pf.bbox.minX;
        const by1 = pf.bbox.minY;
        const bw = pf.bbox.w;
        const bh = pf.bbox.h;

        // Centralizar a bounding box do sprite na célula destino
        const destX = x + Math.floor((cellW - bw) / 2);
        const destY = y + Math.floor((cellH - bh) / 2);

        sheetCtx.drawImage(pf.canvas, bx1, by1, bw, bh, destX, destY, bw, bh);
      } else {
        sheetCtx.drawImage(pf.canvas, 0, 0, pf.canvas.width, pf.canvas.height, x, y, cellW, cellH);
      }
    }

    const newRects: Rect[] = targetUrls.map((_, i) => ({
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
      w: cellW,
      h: cellH
    }));

    if (isWholeFrame) {
      setExportTransparent(false);
    } else {
      setExportTransparent(true);
    }

    setImageSrc(sheetCanvas.toDataURL('image/png'));
    setRects(newRects);
    setCustomOrder(newRects.map((_, i) => i));
    setSkipAutoDetection(true);
    setDisabledIndices(new Set());
    setFrameDurations({});
    setSelectedRectIndex(null);
    setCurrentFrame(0);
    setShowVideoFrameSelector(false);
    
    if (!customFrameUrls) {
      setVideoFrames([]); // Clear RAM on initial import
    }
    
    setIsProcessingVideo(false);
    
    // Clear video crop states only on first import, so pagination page changes are not disrupted
    if (!customFrameUrls) {
      setVideoCropLeft(0);
      setVideoCropRight(0);
      setVideoCropTop(0);
      setVideoCropBottom(0);
      setVideoChromaEnabled(false);
      setVideoChromaColor('#0d0f1a');
      setVideoChromaColor2('');
      setVideoChromaColor3('');
    }
  };

  const handleAutoDetectLetterbox = () => {
    if (videoFrames.length === 0) return;
    
    setIsProcessingVideo(true);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsProcessingVideo(false);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      // Amostra vertical na coluna 25%, 50% e 75% da largura
      const cols = [Math.floor(img.width * 0.25), Math.floor(img.width * 0.5), Math.floor(img.width * 0.75)];
      
      let detectedTop = img.height;
      let detectedBottom = 0;
      let detectedLeft = img.width;
      let detectedRight = 0;

      // Análise de Tarjas Pretas Verticais (Letterbox)
      for (const cx of cols) {
        // De cima para baixo
        for (let y = 0; y < img.height; y++) {
          const idx = (y * img.width + cx) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          
          if (r > 26 || g > 26 || b > 26) { // Limiar relaxado para compressão de vídeo
            if (y < detectedTop) detectedTop = y;
            break;
          }
        }
        // De baixo para cima
        for (let y = img.height - 1; y >= 0; y--) {
          const idx = (y * img.width + cx) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          
          if (r > 26 || g > 26 || b > 26) {
            const distFromBottom = img.height - 1 - y;
            if (distFromBottom > detectedBottom) detectedBottom = distFromBottom;
            break;
          }
        }
      }

      // Amostra horizontal na linha 30%, 50% e 70% da altura (para cortes laterais/pillarbox)
      const rowsSample = [Math.floor(img.height * 0.3), Math.floor(img.height * 0.5), Math.floor(img.height * 0.7)];
      for (const cy of rowsSample) {
        // Da esquerda para a direita
        for (let x = 0; x < img.width; x++) {
          const idx = (cy * img.width + x) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          if (r > 26 || g > 26 || b > 26) {
            if (x < detectedLeft) detectedLeft = x;
            break;
          }
        }
        // Da direita para a esquerda
        for (let x = img.width - 1; x >= 0; x--) {
          const idx = (cy * img.width + x) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          if (r > 26 || g > 26 || b > 26) {
            const distFromRight = img.width - 1 - x;
            if (distFromRight > detectedRight) detectedRight = distFromRight;
            break;
          }
        }
      }

      // Definir valores de corte se válidos
      if (detectedTop < img.height && detectedTop > 0) {
        const topPct = Math.ceil((detectedTop / img.height) * 100);
        setVideoCropTop(Math.max(0, topPct - 1)); // -1% margem de tolerância
      } else {
        setVideoCropTop(0);
      }

      if (detectedBottom < img.height && detectedBottom > 0) {
        const bottomPct = Math.ceil((detectedBottom / img.height) * 100);
        setVideoCropBottom(Math.max(0, bottomPct - 1));
      } else {
        setVideoCropBottom(0);
      }

      if (detectedLeft < img.width && detectedLeft > 0) {
        const leftPct = Math.ceil((detectedLeft / img.width) * 100);
        setVideoCropLeft(Math.max(0, leftPct - 1));
      } else {
        setVideoCropLeft(0);
      }

      if (detectedRight < img.width && detectedRight > 0) {
        const rightPct = Math.ceil((detectedRight / img.width) * 100);
        setVideoCropRight(Math.max(0, rightPct - 1));
      } else {
        setVideoCropRight(0);
      }

      setIsProcessingVideo(false);
    };
    img.src = videoFrames[0];
  };

  const processImageFile = (file: File) => {
    // Security: Limit file size to 20MB for images
    if (file.size > 20 * 1024 * 1024) {
      alert("Security Limit: Image file is too large (Max 20MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      // Safety: Load into a temporary image to check dimensions and downscale if necessary
      // This prevents "Aw Snap" errors on mobile when loading massive spritesheets
      const img = new Image();
      img.onload = () => {
        const MAX_DIMENSION = 4096; // Safe limit for most mobile browsers
        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(img.width, img.height);
          const width = Math.floor(img.width * scale);
          const height = Math.floor(img.height * scale);
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const downscaledSrc = canvas.toDataURL('image/png');
            setImageSrc(downscaledSrc);
          } else {
            setImageSrc(result);
          }
        } else {
          setImageSrc(result);
        }
        
        setRects([]);
        setStitchedWindows([]);
        setSelectedRectIndex(null);
        setCurrentFrame(0);
        setSelectedRow('all');
        setDisabledIndices(new Set());
        setCustomOrder([]);
        setFrameDurations({});
        setScale(1);
        setPan({ x: 0, y: 0 });
        setPreventAutoSlicing(false);
      };
      img.onerror = () => {
         console.error("Failed to load chosen file into an Image object.");
         alert("Falha ao carregar a imagem. O arquivo pode estar corrompido.");
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVideoFile(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      processImageFile(file);
    } else if (file.type.startsWith('video/')) {
      processVideoFile(file);
    } else if (file.name.endsWith('.slicer')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.imageSrc) setImageSrc(data.imageSrc);
          if (data.rects) setRects(data.rects);
          if (data.bgColor) setBgColor(data.bgColor);
          if (data.tolerance) setTolerance(data.tolerance);
          if (data.mergeDist) setMergeDist(data.mergeDist);
          if (data.minSize) setMinSize(data.minSize);
          if (data.animationSpeed) setAnimationSpeed(data.animationSpeed);
          if (data.animationName) setAnimationName(data.animationName);
          if (data.customOrder) setCustomOrder(data.customOrder);
          if (data.disabledIndices) setDisabledIndices(new Set(data.disabledIndices));
          if (data.frameDurations) setFrameDurations(data.frameDurations);
          if (data.rowNames) setRowNames(data.rowNames);
          if (data.rowPivots) setRowPivots(data.rowPivots);
          if (data.rowTypes) setRowTypes(data.rowTypes);
          setIsDirty(false);
          setHistory([]);
          setRedoStack([]);
        } catch (err) {
          console.error('Error loading project:', err);
        }
      };
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 1024 && !dismissedWarning) {
        setShowMobileWarning(true);
      } else {
        setShowMobileWarning(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [dismissedWarning]);

  const detectBackgroundColor = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    // Sample a grid of points to find the most common color
    const samples = 10;
    const colorCounts = new Map<string, { color: number[], count: number }>();
    
    for (let i = 0; i < samples; i++) {
      for (let j = 0; j < samples; j++) {
        // Sample points at 5%, 15%, 25%... 95% of width/height
        const x = Math.floor(img.width * (i + 0.5) / samples);
        const y = Math.floor(img.height * (j + 0.5) / samples);
        
        const data = ctx.getImageData(x, y, 1, 1).data;
        if (data[3] < 10) continue; // Skip transparent
        
        const key = `${data[0]},${data[1]},${data[2]},${data[3]}`;
        const existing = colorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          colorCounts.set(key, { color: [data[0], data[1], data[2], data[3]], count: 1 });
        }
      }
    }

    if (colorCounts.size === 0) {
      setBgColor([255, 255, 255, 0]); // Default to transparent if all sampled points are transparent
      return;
    }

    // Find the most frequent color
    let bestColor = [255, 255, 255, 255];
    let maxCount = -1;
    colorCounts.forEach(val => {
      if (val.count > maxCount) {
        maxCount = val.count;
        bestColor = val.color;
      }
    });

    setBgColor(bestColor);
  };

  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    // Use crossOrigin anonymous to avoid tainted canvas errors with external URLs
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImageElement(img);
      detectBackgroundColor(img);
      setImageError(null);
    };
    img.onerror = () => {
      console.error("Failed to load image from source. Source might be corrupt, too large, or an expired blob URL.");
      setImageError(language === 'pt' 
        ? "Falha ao carregar imagem. O link pode ter expirado ou o arquivo é muito grande (Tente reenviar)." 
        : "Failed to load image. The link might have expired or the file is too large (Try re-uploading).");
      
      if (imageSrc.startsWith('blob:')) {
        console.warn("Detected an expired blob URL in imageSrc. Clearing to allow recovery.");
        setImageSrc(null);
      }
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!imageElement) return;
    if (preventAutoSlicing) {
      setIsDetecting(false);
      setRects(prev => {
        if (prev.length === 0 && imageElement) {
          const defaultRect = { x: 0, y: 0, w: imageElement.width, h: imageElement.height };
          setCustomOrder([0]);
          return [defaultRect];
        }
        return prev;
      });
      return;
    }
    if (skipAutoDetection) {
      setSkipAutoDetection(false);
      setIsDetecting(false);
      return;
    }
    setIsDetecting(true);
    
    const timer = setTimeout(() => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageElement.width;
      tempCanvas.height = imageElement.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) {
        setIsDetecting(false);
        return;
      }
      ctx.drawImage(imageElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, imageElement.width, imageElement.height);
      
      const detected = detectSprites(imageData, bgColor, tolerance, mergeDist, minSize);
      
      // Try to preserve disabled indices if the count is similar
      setRects(prev => {
        if (prev.length === detected.length) {
          // Keep disabled indices as is
        } else {
          setDisabledIndices(new Set());
        }
        return detected;
      });

      setIsDetecting(false);
      setCurrentFrame(0);
      setSelectedRow('all');
      
      setCustomOrder(prev => {
        if (prev.length === detected.length) return prev;
        setFrameDurations({});
        return detected.map((_, i) => i);
      });
      
      if (detected.length === 1 && imageElement) {
        const r = detected[0];
        const area = r.w * r.h;
        const imgArea = imageElement.width * imageElement.height;
        if (area > imgArea * 0.8 && !activeHint) {
          setActiveHint('singleLargeSprite');
        }
      }

      if (detected.length > 200 && rects.length === 0) { // Only auto-show if it's the first detection and very large
        setShowCropModal(true);
      }
    }, 300); // Increased debounce for better performance

    return () => clearTimeout(timer);
  }, [imageElement, bgColor, tolerance, mergeDist, minSize, preventAutoSlicing]);

  const autoRows = useMemo(() => {
    if (rects.length === 0) return [];
    
    if (stitchedWindows.length > 0) {
      const winRows: Rect[][] = stitchedWindows.map(() => []);
      const sortedRects = [...rects].sort((a, b) => a.x - b.x);

      for (const rect of sortedRects) {
        const midY = rect.y + rect.h / 2;
        const winIndex = stitchedWindows.findIndex(w => midY >= w.yStart && midY <= w.yEnd);
        if (winIndex !== -1) {
          winRows[winIndex].push(rect);
        } else {
          if (winRows.length > 0) winRows[0].push(rect);
        }
      }
      return winRows.filter(r => r.length > 0);
    }

    // First, sort rects by Y to roughly order them top-to-bottom
    const sortedRects = [...rects].sort((a, b) => a.y - b.y);
    
    const grouped: Rect[][] = [];
    let currentRow: Rect[] = [sortedRects[0]];
    
    for (let i = 1; i < sortedRects.length; i++) {
      const r = sortedRects[i];
      const prev = currentRow[currentRow.length - 1];
      
      // If the vertical distance between their centers is less than 80% of their average height,
      // consider them part of the same row.
      const center1 = prev.y + prev.h / 2;
      const center2 = r.y + r.h / 2;
      const avgHeight = (prev.h + r.h) / 2;
      
      if (Math.abs(center1 - center2) < avgHeight * 0.8) {
        currentRow.push(r);
      } else {
        // Sort the completed row by X
        currentRow.sort((a, b) => a.x - b.x);
        grouped.push(currentRow);
        currentRow = [r];
      }
    }
    currentRow.sort((a, b) => a.x - b.x);
    grouped.push(currentRow);
    
    return grouped;
  }, [rects, stitchedWindows]);

  const rows = useMemo(() => {
    return [...autoRows, ...customRows];
  }, [autoRows, customRows]);

  const activeRects = useMemo(() => {
    if (selectedRow === 'all') return rects;
    return rows[selectedRow] || [];
  }, [rects, rows, selectedRow]);

  // When row changes, reset custom order to match the active rects
  useEffect(() => {
    setCustomOrder(activeRects.map(r => rects.indexOf(r)));
  }, [activeRects, rects]);

  // Set default keys, speeds, and hits when rows change
  useEffect(() => {
    if (rows.length === 0) return;
    
    // Default action layouts
    const defaultCombatKeys = ['z', 'x', 'c', 'v', 'a', 's', 'd', 'q', 'w'];
    
    setRowKeys(prev => {
      const next = { ...prev };
      rows.forEach((row, i) => {
        if (next[i] === undefined) {
          const type = rowTypes[i] || 'custom';
          if (type === 'idle') next[i] = 'none';
          else if (type === 'run') next[i] = 'd';
          else if (type === 'jump') next[i] = 'w';
          else if (type === 'attack') next[i] = 'z';
          else if (type === 'hurt') next[i] = 'h';
          else {
            next[i] = defaultCombatKeys[i % defaultCombatKeys.length] || 'z';
          }
        }
      });
      return next;
    });

    setRowSpeeds(prev => {
      const next = { ...prev };
      rows.forEach((row, i) => {
        if (next[i] === undefined) {
          next[i] = 1.0;
        }
      });
      return next;
    });

    setRowHits(prev => {
      const next = { ...prev };
      rows.forEach((row, i) => {
        if (next[i] === undefined) {
          next[i] = Math.max(0, Math.floor((row.length - 1) / 2));
        }
      });
      return next;
    });
  }, [rows, rowTypes]);

  // --- Sandbox Canvas Draw Effect ---
  useEffect(() => {
    if (!isCombatMode || rows.length === 0) return;
    const canvas = sandboxCanvasRef.current;
    if (!canvas || !imageElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let resolved = typeof sandboxActiveRow === 'number' ? sandboxActiveRow : -1;
    if (resolved === -1) {
      const idleIdx = rows.findIndex((row, idx) => rowTypes[idx] === 'idle');
      resolved = idleIdx !== -1 ? idleIdx : 0;
    }

    const rowRects = (rows[resolved] || []).filter(r => {
      const gIdx = rects.indexOf(r);
      const isGlobalDisabled = gIdx !== -1 && disabledIndices.has(gIdx);
      const isRowDisabled = gIdx !== -1 && rowDisabledFrames[resolved]?.has(gIdx);
      return !isGlobalDisabled && !isRowDisabled;
    });
    const rect = rowRects[sandboxFrame];
    if (!rect) return;

    canvas.width = rect.w;
    canvas.height = rect.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      imageElement,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );

    const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
    if (exportTransparent && !preventAutoSlicing) {
      removeBackground(imageData, bgColor, tolerance);
      ctx.putImageData(imageData, 0, 0);
    }
  }, [isCombatMode, rows, sandboxActiveRow, sandboxFrame, imageElement, exportTransparent, bgColor, tolerance, disabledIndices, rects, preventAutoSlicing]);

  // --- Mobile Sandbox Frame Draw Effect ---
  useEffect(() => {
    if (mobileEditModalRow === null || !imageElement) return;
    const canvas = mobileCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rowRects = rows[mobileEditModalRow] || [];
    const rect = rowRects[mobileEditSelectedFrame];
    if (!rect) return;

    canvas.width = rect.w;
    canvas.height = rect.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      imageElement,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );

    const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
    if (exportTransparent && !preventAutoSlicing) {
      removeBackground(imageData, bgColor, tolerance);
      ctx.putImageData(imageData, 0, 0);
    }
  }, [mobileEditModalRow, mobileEditSelectedFrame, rows, imageElement, exportTransparent, bgColor, tolerance, preventAutoSlicing]);

  // --- Moveset Preview Canvas Draw Effect ---
  useEffect(() => {
    if (!showCreateMovesetModal || !imageElement) return;
    const canvas = movesetCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rowRects = rows[movesetRowIndex] || [];
    const rect = rowRects[0]; // Draw first frame as preview
    if (!rect) {
      canvas.width = 1;
      canvas.height = 1;
      ctx.clearRect(0, 0, 1, 1);
      return;
    }

    canvas.width = rect.w;
    canvas.height = rect.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      imageElement,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );

    const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
    if (exportTransparent && !preventAutoSlicing) {
      removeBackground(imageData, bgColor, tolerance);
      ctx.putImageData(imageData, 0, 0);
    }
  }, [showCreateMovesetModal, movesetRowIndex, rows, imageElement, exportTransparent, bgColor, tolerance, preventAutoSlicing]);

  // --- Single Row Download Canvas Draw Effect ---
  useEffect(() => {
    if (!showDownloadRowModal || !imageElement) return;
    const canvas = downloadRowCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rowRects = rows[downloadRowIndex] || [];
    const rect = rowRects[0]; // Draw first frame as preview
    if (!rect) {
      canvas.width = 1;
      canvas.height = 1;
      ctx.clearRect(0, 0, 1, 1);
      return;
    }

    canvas.width = rect.w;
    canvas.height = rect.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      imageElement,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );

    const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
    if (exportTransparent && !preventAutoSlicing) {
      removeBackground(imageData, bgColor, tolerance);
      ctx.putImageData(imageData, 0, 0);
    }
  }, [showDownloadRowModal, downloadRowIndex, rows, imageElement, exportTransparent, bgColor, tolerance, preventAutoSlicing]);

  // Presets Auto-fill effect when preset type switches
  useEffect(() => {
    const rowLength = rows[movesetRowIndex]?.length || 1;
    const midFrame = Math.max(0, Math.floor((rowLength - 1) / 2));
    
    if (movesetType === 'idle') {
      setMovesetName('IDLE');
      setMovesetKey('NONE');
      setMovesetSpeed(1.0);
      setMovesetHitFrame(0);
    } else if (movesetType === 'attack') {
      setMovesetName('ATAQUE');
      setMovesetKey('SPACE');
      setMovesetSpeed(1.2);
      setMovesetHitFrame(midFrame);
    } else if (movesetType === 'run') {
      setMovesetName('CORRER');
      setMovesetKey('R');
      setMovesetSpeed(1.3);
      setMovesetHitFrame(0);
    } else if (movesetType === 'hurt') {
      setMovesetName('TOMAR DANO');
      setMovesetKey('NONE');
      setMovesetSpeed(1.0);
      setMovesetHitFrame(0);
    }
  }, [movesetType, movesetRowIndex, rows]);

  const playableRects = useMemo(() => {
    // Map the custom order back to rects, and filter out disabled ones
    return customOrder
      .filter(index => {
        const isGlobalDisabled = disabledIndices.has(index);
        const resolvedRow = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
        const isRowDisabled = resolvedRow !== -1 && rowDisabledFrames[resolvedRow]?.has(index);
        return !isGlobalDisabled && !isRowDisabled;
      })
      .map(index => rects[index])
      .filter(Boolean); // Ensure rect exists
  }, [customOrder, disabledIndices, rowDisabledFrames, selectedRow, rows.length, rects]);

  const animationFramesInfo = useMemo(() => {
    if (preventAutoSlicing && importedVideoFrameUrls.length > 0 && previewAllVideoFrames) {
      // In this mode, each frame is an individual full image URL from importedVideoFrameUrls
      return importedVideoFrameUrls.map((url, index) => {
        const w = videoFrameSize.width || (imageElement ? imageElement.width / rects.length : 100);
        const h = videoFrameSize.height || (imageElement ? imageElement.height : 100);
        return {
          url,
          index, // index in the sequence
          isFullImage: true,
          w,
          h,
          rect: undefined as Rect | undefined,
        };
      });
    } else {
      // Standard mode: uses playableRects which are regions of the current imageElement
      return playableRects.map((rect, idx) => {
        const activeIndices = customOrder.filter(index => {
          const isGlobalDisabled = disabledIndices.has(index);
          const resolvedRow = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
          const isRowDisabled = resolvedRow !== -1 && rowDisabledFrames[resolvedRow]?.has(index);
          return !isGlobalDisabled && !isRowDisabled;
        });
        const originalIndex = activeIndices[idx];
        return {
          url: '',
          index: originalIndex !== undefined ? originalIndex : idx,
          isFullImage: false,
          w: rect.w,
          h: rect.h,
          rect,
        };
      });
    }
  }, [preventAutoSlicing, importedVideoFrameUrls, previewAllVideoFrames, playableRects, videoFrameSize, imageElement, customOrder, disabledIndices, rowDisabledFrames, selectedRow, rows.length, rects.length]);

  useEffect(() => {
    setCurrentFrame(0);
  }, [selectedRow, rects, disabledIndices, rowDisabledFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = imageElement.width;
    canvas.height = imageElement.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, 0, 0);

    if (showMask) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        const isBg = (r: number, g: number, b: number, a: number) => {
          if (a < 10) return true;
          if (bgColor[3] < 10) return false;
          const dr = r - bgColor[0];
          const dg = g - bgColor[1];
          const db = b - bgColor[2];
          const da = a - bgColor[3];
          return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance;
        };

        if (isBg(r, g, b, a)) {
          data[i] = 255;
          data[i+1] = 0;
          data[i+2] = 255;
          data[i+3] = 100; // Semi-transparent magenta for background
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    ctx.lineWidth = 1;
    rects.forEach((r, i) => {
      const isActive = activeRects.includes(r);
      const isDisabled = disabledIndices.has(i);
      const isSelected = selectedRectIndex === i;
      const isSmall = r.w < 10 || r.h < 10; // Threshold for "small" rects
      
      if (isSelected) {
        ctx.strokeStyle = '#3b82f6'; // blue-500 for selection
        ctx.lineWidth = 2;
      } else if (!isActive) {
        ctx.strokeStyle = '#3f3f46';
        ctx.fillStyle = '#3f3f46';
        ctx.lineWidth = 1;
      } else if (isDisabled) {
        ctx.strokeStyle = '#ef4444'; // red-500
        ctx.fillStyle = '#ef4444';
        ctx.lineWidth = 1;
      } else if (isSmall) {
        ctx.strokeStyle = '#f59e0b'; // amber-500 for small rects
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#10b981'; // emerald-500
        ctx.fillStyle = '#10b981';
        ctx.lineWidth = 1;
      }
      
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      
      if (isSelected && (gridCols > 1 || gridRows > 1)) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        
        const subW = r.w / gridCols;
        const subH = r.h / gridRows;

        // Draw vertical lines
        for (let c = 1; c < gridCols; c++) {
          const lx = r.x + subW * c;
          ctx.beginPath();
          ctx.moveTo(lx, r.y);
          ctx.lineTo(lx, r.y + r.h);
          ctx.stroke();
        }
        // Draw horizontal lines
        for (let row = 1; row < gridRows; row++) {
          const ly = r.y + subH * row;
          ctx.beginPath();
          ctx.moveTo(r.x, ly);
          ctx.lineTo(r.x + r.w, ly);
          ctx.stroke();
        }

        // Draw size labels for each cell
        ctx.font = '8px monospace';
        ctx.fillStyle = '#3b82f6';
        const sizeText = `${Math.floor(subW)}x${Math.floor(subH)}`;
        for (let row = 0; row < gridRows; row++) {
          for (let c = 0; c < gridCols; c++) {
            const tx = r.x + c * subW + 2;
            const ty = r.y + row * subH + 10;
            ctx.fillText(sizeText, tx, ty);
          }
        }
      }

      ctx.font = '10px monospace';
      ctx.fillText(i.toString(), r.x, r.y > 10 ? r.y - 2 : r.y + 10);
    });

    if (manualSelectionRect) {
      ctx.strokeStyle = '#3b82f6'; // blue-500
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(manualSelectionRect.x, manualSelectionRect.y, manualSelectionRect.w, manualSelectionRect.h);
      ctx.setLineDash([]);
    }
  }, [imageElement, rects, activeRects, disabledIndices, manualSelectionRect]);

  useEffect(() => {
    if (!isPlaying || animationFramesInfo.length === 0) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const currentIdx = currentFrameRef.current % animationFramesInfo.length;
      const frameInfo = animationFramesInfo[currentIdx];
      const multiplier = frameInfo.isFullImage ? 1 : (frameDurations[frameInfo.index] || 1);
      
      // Use specific row speed if a row is selected
      const activeRowKey = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
      const speedMult = activeRowKey !== -1 ? (rowSpeeds[activeRowKey] || 1.0) : 1.0;
      const currentDuration = (animationSpeed * 1000 * multiplier) / speedMult;

      if (time - lastTime > currentDuration) {
        setCurrentFrame((prev) => (prev + 1) % animationFramesInfo.length);
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, animationFramesInfo, animationSpeed, frameDurations, rowSpeeds, selectedRow, rows.length]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || animationFramesInfo.length === 0) return;
    if (!preventAutoSlicing && !imageElement) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const currentIdx = currentFrame % animationFramesInfo.length;
    const frameInfo = animationFramesInfo[currentIdx];
    if (!frameInfo) return;

    canvas.width = frameInfo.w;
    canvas.height = frameInfo.h;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a frame with background removal
    const drawFrame = async (info: typeof animationFramesInfo[0], alpha: number = 1.0) => {
      if (!info) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = info.w;
      tempCanvas.height = info.h;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      if (info.isFullImage && info.url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = info.url;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        tempCtx.drawImage(img, 0, 0, info.w, info.h);
      } else if (info.rect && imageElement) {
        tempCtx.drawImage(
          imageElement,
          info.rect.x, info.rect.y, info.rect.w, info.rect.h,
          0, 0, info.rect.w, info.rect.h
        );
      }

      const imageData = tempCtx.getImageData(0, 0, info.w, info.h);
      if (!preventAutoSlicing) {
        removeBackground(imageData, bgColor, tolerance);
      }
      tempCtx.putImageData(imageData, 0, 0);

      if (exportOutline) {
        const outC = addOutlineToCanvas(tempCanvas, exportOutlineColor);
        tempCtx.clearRect(0,0, info.w, info.h);
        tempCtx.drawImage(outC, Math.floor((info.w - outC.width)/2), Math.floor((info.h - outC.height)/2));
      }

      ctx.globalAlpha = alpha;
      
      // Determine pixel art settings for the current preview
      const activeRowKey = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
      const pixelateEnabled = rowPixelateEnabled[activeRowKey as any];
      const pixelateSize = rowPixelateSize[activeRowKey as any] || 4;

      if (pixelateEnabled && pixelateSize > 1) {
        const pixelCanvas = document.createElement('canvas');
        const pW = Math.max(1, Math.floor(info.w / pixelateSize));
        const pH = Math.max(1, Math.floor(info.h / pixelateSize));
        pixelCanvas.width = pW;
        pixelCanvas.height = pH;
        const pCtx = pixelCanvas.getContext('2d');
        if (pCtx) {
          pCtx.imageSmoothingEnabled = false;
          pCtx.drawImage(tempCanvas, 0, 0, pW, pH);
          
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(pixelCanvas, 0, 0, pW, pH, 0, 0, frameInfo.w, frameInfo.h);
        }
      } else {
        ctx.drawImage(tempCanvas, 0, 0, frameInfo.w, frameInfo.h);
      }
      
      ctx.globalAlpha = 1.0;
    };

    const runDraw = async () => {
      // Onion Skin: Draw previous frame semi-transparently
      if (onionSkin && animationFramesInfo.length > 1) {
        const prevFrameIdx = (currentIdx - 1 + animationFramesInfo.length) % animationFramesInfo.length;
        const prevInfo = animationFramesInfo[prevFrameIdx];
        if (prevInfo) {
          await drawFrame(prevInfo, 0.3);
        }
      }

      // Draw current frame
      await drawFrame(frameInfo, 1.0);
    };

    runDraw();
  }, [currentFrame, imageElement, animationFramesInfo, bgColor, tolerance, onionSkin, preventAutoSlicing, exportOutline, exportOutlineColor]);

  // --- Combat Sandbox Loop ---
  const triggerCombatHit = useCallback((rowIndex: number, actionName: string) => {
    const isAttack = rowTypes[rowIndex] === 'attack' || 
                     actionName.toLowerCase().includes('attack') || 
                     actionName.toLowerCase().includes('soco') || 
                     actionName.toLowerCase().includes('chute') || 
                     actionName.toLowerCase().includes('punch') || 
                     actionName.toLowerCase().includes('kick');
    if (!isAttack) return;

    // Trigger hit visual effect
    const hitFx = ['POW!', '💥 BOOM!', '✨ HIT!', '👊 BASH!', '⚡ CRITICAL!'][Math.floor(Math.random() * 5)];
    setShowVfx(hitFx);
    setIsDummyHurt(true);
    
    // Play sound thud via Web Audio API
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(120, audioCtx.currentTime); // Low frequency bass kick
      oscillator.frequency.exponentialRampToValueAtTime(280, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      // Blocker or not supported
    }

    const damage = Math.floor(Math.random() * 8) + 14; // 14 to 21 HP
    setDummyHp(prev => {
      const next = Math.max(0, prev - damage);
      if (next === 0) {
        setArenaLogs(l => [`🏆 [ARENA] Boneco de Treino foi nocauteado! Auto-regenerando em 2s...`, ...l.slice(0, 15)]);
        setTimeout(() => {
          setDummyHp(100);
          setArenaLogs(l => [`🔄 [ARENA] Boneco de Treino foi recuperado para combate.`, ...l.slice(0, 15)]);
        }, 2000);
      }
      return next;
    });

    setArenaLogs(prev => [
      `⚔️ [COMBATE] ${characterName || 'Herói'} usou "${actionName}" e causou -${damage} HP de dano!`,
      ...prev.slice(0, 15)
    ]);

    setTimeout(() => {
      setIsDummyHurt(false);
      setShowVfx(null);
    }, 400);
  }, [rowTypes, characterName, rowNames]);

  // Handle keyboard inputs for triggering moves while in sandbox mode
  useEffect(() => {
    if (!isCombatMode || rows.length === 0) return;

    const handleKeyDownCombat = (e: KeyboardEvent) => {
      // Don't trigger triggers if the user is typing in forms!
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key.toLowerCase();
      
      // Esc exits sandbox mode safely
      if (e.key === 'Escape') {
        setIsCombatMode(false);
        return;
      }

      // Check for arrow triggers to toggle idle vs running state!
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        // Find run row
        const runIdx = rows.findIndex((_, index) => rowTypes[index] === 'run');
        if (runIdx !== -1 && sandboxActiveRow !== runIdx) {
          setSandboxActiveRow(runIdx);
          setSandboxFrame(0);
        }
        return;
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        // Find run or idle
        const runIdx = rows.findIndex((_, index) => rowTypes[index] === 'run');
        if (runIdx !== -1 && sandboxActiveRow !== runIdx) {
          setSandboxActiveRow(runIdx);
          setSandboxFrame(0);
        }
        return;
      }

      // Check each custom button/key mapped!
      for (let i = 0; i < rows.length; i++) {
        const mappedKey = (rowKeys[i] || '').toLowerCase();
        if (mappedKey !== 'none' && mappedKey === key) {
          e.preventDefault();
          setSandboxActiveRow(i);
          setSandboxFrame(0);
          
          setArenaLogs(l => [`👊 [TECLADO] Trigger: Iniciando "${getActionName(i)}"`, ...l.slice(0, 15)]);
          return;
        }
      }
    };

    const handleKeyUpCombat = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      // When letting go of movement keys, return to Idle row!
      if (['arrowright', 'arrowleft', 'd', 'a', 'arrowdown', 's'].includes(e.key.toLowerCase())) {
        const type = typeof sandboxActiveRow === 'number' ? rowTypes[sandboxActiveRow] : '';
        if (type === 'run') {
          setSandboxActiveRow('none');
          setSandboxFrame(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDownCombat);
    window.addEventListener('keyup', handleKeyUpCombat);
    return () => {
      window.removeEventListener('keydown', handleKeyDownCombat);
      window.removeEventListener('keyup', handleKeyUpCombat);
    };
  }, [isCombatMode, rows, rowKeys, rowTypes, rowNames, sandboxActiveRow]);

  // Animation frame loop for sandbox rendering
  useEffect(() => {
    if (!isCombatMode || rows.length === 0) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      let resolved = typeof sandboxActiveRow === 'number' ? sandboxActiveRow : -1;
      if (resolved === -1) {
        const idleIdx = rows.findIndex((row, idx) => rowTypes[idx] === 'idle');
        resolved = idleIdx !== -1 ? idleIdx : 0;
      }

      const rowRects = (rows[resolved] || []).filter(r => {
        const gIdx = rects.indexOf(r);
        const isGlobalDisabled = gIdx !== -1 && disabledIndices.has(gIdx);
        const isRowDisabled = gIdx !== -1 && rowDisabledFrames[resolved]?.has(gIdx);
        return !isGlobalDisabled && !isRowDisabled;
      });
      if (rowRects.length === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const speedMult = rowSpeeds[resolved] || 1.0;
      const currentDuration = (animationSpeed * 1000) / speedMult;

      if (time - lastTime > currentDuration) {
        setSandboxFrame((prevFrame) => {
          const next = prevFrame + 1;
          const loopPoint = rowLoopPoints[resolved];
          
          if (next >= rowRects.length) {
            const type = rowTypes[resolved] || 'custom';
            
            // Loop adjustment for ignition point (Intro -> Sustain Loop)
            if (loopPoint !== null && loopPoint !== undefined) {
              const startOfLoop = Math.min(loopPoint + 1, rowRects.length - 1);
              return startOfLoop;
            }

            // Finish non-looping action
            if (sandboxActiveRow !== 'none' && !['idle', 'run'].includes(type)) {
              if (isPlayingNonLooping) {
                setIsPlayingNonLooping(false);
              }
              setSandboxActiveRow('none');
              return 0;
            }
            return 0;
          }

          // Ignition Loop Logic: If we hit or pass the loop point and we are NOT in trigger mode
          if (loopPoint !== null && loopPoint !== undefined && next >= loopPoint && !isPlayingNonLooping) {
             return 0; // Reset loop to beginning (1,2,3 -> 1,2,3)
          }

          // Hit frame triggers damage & audio
          const hitFrame = rowHits[resolved] !== undefined ? rowHits[resolved] : Math.floor((rowRects.length - 1) / 2);
          if (next === hitFrame && sandboxActiveRow !== 'none') {
            const actionName = getActionName(resolved);
            triggerCombatHit(resolved, actionName);
          }

          return next;
        });
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(render);
    };

    if (sandboxIsPlaying) {
      animationFrameId = requestAnimationFrame(render);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isCombatMode, rows, sandboxActiveRow, sandboxIsPlaying, rowSpeeds, rowHits, rowTypes, animationSpeed, triggerCombatHit, rowNames, disabledIndices, rects]);

  // Dummy auto-attack simulator
  useEffect(() => {
    if (!isCombatMode || !dummyAutoAttack || dummyHp <= 0) return;

    const interval = setInterval(() => {
      setIsPlayerHurt(true);
      setPlayerHp(prev => {
        const next = Math.max(0, prev - (Math.floor(Math.random() * 8) + 6));
        if (next === 0) {
          setArenaLogs(l => [`💀 [ARENA] Você foi derrotado pelo Boneco de Treino! Recuperando vida...`, ...l.slice(0, 15)]);
          setTimeout(() => setPlayerHp(100), 2000);
        }
        return next;
      });
      setArenaLogs(l => [`💥 [ARENA] O Boneco de Treino desferiu um contra-ataque!`, ...l.slice(0, 15)]);
      
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(320, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.12);
        gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
      } catch (e) {}

      setTimeout(() => {
        setIsPlayerHurt(false);
      }, 300);
    }, 3200);

    return () => clearInterval(interval);
  }, [isCombatMode, dummyAutoAttack, dummyHp]);

  // --- Zoom and Pan Handlers ---
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!imageElement) return;
    e.preventDefault();
    
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.1, scale * (1 + scaleAmount)), 10);
    
    // Calculate mouse position relative to the container
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Adjust pan to zoom towards mouse cursor
    const scaleRatio = newScale / scale;
    const newPanX = mouseX - (mouseX - pan.x) * scaleRatio;
    const newPanY = mouseY - (mouseY - pan.y) * scaleRatio;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan, imageElement]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanMode || e.button === 1 || e.button === 2) { // Middle click, right click, or pan mode active
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPanMode && e.touches.length === 1) {
      setIsPanning(true);
      const touch = e.touches[0];
      setStartPan({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y
    });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - startPan.x,
      y: touch.clientY - startPan.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanMode) return;
    
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = Math.floor((clientX - rect.left) / scale);
    const y = Math.floor((clientY - rect.top) / scale);
    
    if (x < 0 || y < 0 || x >= imageElement.width || y >= imageElement.height) return;

    if (isMagicWandMode) {
      executeMagicWand(x, y);
      setIsMagicWandMode(false);
      return;
    }

    if (isPickingColor) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageElement.width;
      tempCanvas.height = imageElement.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageElement, 0, 0);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        setBgColor([pixel[0], pixel[1], pixel[2], pixel[3]]);
      }
      setIsPickingColor(false);
      return;
    }

    // If not picking color and not manual selecting, maybe toggle a rect?
    const clickedRectIndex = rects.findIndex(r => 
      x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    );
    
    if (clickedRectIndex !== -1) {
      setSelectedRectIndex(clickedRectIndex);
      setGridCols(1);
      setGridRows(1);
      
      const globalIndex = clickedRectIndex;
      const isDisabled = disabledIndices.has(globalIndex);
      pushToHistory();
      const next = new Set(disabledIndices);
      if (isDisabled) next.delete(globalIndex);
      else next.add(globalIndex);
      setDisabledIndices(next);
    } else {
      setSelectedRectIndex(null);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isManualSelecting || isPanMode || isPickingColor || !imageElement) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = Math.max(0, Math.min(imageElement.width, Math.floor((clientX - rect.left) / scale)));
    const y = Math.max(0, Math.min(imageElement.height, Math.floor((clientY - rect.top) / scale)));
    
    setManualSelectionRect({ x, y, w: 0, h: 0 });
    setIsDrawingNewCrop(true); // Reuse this state for manual selection too
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isManualSelecting || !manualSelectionRect || !imageElement) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = Math.max(0, Math.min(imageElement.width, Math.floor((clientX - rect.left) / scale)));
    const y = Math.max(0, Math.min(imageElement.height, Math.floor((clientY - rect.top) / scale)));
    
    setManualSelectionRect({
      ...manualSelectionRect,
      w: x - manualSelectionRect.x,
      h: y - manualSelectionRect.y
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDrawingNewCrop(false);
    if (manualSelectionRect) {
      const finalRect = {
        x: manualSelectionRect.w < 0 ? manualSelectionRect.x + manualSelectionRect.w : manualSelectionRect.x,
        y: manualSelectionRect.h < 0 ? manualSelectionRect.y + manualSelectionRect.h : manualSelectionRect.y,
        w: Math.abs(manualSelectionRect.w),
        h: Math.abs(manualSelectionRect.h)
      };
      
      if (finalRect.w > 2 && finalRect.h > 2) {
        pushToHistory();
        
        setRects(prevRects => {
          const newRects = [];
          
          prevRects.forEach((r, i) => {
            const intersects = (
              r.x < finalRect.x + finalRect.w &&
              r.x + r.w > finalRect.x &&
              r.y < finalRect.y + finalRect.h &&
              r.y + r.h > finalRect.y
            );
            if (!intersects) {
              newRects.push(r);
            }
          });
          
          newRects.push(finalRect);
          
          setCustomOrder(newRects.map((_, i) => i));
          setDisabledIndices(new Set());
          
          return newRects;
        });
      }
      setManualSelectionRect(null);
    }
  };

  // --- Drag and Drop Handlers ---
  const handleGridSplit = () => {
    if (selectedRectIndex === null || !rects[selectedRectIndex]) return;
    pushToHistory();
    const baseRect = rects[selectedRectIndex];
    const newSubRects: Rect[] = [];
    
    const subW = baseRect.w / gridCols;
    const subH = baseRect.h / gridRows;
    
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        newSubRects.push({
          x: Math.floor(baseRect.x + c * subW),
          y: Math.floor(baseRect.y + r * subH),
          w: Math.floor(subW),
          h: Math.floor(subH)
        });
      }
    }
    
    setRects(prev => {
      const next = [...prev];
      next.splice(selectedRectIndex, 1, ...newSubRects);
      return next;
    });
    
    setSelectedRectIndex(null);
    setGridCols(1);
    setGridRows(1);
  };

  const executeMagicWand = (startX: number, startY: number) => {
      if (!imageElement) return;

      pushToHistory();
      setIsDetecting(true);

      setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = imageElement.width;
          canvas.height = imageElement.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
              setIsDetecting(false);
              return;
          }

          ctx.drawImage(imageElement, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          const targetIdx = (startY * canvas.width + startX) * 4;
          const targetR = data[targetIdx];
          const targetG = data[targetIdx + 1];
          const targetB = data[targetIdx + 2];
          const targetA = data[targetIdx + 3];

          // If clicking on transparent, ignore
          if (targetA < 10) {
              setIsDetecting(false);
              return;
          }

          // Flood fill algorithms (BFS)
          const visited = new Uint8Array(canvas.width * canvas.height);
          const queue = [startY * canvas.width + startX];
          visited[startY * canvas.width + startX] = 1;

          while (queue.length > 0) {
              const currentPos = queue.shift()!;
              const cx = currentPos % canvas.width;
              const cy = Math.floor(currentPos / canvas.width);
              
              // Erase pixel
              const pIdx = (cy * canvas.width + cx) * 4;
              data[pIdx + 3] = 0; // Set Alpha to 0

              // Check neighbors
              const neighbors = [
                  [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
              ];

              for (const [nx, ny] of neighbors) {
                  if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                      const nIdxPos = ny * canvas.width + nx;
                      if (!visited[nIdxPos]) {
                          const nIdx = nIdxPos * 4;
                          const r = data[nIdx];
                          const g = data[nIdx + 1];
                          const b = data[nIdx + 2];
                          const a = data[nIdx + 3];

                          if (a > 10) {
                              const dr = r - targetR;
                              const dg = g - targetG;
                              const db = b - targetB;
                              const da = a - targetA;
                              // Use tolerance to match connected regions
                              if (Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance) {
                                  visited[nIdxPos] = 1;
                                  queue.push(nIdxPos);
                              }
                          }
                      }
                  }
              }
          }

          ctx.putImageData(imageData, 0, 0);
          
          // Update the main image src with the erased background
          const newImgSrc = canvas.toDataURL('image/png');
          setImageSrc(newImgSrc);
          
          // You also need to update imageElement to have the new source so further slicing uses it
          const newImg = new Image();
          newImg.onload = () => {
              setImageElement(newImg);
              setIsDetecting(false);
          };
          newImg.src = newImgSrc;
      }, 50);
  };

  const handleSmartSplit = () => {
    if (selectedRectIndex === null || !imageElement || !rects[selectedRectIndex]) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(imageElement, 0, 0);
    const baseRect = rects[selectedRectIndex];
    const imageData = ctx.getImageData(baseRect.x, baseRect.y, baseRect.w, baseRect.h);
    
    // Use detectSprites with mergeDist = 0 to perfectly isolate non-touching sprites
    // This handles sprites that overlap horizontally/vertically but don't touch
    const newSubRects = detectSprites(imageData, bgColor, tolerance, 0, minSize);
    
    if (newSubRects.length > 0) {
      pushToHistory();
      const adjustedRects = newSubRects.map(r => ({
        ...r,
        x: r.x + baseRect.x,
        y: r.y + baseRect.y
      }));
      setRects(prev => {
        const next = [...prev];
        next.splice(selectedRectIndex, 1, ...adjustedRects);
        return next;
      });
      setSelectedRectIndex(null);
    }
  };

  const extractPalette = () => {
    if (!imageElement) return;
    
    setIsDetecting(true);
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = imageElement.width;
      canvas.height = imageElement.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsDetecting(false);
        return;
      }
      
      ctx.drawImage(imageElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const colorSet = new Set<string>();
      
      // Sample colors to build palette
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        // Skip transparent pixels
        if (a < 10) continue;
        
        // Skip background color if it matches exactly (or close enough)
        const dr = r - bgColor[0];
        const dg = g - bgColor[1];
        const db = b - bgColor[2];
        const da = a - bgColor[3];
        if (Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance) {
          continue;
        }

        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        colorSet.add(hex);
      }
      
      // Limit to max 64 colors to prevent UI lag and huge sets for messy images
      const colors = Array.from(colorSet).slice(0, 64);
      setPalette(colors);
      setShowPalette(true);
      setIsDetecting(false);
    }, 50);
  };

  const downloadPaletteTxt = () => {
    const blob = new Blob([palette.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName || 'sprite'}_palette.hex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPaletteImage = () => {
    // Generate a small PNG with color swatches
    const tileSize = 32;
    const cols = 8;
    const rows = Math.ceil(palette.length / cols);

    const canvas = document.createElement('canvas');
    canvas.width = cols * tileSize;
    canvas.height = rows * tileSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background with transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    palette.forEach((color, i) => {
        const x = (i % cols) * tileSize;
        const y = Math.floor(i / cols) * tileSize;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, tileSize, tileSize);
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName || 'sprite'}_palette.png`;
    a.click();
  };

  const handleVfxSplit = () => {
    if (selectedRectIndex === null || !imageElement || !rects[selectedRectIndex]) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(imageElement, 0, 0);
    const baseRect = rects[selectedRectIndex];
    const imageData = ctx.getImageData(baseRect.x, baseRect.y, baseRect.w, baseRect.h);
    
    // Use detectSprites with a tiny mergeDist (2px) to keep sparks of a single effect together
    // but separate different effects
    const newSubRects = detectSprites(imageData, bgColor, tolerance, 2, 1);
    
    if (newSubRects.length > 0) {
      pushToHistory();
      const adjustedRects = newSubRects.map(r => ({
        ...r,
        x: r.x + baseRect.x,
        y: r.y + baseRect.y
      }));
      setRects(prev => {
        const next = [...prev];
        next.splice(selectedRectIndex, 1, ...adjustedRects);
        return next;
      });
      setSelectedRectIndex(null);
    }
  };

  const handleRefineSelection = () => {
    if (selectedRectIndex === null || !imageElement || !rects[selectedRectIndex]) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(imageElement, 0, 0);
    const baseRect = rects[selectedRectIndex];
    const imageData = ctx.getImageData(baseRect.x, baseRect.y, baseRect.w, baseRect.h);
    
    const newSubRects = detectSprites(imageData, bgColor, tolerance, mergeDist, minSize);
    
    if (newSubRects.length > 0) {
      pushToHistory();
      // Adjust sub-rects coordinates to be relative to the entire image
      const adjustedRects = newSubRects.map(r => ({
        ...r,
        x: r.x + baseRect.x,
        y: r.y + baseRect.y
      }));
      
      setRects(prev => {
        const next = [...prev];
        next.splice(selectedRectIndex, 1, ...adjustedRects);
        return next;
      });
      setSelectedRectIndex(null);
    }
  };

  const handleAutoCrop = () => {
    if (!imageElement || rects.length === 0) return;
    pushToHistory();
    
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imageElement, 0, 0);
    
    const newRects = rects.map(rect => {
      const imageData = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
      const data = imageData.data;
      
      let minX = rect.w, minY = rect.h, maxX = 0, maxY = 0;
      let found = false;
      
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const idx = (y * rect.w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          
          const diff = Math.max(
            Math.abs(r - bgColor[0]),
            Math.abs(g - bgColor[1]),
            Math.abs(b - bgColor[2])
          );
          
          if (a > 0 && diff > tolerance) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
      }
      
      if (!found) return rect;
      
      return {
        x: rect.x + minX,
        y: rect.y + minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1
      };
    });
    
    setRects(newRects);
  };

  const handleSelectAll = () => {
    pushToHistory();
    setDisabledIndices(new Set());
  };

  const handleDeselectAll = () => {
    pushToHistory();
    const all = new Set<number>();
    rects.forEach((_, i) => all.add(i));
    setDisabledIndices(all);
  };

  const handleInvertSelection = () => {
    pushToHistory();
    const next = new Set<number>();
    rects.forEach((_, i) => {
      if (!disabledIndices.has(i)) {
        next.add(i);
      }
    });
    setDisabledIndices(next);
  };

  const handleExportSpritesheet = async () => {
    if (!imageElement || rects.length === 0) return;
    
    setIsExportingGif(true); // Using the same loader state to show progress
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      // Respect selected row and custom order
      const enabledRects = customOrder
        .filter(idx => !disabledIndices.has(idx))
        .map(idx => rects[idx]);
        
      if (enabledRects.length === 0) {
        setIsExportingGif(false);
        return;
      }
      
      // Simple packing: grid based on square root
      const count = enabledRects.length;
      const cols = Math.ceil(Math.sqrt(count));
      const calculatedRows = Math.ceil(count / cols);
      
      let maxW = 0;
      let maxH = 0;
      enabledRects.forEach(r => {
        if (r.w > maxW) maxW = r.w;
        if (r.h > maxH) maxH = r.h;
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = cols * maxW;
      canvas.height = calculatedRows * maxH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");
      
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = imageElement.width;
      sourceCanvas.height = imageElement.height;
      const sCtx = sourceCanvas.getContext('2d');
      if (!sCtx) throw new Error("Could not get source canvas context");
      sCtx.drawImage(imageElement, 0, 0);
      
      // We will build a new JSON specifically for this Atlas
      let rowIndex: number | 'all' = selectedRow;
      if (selectedRow !== 'all' && rows.length === 1) {
        rowIndex = 0;
      }
      const pvtY = typeof rowIndex === 'number' ? (rowPivots[rowIndex] || 'center') : 'center';
      const rawType = typeof rowIndex === 'number' ? (rowTypes[rowIndex] || 'custom') : 'custom';
      
      let type = rawType;
      if (rawType === 'effect') type = 'vfx';
      
      const atlasFrames = [];
      
      enabledRects.forEach((rect, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        const destX = col * maxW;
        const destY = row * maxH;
        
        const imageData = sCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
        // Remove background if needed
        if (!preventAutoSlicing) {
          removeBackground(imageData, bgColor, tolerance);
        }
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rect.w;
        tempCanvas.height = rect.h;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
          tCtx.putImageData(imageData, 0, 0);

          // Apply Pixel Art to Atlas frames
          const activeRowKey = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
          const pEnabled = rowPixelateEnabled[activeRowKey as any];
          const pSize = rowPixelateSize[activeRowKey as any] || 4;

          if (pEnabled && pSize > 1) {
            const pCanvas = document.createElement('canvas');
            const pW = Math.max(1, Math.floor(rect.w / pSize));
            const pH = Math.max(1, Math.floor(rect.h / pSize));
            pCanvas.width = pW;
            pCanvas.height = pH;
            const pCtx = pCanvas.getContext('2d');
            if (pCtx) {
              pCtx.imageSmoothingEnabled = false;
              pCtx.drawImage(tempCanvas, 0, 0, pW, pH);
              tCtx.clearRect(0, 0, rect.w, rect.h);
              tCtx.imageSmoothingEnabled = false;
              tCtx.drawImage(pCanvas, 0, 0, pW, pH, 0, 0, rect.w, rect.h);
            }
          }
        }
        
        ctx.drawImage(tempCanvas, destX, destY);
        
        // Push the new metadata based on the Atlas coordinates
        atlasFrames.push({
          x: destX,
          y: destY,
          w: rect.w,
          h: rect.h,
          pivotX: Math.floor(rect.w / 2),
          pivotY: pvtY === 'bottom' ? rect.h : Math.floor(rect.h / 2),
          duration: frameDurations[i] || animationSpeed
        });
      });
      
      const atlasJson = {
        character: animationName || 'Sprite Slicer Export',
        name: `${animationName}_atlas`,
        type: type,
        speed: animationSpeed,
        pivotRule: pvtY,
        frames: atlasFrames
      };
      
      const zip = new JSZip();
      
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      
      if (blob) {
        zip.file(`${animationName || 'sprite'}_atlas.png`, blob);
        zip.file(`${animationName || 'sprite'}_atlas.json`, JSON.stringify(atlasJson, null, 2));
        
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${animationName || 'sprite'}_atlas.zip`);
      }
    } catch (err) {
      console.error("Error generating Atlas ZIP:", err);
      alert("Failed to generate Atlas ZIP.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleExportOptimizedAtlas = async () => {
    if (!imageElement || rects.length === 0) return;
    
    setIsExportingGif(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const enabledRects = customOrder
        .filter(idx => !disabledIndices.has(idx))
        .map(idx => ({ ...rects[idx], globalIndex: idx }));
        
      if (enabledRects.length === 0) {
        setIsExportingGif(false);
        return;
      }
      
      // Shelf Packing Algorithm for Tight Atlas
      const sorted = [...enabledRects].sort((a,b) => b.h - a.h);
      let currentX = 0;
      let currentY = 0;
      let rowHeight = 0;
      const totalArea = enabledRects.reduce((sum, r) => sum + r.w * r.h, 0);
      const startWidth = Math.ceil(Math.sqrt(totalArea)) * 1.5;
      
      const packed: any[] = [];
      
      for(let r of sorted) {
        if (currentX + r.w > startWidth && currentX > 0) {
            currentX = 0;
            currentY += rowHeight + 1; // 1px padding
            rowHeight = 0;
        }
        packed.push({ ...r, px: currentX, py: currentY });
        currentX += r.w + 1;
        rowHeight = Math.max(rowHeight, r.h);
      }
      
      const finalWidth = Math.max(...packed.map(r => r.px + r.w));
      const finalHeight = currentY + rowHeight;
      
      const canvas = document.createElement('canvas');
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");
      
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = imageElement.width;
      sourceCanvas.height = imageElement.height;
      const sCtx = sourceCanvas.getContext('2d');
      if (!sCtx) throw new Error("Could not get source canvas context");
      sCtx.drawImage(imageElement, 0, 0);
      
      const atlasFrames = [];
      
      for (const pr of packed) {
        const destX = pr.px;
        const destY = pr.py;
        
        const imageData = sCtx.getImageData(pr.x, pr.y, pr.w, pr.h);
        if (!preventAutoSlicing && exportTransparent) {
          removeBackground(imageData, bgColor, tolerance);
        }
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pr.w;
        tempCanvas.height = pr.h;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
          tCtx.putImageData(imageData, 0, 0);
          
          const activeRowKey = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
          const pEnabled = rowPixelateEnabled[activeRowKey as any];
          const pSize = rowPixelateSize[activeRowKey as any] || 4;

          if (pEnabled && pSize > 1) {
            const pCanvas = document.createElement('canvas');
            const pW = Math.max(1, Math.floor(pr.w / pSize));
            const pH = Math.max(1, Math.floor(pr.h / pSize));
            pCanvas.width = pW;
            pCanvas.height = pH;
            const pCtx = pCanvas.getContext('2d');
            if (pCtx) {
              pCtx.imageSmoothingEnabled = false;
              pCtx.drawImage(tempCanvas, 0, 0, pW, pH);
              tCtx.clearRect(0, 0, pr.w, pr.h);
              tCtx.imageSmoothingEnabled = false;
              tCtx.drawImage(pCanvas, 0, 0, pW, pH, 0, 0, pr.w, pr.h);
            }
          }
        }
        
        ctx.drawImage(tempCanvas, destX, destY);
        
        const boxes = frameBoxes[pr.globalIndex] || [];
        
        atlasFrames.push({
          originalIndex: customOrder.indexOf(pr.globalIndex),
          x: destX,
          y: destY,
          w: pr.w,
          h: pr.h,
          hitboxes: boxes.filter(b => b.type === 'hitbox').map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
          hurtboxes: boxes.filter(b => b.type === 'hurtbox').map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }))
        });
      }
      
      const atlasJson = {
        character: animationName || 'Sprite Slicer Export',
        name: `${animationName}_compact_atlas`,
        frames: atlasFrames.sort((a,b) => a.originalIndex - b.originalIndex)
      };
      
      const zip = new JSZip();
      
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      
      if (blob) {
        zip.file(`${animationName || 'sprite'}_packed_atlas.png`, blob);
        zip.file(`${animationName || 'sprite'}_packed_atlas.json`, JSON.stringify(atlasJson, null, 2));
        
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${animationName || 'sprite'}_texture_packer.zip`);
      }
    } catch (err) {
      console.error("Error generating Packed Atlas ZIP:", err);
      alert("Failed to generate Compact Atlas ZIP.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleExportMetadata = () => {
    const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${animationName}_metadata.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveDisabled = () => {
    if (disabledIndices.size === 0) return;
    pushToHistory();
    const newRects = rects.filter((_, i) => !disabledIndices.has(i));
    setRects(newRects);
    setDisabledIndices(new Set());
    setCustomOrder(newRects.map((_, i) => i));
    setSelectedRectIndex(null);
    
    const newFrameDurations: Record<number, number> = {};
    let newIndex = 0;
    for (let i = 0; i < rects.length; i++) {
      if (!disabledIndices.has(i)) {
        if (frameDurations[i]) {
          newFrameDurations[newIndex] = frameDurations[i];
        }
        newIndex++;
      }
    }
    setFrameDurations(newFrameDurations);
  };

  const handleClearAll = () => {
    if (rects.length === 0) return;
    setShowClearConfirm(true);
  };

  const executeClearAll = () => {
    pushToHistory();
    setRects([]);
    setCustomOrder([]);
    setDisabledIndices(new Set());
    setFrameDurations({});
    setSelectedRectIndex(null);
    setImageSrc(null);
    setImageElement(null);
    setAnimationName('');
    setHistory([]);
    setRedoStack([]);
    setShowClearConfirm(false);
    localforage.removeItem('spriteSlicerAutoSave');
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5, // Require 5px movement before dragging starts (allows clicking to toggle)
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Require 250ms hold before dragging starts on touch devices
        tolerance: 5, // Allow up to 5px movement during the delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      pushToHistory();
      setCustomOrder((items) => {
        const oldIndex = items.indexOf(Number(active.id));
        const newIndex = items.indexOf(Number(over.id));
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const jsonOutput = useMemo(() => {
    // Filter indices to ensure they exist in rects (handles stale customOrder)
    const activeIndices = customOrder.filter(idx => {
      const isGlobalDisabled = disabledIndices.has(idx);
      const resolvedRow = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
      const isRowDisabled = resolvedRow !== -1 && rowDisabledFrames[resolvedRow]?.has(idx);
      return !isGlobalDisabled && !isRowDisabled && rects[idx];
    });

    const getRowInfo = (rIndex: number | 'all') => {
      // Determine the name
      let rawName = rIndex === 'all' ? ((rowNames as any)['all'] || '') : (rowNames[rIndex as number] || '');
      const defaultName = rIndex === 'all' ? animationName : (rows.length === 1 ? animationName : `${animationName}_row${Number(rIndex) + 1}`);
      const name = rawName || defaultName;
      
      // Determine the type
      let rawType = rIndex === 'all' ? ((rowTypes as any)['all'] || 'custom') : (rowTypes[rIndex as number] || 'custom');
      let type = rawType;
      if (rawType === 'run') type = 'running';
      if (rawType === 'jump') type = 'jumping';
      if (rawType === 'roll') type = 'spindash';
      if (rawType === 'effect') type = 'vfx';
      
      // Determine the pivot rule
      let pivotType = rIndex === 'all' ? ((rowPivots as any)['all'] || 'center') : (rowPivots[rIndex as number] || 'center');
      const pivotRule = pivotType === 'bottom' ? 'base' : 'center';

      // Filter indices for the selected row
      let rowIndices = activeIndices;
      if (rIndex !== 'all') {
        rowIndices = activeIndices.filter(idx => rows[rIndex as number] && rows[rIndex as number].includes(rects[idx]));
      }

      const speedMult = rIndex === 'all' ? 1.0 : (rowSpeeds[rIndex as number] || 1.0);

      return {
        name,
        type,
        speed: animationSpeed,
        speedMultiplier: speedMult,
        pivotRule,
        frames: rowIndices.map(idx => {
          const r = rects[idx];
          const multiplier = frameDurations[idx] || 1;
          let pivotY = Math.floor(r.h / 2);
          if (pivotRule === 'base') {
            if (type === 'idle') {
              pivotY = Math.max(0, r.h - 10);
            } else {
              pivotY = Math.max(0, r.h - 8);
            }
          }
          const boxes = frameBoxes[idx] || [];
          return {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            pivotX: Math.floor(r.w / 2),
            pivotY,
            duration: Number(((animationSpeed * multiplier) / speedMult).toFixed(3)),
            hitboxes: boxes.filter(b => b.type === 'hitbox').map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
            hurtboxes: boxes.filter(b => b.type === 'hurtbox').map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }))
          };
        })
      };
    };

    let rowIndex: number | 'all' = selectedRow;
    if (selectedRow !== 'all' && rows.length === 1) {
      rowIndex = 0;
    }

    if (rowIndex === 'all' && rows.length > 1) {
      return {
        character: characterName || "Unknown",
        format: "sprite_slicer_bundle",
        animations: rows.map((_, i) => getRowInfo(i)).filter(anim => anim.frames.length > 0)
      };
    }

    const info = getRowInfo(rowIndex);
    return {
      character: characterName || "Unknown",
      ...info
    };
  }, [animationName, animationSpeed, customOrder, disabledIndices, frameDurations, rows, rowNames, rowPivots, rowTypes, rects, selectedRow, frameBoxes, rowSpeeds, characterName]);

  const handleDownloadGodot = () => {
    // Generate an AtlasTexture .tres file for Godot 4.x
    // We create a dummy .png reference that the user should replace or name accordingly
    if (playableRects.length === 0) return;
    
    // We'll generate a basic AtlasTexture array if it's multiple frames
    // or just one if it's a single sprite. Godot usually prefers a SpriteFrames resource
    // for multiple frames, but generating a raw SpriteFrames .tres text file is complex.
    // Instead we can give them the JSON and a basic godot script or basic SpriteFrames resource format.
    
    // Let's create a SpriteFrames resource for Godot
    const activeRowIndex = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
    const speedMult = activeRowIndex !== -1 ? (rowSpeeds[activeRowIndex] || 1.0) : 1.0;

    let godotContent = `[gd_resource type="SpriteFrames" load_steps=${playableRects.length + 2} format=3]\n\n`;
    
    // First, declare the texture (assuming they name the spritesheet the same as the animation + .png)
    const textureName = `${animationName || 'sprites'}.png`;
    godotContent += `[ext_resource type="Texture2D" path="res://${textureName}" id="1_tex"]\n\n`;
    
    // Now create AtlasTextures for each frame
    playableRects.forEach((rect, index) => {
      godotContent += `[sub_resource type="AtlasTexture" id="AtlasTexture_${index}"]\n`;
      godotContent += `atlas = ExtResource("1_tex")\n`;
      godotContent += `region = Rect2(${rect.x}, ${rect.y}, ${rect.w}, ${rect.h})\n\n`;
    });
    
    godotContent += `[resource]\nanimations = [{\n"frames": [`;
    
    playableRects.forEach((_, index) => {
      godotContent += `{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${index}")\n}`;
      if (index < playableRects.length - 1) godotContent += ", ";
    });
    
    godotContent += `],\n"loop": true,\n"name": &"default",\n"speed": ${Math.round((1 / animationSpeed) * speedMult)}\n}]\n`;

    const blob = new Blob([godotContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName || 'sprites'}.tres`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadGameMaker = () => {
    // GameMaker uses .yy files (JSON format)
    if (playableRects.length === 0) return;
    
    const activeRowIndex = selectedRow === 'all' ? -1 : (rows.length === 1 ? 0 : Number(selectedRow));
    const speedMult = activeRowIndex !== -1 ? (rowSpeeds[activeRowIndex] || 1.0) : 1.0;

    const textureGroup = `{"name":"Default","path":"texturegroups/Default",}`;
    const gmFrames = playableRects.map((r, i) => {
        return {
            "resourceType": "GMSpriteFrame",
            "resourceVersion": "1.1",
            "name": `frame_${i}`,
        };
    });

    const gmObject = {
        "resourceType": "GMSprite",
        "resourceVersion": "1.0",
        "name": animationName || "spr_custom",
        "bboxMode": 0,
        "collisionKind": 1,
        "type": 0,
        "origin": 4, // Center Middle
        "preMultiplyAlpha": false,
        "edgeFiltering": false,
        "collisionTolerance": 0,
        "swfPrecision": 2.525,
        "bbox_left": 0,
        "bbox_right": Math.max(...playableRects.map(r => r.w)),
        "bbox_top": 0,
        "bbox_bottom": Math.max(...playableRects.map(r => r.h)),
        "HTile": false,
        "VTile": false,
        "For3D": false,
        "DynamicTexturePage": false,
        "width": Math.max(...playableRects.map(r => r.w)),
        "height": Math.max(...playableRects.map(r => r.h)),
        "textureGroupId": {
            "name": "Default",
            "path": "texturegroups/Default",
        },
        "swatchColours": null,
        "gridX": 0,
        "gridY": 0,
        "frames": gmFrames,
        "sequence": {
            "resourceType": "GMSequence",
            "resourceVersion": "1.4",
            "name": animationName || "spr_custom",
            "playback": 1,
            "playbackSpeed": Math.round((1 / animationSpeed) * speedMult),
            "playbackSpeedType": 0,
            "showBackdrop": true,
            "showBackdropImage": false,
            "backdropImagePath": "",
            "backdropImageOpacity": 0.5,
            "backdropWidth": 1366,
            "backdropHeight": 768,
            "backdropXOffset": 0.0,
            "backdropYOffset": 0.0,
            "xorigin": Math.floor(Math.max(...playableRects.map(r => r.w)) / 2),
            "yorigin": Math.floor(Math.max(...playableRects.map(r => r.h)) / 2),
            "eventToFunction": {},
            "eventStubScript": null,
        }
    };

    const blob = new Blob([JSON.stringify(gmObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName || 'spr_custom'}.yy`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadGif = async () => {
    if (animationFramesInfo.length === 0) return;
    if (!preventAutoSlicing && !imageElement) return;
    setIsExportingGif(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const maxWidth = Math.max(...animationFramesInfo.map(r => r.w));
      const maxHeight = Math.max(...animationFramesInfo.map(r => r.h));
      
      const gif = GIFEncoder();
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = maxHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("Could not get canvas context");

      for (let i = 0; i < animationFramesInfo.length; i++) {
        const frameInfo = animationFramesInfo[i];
        const multiplier = frameInfo.isFullImage ? 1 : (frameDurations[frameInfo.index] || 1);
        const currentDelay = animationSpeed * 1000 * multiplier;

        ctx.clearRect(0, 0, maxWidth, maxHeight);
        
        // If not transparent, fill background
        if (!exportTransparent) {
          ctx.fillStyle = exportBgColor;
          ctx.fillRect(0, 0, maxWidth, maxHeight);
        }

        const offsetX = Math.floor((maxWidth - frameInfo.w) / 2);
        const offsetY = Math.floor((maxHeight - frameInfo.h) / 2);
        
        if (frameInfo.isFullImage && frameInfo.url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = frameInfo.url;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
          ctx.drawImage(img, offsetX, offsetY, frameInfo.w, frameInfo.h);
        } else if (frameInfo.rect && imageElement) {
          ctx.drawImage(
            imageElement,
            frameInfo.rect.x, frameInfo.rect.y, frameInfo.rect.w, frameInfo.rect.h,
            offsetX, offsetY, frameInfo.rect.w, frameInfo.rect.h
          );
        }
        
        // Pixel Art Filter for Export
        const activeRowKey = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
        const pixelateEnabled = rowPixelateEnabled[activeRowKey as any];
        const pixelateSize = rowPixelateSize[activeRowKey as any] || 4;

        if (pixelateEnabled && pixelateSize > 1) {
          const pCanvas = document.createElement('canvas');
          const pW = Math.max(1, Math.floor(maxWidth / pixelateSize));
          const pH = Math.max(1, Math.floor(maxHeight / pixelateSize));
          pCanvas.width = pW;
          pCanvas.height = pH;
          const pCtx = pCanvas.getContext('2d');
          if (pCtx) {
            pCtx.imageSmoothingEnabled = false;
            pCtx.drawImage(canvas, 0, 0, pW, pH);
            ctx.clearRect(0, 0, maxWidth, maxHeight);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(pCanvas, 0, 0, pW, pH, 0, 0, maxWidth, maxHeight);
          }
        }
        
        const imageData = ctx.getImageData(0, 0, maxWidth, maxHeight);
        if (exportTransparent && !preventAutoSlicing) {
          removeBackground(imageData, bgColor, tolerance);
          ctx.putImageData(imageData, 0, 0); // Put back to apply outline
        }
        
        if (exportOutline) {
          const outC = addOutlineToCanvas(canvas, exportOutlineColor);
          ctx.clearRect(0,0, maxWidth, maxHeight);
          // Draw centered to avoid changing logical canvas size
          ctx.drawImage(outC, Math.floor((maxWidth - outC.width)/2), Math.floor((maxHeight - outC.height)/2));
        }
        
        // Re-read pixels for palette
        const finalImageData = ctx.getImageData(0, 0, maxWidth, maxHeight);
        const palette = quantize(finalImageData.data, 256, { format: 'rgba4444' });
        const index = applyPalette(finalImageData.data, palette, 'rgba4444');
        
        gif.writeFrame(index, maxWidth, maxHeight, { 
          palette, 
          delay: currentDelay, 
          transparent: exportTransparent,
          dispose: 2 
        });
      }
      
      gif.finish();
      const buffer = gif.bytes();
      const blob = new Blob([buffer], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${animationName}.gif`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating GIF:", err);
      alert("Failed to generate GIF.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleDownloadZip = async (audioFile?: File | null) => {
    if (animationFramesInfo.length === 0) return;
    if (!preventAutoSlicing && !imageElement) return;
    setIsExportingGif(true); // Using the same loader state for now
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const zip = new JSZip();
      const folder = zip.folder(animationName || 'sprites');
      if (!folder) throw new Error("Could not create folder in ZIP");

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // Extract each frame
      for (let i = 0; i < animationFramesInfo.length; i++) {
        const frameInfo = animationFramesInfo[i];
        canvas.width = frameInfo.w;
        canvas.height = frameInfo.h;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (frameInfo.isFullImage && frameInfo.url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = frameInfo.url;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
          ctx.drawImage(img, 0, 0, frameInfo.w, frameInfo.h);
        } else if (frameInfo.rect && imageElement) {
          ctx.drawImage(
            imageElement,
            frameInfo.rect.x, frameInfo.rect.y, frameInfo.rect.w, frameInfo.rect.h,
            0, 0, frameInfo.rect.w, frameInfo.rect.h
          );
        }

        // Apply Pixel Art if enabled for the current view
        const activeRowKey = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
        const pixelateEnabled = rowPixelateEnabled[activeRowKey as any];
        const pixelateSize = rowPixelateSize[activeRowKey as any] || 4;

        if (pixelateEnabled && pixelateSize > 1) {
          const pCanvas = document.createElement('canvas');
          const pW = Math.max(1, Math.floor(frameInfo.w / pixelateSize));
          const pH = Math.max(1, Math.floor(frameInfo.h / pixelateSize));
          pCanvas.width = pW;
          pCanvas.height = pH;
          const pCtx = pCanvas.getContext('2d');
          if (pCtx) {
            pCtx.imageSmoothingEnabled = false;
            pCtx.drawImage(canvas, 0, 0, pW, pH);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(pCanvas, 0, 0, pW, pH, 0, 0, frameInfo.w, frameInfo.h);
          }
        }

        const blob = await new Promise<Blob | null>(resolve => {
          canvas.toBlob(resolve, 'image/png');
        });

        if (blob) {
          // Format filename with leading zeros (e.g., frame_00.png, frame_01.png)
          const frameNumber = i.toString().padStart(Math.max(2, animationFramesInfo.length.toString().length), '0');
          folder.file(`frame_${frameNumber}.png`, blob);
        }
      }

      // Add the audio or video file if selected
      if (audioFile) {
        folder.file(audioFile.name, audioFile);
      }

      // Create audio metadata representation
      const audioMetadata = audioFile ? {
        filename: audioFile.name,
        type: audioFile.type,
        size: audioFile.size
      } : undefined;

      const finalJsonOutput = {
        ...jsonOutput,
        audio: audioMetadata
      };

      // Add metadata JSON to the root or inside the folder with attached audio info
      folder.file(`${animationName || 'sprites'}.json`, JSON.stringify(finalJsonOutput, null, 2));

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${animationName || 'sprites'}.zip`);
    } catch (err) {
      console.error("Error generating ZIP:", err);
      alert("Failed to generate ZIP.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleDownloadMovesetZip = async () => {
    if (!imageElement || rows.length === 0) return;
    setIsExportingGif(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const zip = new JSZip();
      
      const folderName = characterName ? characterName.toLowerCase().replace(/\s+/g, '_') : 'character_moveset';
      const charFolder = zip.folder(folderName);
      if (!charFolder) throw new Error("Could not create character folder in ZIP");

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      const movesetMeta: any = {
        character: characterName || 'Hero',
        version: "1.0",
        engine: "Unity/Godot Compatible",
        moves: []
      };

      for (let i = 0; i < rows.length; i++) {
        const row = (rows[i] || []).filter(rect => {
          const gIdx = rects.indexOf(rect);
          const isGlobalDisabled = gIdx !== -1 && disabledIndices.has(gIdx);
          const isRowDisabled = gIdx !== -1 && rowDisabledFrames[i]?.has(gIdx);
          return !isGlobalDisabled && !isRowDisabled;
        });
        if (row.length === 0) continue;

        const rawName = rowNames[i] || rowTypes[i] || `action_${i + 1}`;
        const sanitizedActionName = rawName.toLowerCase().replace(/\s+/g, '_');
        
        const actionType = rowTypes[i] || 'custom';
        const pivot = rowPivots[i] || 'center';
        const speedFactor = rowSpeeds[i] || 1.0;
        const hitFrame = Math.min(rowHits[i] !== undefined ? rowHits[i] : Math.max(0, Math.floor((row.length - 1) / 2)), Math.max(0, row.length - 1));
        const triggerKey = rowKeys[i] || 'none';

        const actionFolder = charFolder.folder(sanitizedActionName);
        if (!actionFolder) continue;

        const actionFramesMeta: any[] = [];

        for (let f = 0; f < row.length; f++) {
          const rect = row[f];
          canvas.width = rect.w;
          canvas.height = rect.h;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          ctx.drawImage(
            imageElement,
            rect.x, rect.y, rect.w, rect.h,
            0, 0, rect.w, rect.h
          );

          const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
          if (exportTransparent && !preventAutoSlicing) {
            removeBackground(imageData, bgColor, tolerance);
            ctx.putImageData(imageData, 0, 0);
          }

          // Apply row-specific Pixel Art if enabled
          const isPixelEnabled = rowPixelateEnabled['all' as any] || rowPixelateEnabled[i];
          const pSize = rowPixelateSize['all' as any] || rowPixelateSize[i] || 4;

          if (isPixelEnabled && pSize > 1) {
            const pCanvas = document.createElement('canvas');
            const pW = Math.max(1, Math.floor(rect.w / pSize));
            const pH = Math.max(1, Math.floor(rect.h / pSize));
            pCanvas.width = pW;
            pCanvas.height = pH;
            const pCtx = pCanvas.getContext('2d');
            if (pCtx) {
              pCtx.imageSmoothingEnabled = false;
              pCtx.drawImage(canvas, 0, 0, pW, pH);
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(pCanvas, 0, 0, pW, pH, 0, 0, rect.w, rect.h);
            }
          }

          const blob = await new Promise<Blob | null>(resolve => {
            canvas.toBlob(resolve, 'image/png');
          });

          if (blob) {
            const frameNumStr = f.toString().padStart(3, '0');
            const frameFilename = `frame_${frameNumStr}.png`;
            actionFolder.file(frameFilename, blob);
            
            const frameBoxesIdx = rects.indexOf(rect);
            const boxes = frameBoxes[frameBoxesIdx] || [];
            actionFramesMeta.push({
              index: f,
              filename: frameFilename,
              width: rect.w,
              height: rect.h,
              sourceX: rect.x,
              sourceY: rect.y,
              hitboxes: boxes.filter(b => b.type === 'hitbox').map(b => ({
                id: b.id,
                xPercent: b.x,
                yPercent: b.y,
                wPercent: b.w,
                hPercent: b.h
              })),
              hurtboxes: boxes.filter(b => b.type === 'hurtbox').map(b => ({
                id: b.id,
                xPercent: b.x,
                yPercent: b.y,
                wPercent: b.w,
                hPercent: b.h
              }))
            });
          }
        }

        movesetMeta.moves.push({
          name: rawName,
          folder: sanitizedActionName,
          type: actionType,
          pivot: pivot,
          speedMultiplier: speedFactor,
          hitFrame: hitFrame,
          shortcutKey: triggerKey,
          frameCount: row.length,
          frames: actionFramesMeta
        });
      }

      charFolder.file(`moveset_config.json`, JSON.stringify(movesetMeta, null, 2));

      const csScript = `using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Slicer.io - Production Ready Sprite Moveset Controller (C#)
/// Auto-generated for: ${characterName || 'Hero'}
/// Drag and drop this script on your Hero GameObject containing a SpriteRenderer.
/// </summary>
[RequireComponent(typeof(SpriteRenderer))]
public class SpriteMovesetController : MonoBehaviour
{
    [System.Serializable]
    public class SimpleFrame
    {
        public Sprite sprite;
        public float duration = 0.1f;
    }

    [System.Serializable]
    public class SimpleMove
    {
        public string moveName;
        public string type;
        public bool isLoopable;
        public float speedMultiplier = 1.0f;
        public int hitFrame = 0;
        public string shortcutKey;
        public List<SimpleFrame> frames = new List<SimpleFrame>();
    }

    public List<SimpleMove> moveset = new List<SimpleMove>();
    public string defaultMove = "idle";

    private SpriteRenderer spriteRenderer;
    private SimpleMove currentMove;
    private int currentFrameIndex;
    private float frameTimer;
    private bool isPlayingNonLooping = false;

    // Events for Game Sync integration
    public event Action<string, int> OnFrameChanged;
    public event Action<SimpleMove> OnHitFrameReached;
    public event Action<SimpleMove> OnAnimationComplete;

    void Awake()
    {
        spriteRenderer = GetComponent<SpriteRenderer>();
    }

    void Start()
    {
        PlayMove(defaultMove);
    }

    void Update()
    {
        HandleKeyboardInput();
        UpdateAnimation(Time.deltaTime);
    }

    private void HandleKeyboardInput()
    {
        if (isPlayingNonLooping) return; // Prevent cancelling specialized combat actions

        foreach (var move in moveset)
        {
            if (string.IsNullOrEmpty(move.shortcutKey) || move.shortcutKey == "none") continue;

            if (Input.GetKeyDown(move.shortcutKey))
            {
                PlayMove(move.moveName);
                break;
            }
        }
    }

    public void PlayMove(string name)
    {
        SimpleMove target = moveset.Find(m => m.moveName.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (target == null) return;

        if (currentMove == target && !isPlayingNonLooping) return;

        currentMove = target;
        currentFrameIndex = 0;
        frameTimer = 0f;
        isPlayingNonLooping = !currentMove.isLoopable;
        
        ApplyFrameSprite();
    }

    private void UpdateAnimation(float deltaTime)
    {
        if (currentMove == null || currentMove.frames.Count == 0) return;

        frameTimer += deltaTime * currentMove.speedMultiplier;
        float targetDuration = currentMove.frames[currentFrameIndex].duration;

        if (frameTimer >= targetDuration)
        {
            frameTimer -= targetDuration;
            currentFrameIndex++;

            if (currentFrameIndex >= currentMove.frames.Count)
            {
                if (currentMove.isLoopable)
                {
                    currentFrameIndex = 0;
                    OnAnimationComplete?.Invoke(currentMove);
                }
                else
                {
                    OnAnimationComplete?.Invoke(currentMove);
                    isPlayingNonLooping = false;
                    PlayMove(defaultMove);
                    return;
                }
            }

            ApplyFrameSprite();

            if (currentFrameIndex == currentMove.hitFrame)
            {
                OnHitFrameReached?.Invoke(currentMove);
                Debug.Log($"[COMBAT] Impact frame reached for: {currentMove.moveName}!");
            }
        }
    }

    private void ApplyFrameSprite()
    {
        if (currentMove == null || currentFrameIndex >= currentMove.frames.Count) return;
        spriteRenderer.sprite = currentMove.frames[currentFrameIndex].sprite;
        OnFrameChanged?.Invoke(currentMove.moveName, currentFrameIndex);
    }
}
`;
      charFolder.file(`SpriteMovesetController.cs`, csScript);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}_moveset_pack.zip`);
    } catch (err) {
      console.error("Error generating Moveset ZIP:", err);
      alert("Failed to generate Game Moveset Pack ZIP.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleDownloadSingleRowZip = async (rowIndex: number) => {
    if (!imageElement || rows.length === 0 || !rows[rowIndex]) return;
    setIsExportingGif(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const zip = new JSZip();
      
      const row = (rows[rowIndex] || []).filter(rect => {
        const gIdx = rects.indexOf(rect);
        const isGlobalDisabled = gIdx !== -1 && disabledIndices.has(gIdx);
        const isRowDisabled = gIdx !== -1 && rowDisabledFrames[rowIndex]?.has(gIdx);
        return !isGlobalDisabled && !isRowDisabled;
      });
      if (row.length === 0) throw new Error("A linha selecionada não possui nenhum frame ativo");

      const rawName = rowNames[rowIndex] || rowTypes[rowIndex] || `action_${rowIndex + 1}`;
      const sanitizedActionName = rawName.toLowerCase().replace(/\s+/g, '_');
      
      const folderName = characterName ? `${characterName.toLowerCase().replace(/\s+/g, '_')}_${sanitizedActionName}` : `${sanitizedActionName}_moveset`;
      const charFolder = zip.folder(folderName);
      if (!charFolder) throw new Error("Could not create character folder in ZIP");

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      const movesetMeta: any = {
        character: characterName || 'Hero',
        version: "1.0",
        engine: "Unity/Godot Compatible",
        moves: []
      };

      const actionType = rowTypes[rowIndex] || 'custom';
      const pivot = rowPivots[rowIndex] || 'center';
      const speedFactor = rowSpeeds[rowIndex] || 1.0;
      const hitFrame = Math.min(rowHits[rowIndex] !== undefined ? rowHits[rowIndex] : Math.max(0, Math.floor((row.length - 1) / 2)), Math.max(0, row.length - 1));
      const triggerKey = rowKeys[rowIndex] || 'none';

      const actionFolder = charFolder.folder(sanitizedActionName);
      if (actionFolder) {
        const actionFramesMeta: any[] = [];

        for (let f = 0; f < row.length; f++) {
          const rect = row[f];
          canvas.width = rect.w;
          canvas.height = rect.h;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          ctx.drawImage(
            imageElement,
            rect.x, rect.y, rect.w, rect.h,
            0, 0, rect.w, rect.h
          );

          const imageData = ctx.getImageData(0, 0, rect.w, rect.h);
          if (exportTransparent && !preventAutoSlicing) {
            removeBackground(imageData, bgColor, tolerance);
            ctx.putImageData(imageData, 0, 0);
          }

          const blob = await new Promise<Blob | null>(resolve => {
            canvas.toBlob(resolve, 'image/png');
          });

          if (blob) {
            const frameNumStr = f.toString().padStart(3, '0');
            const frameFilename = `frame_${frameNumStr}.png`;
            actionFolder.file(frameFilename, blob);
            
            const frameBoxesIdx = rects.indexOf(rect);
            const boxes = frameBoxes[frameBoxesIdx] || [];
            actionFramesMeta.push({
              index: f,
              filename: frameFilename,
              width: rect.w,
              height: rect.h,
              sourceX: rect.x,
              sourceY: rect.y,
              hitboxes: boxes.filter(b => b.type === 'hitbox').map(b => ({
                id: b.id,
                xPercent: b.x,
                yPercent: b.y,
                wPercent: b.w,
                hPercent: b.h
              })),
              hurtboxes: boxes.filter(b => b.type === 'hurtbox').map(b => ({
                id: b.id,
                xPercent: b.x,
                yPercent: b.y,
                wPercent: b.w,
                hPercent: b.h
              }))
            });
          }
        }

        movesetMeta.moves.push({
          name: rawName,
          folder: sanitizedActionName,
          type: actionType,
          pivot: pivot,
          speedMultiplier: speedFactor,
          hitFrame: hitFrame,
          shortcutKey: triggerKey,
          frameCount: row.length,
          frames: actionFramesMeta
        });
      }

      charFolder.file(`moveset_config.json`, JSON.stringify(movesetMeta, null, 2));

      const csScript = `using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Slicer.io - Production Ready Sprite Moveset Controller (C#)
/// Auto-generated single action for: ${characterName || 'Hero'} - ${rawName}
/// Drag and drop this script on your Hero GameObject containing a SpriteRenderer.
/// </summary>
[RequireComponent(typeof(SpriteRenderer))]
public class SpriteMovesetController : MonoBehaviour
{
    [System.Serializable]
    public class SimpleFrame
    {
        public Sprite sprite;
        public float duration = 0.1f;
    }

    [System.Serializable]
    public class SimpleMove
    {
        public string moveName;
        public string type;
        public bool isLoopable;
        public float speedMultiplier = 1.0f;
        public int hitFrame = 0;
        public string shortcutKey;
        public List<SimpleFrame> frames = new List<SimpleFrame>();
    }

    public List<SimpleMove> moveset = new List<SimpleMove>();
    public string defaultMove = "${rawName.toLowerCase()}";

    private SpriteRenderer spriteRenderer;
    private SimpleMove currentMove;
    private int currentFrameIndex;
    private float frameTimer;
    private bool isPlayingNonLooping = false;

    // Events for Game Sync integration
    public event Action<string, int> OnFrameChanged;
    public event Action<SimpleMove> OnHitFrameReached;
    public event Action<SimpleMove> OnAnimationComplete;

    void Awake()
    {
        spriteRenderer = GetComponent<SpriteRenderer>();
    }

    void Start()
    {
        PlayMove(defaultMove);
    }

    void Update()
    {
        HandleKeyboardInput();
        UpdateAnimation(Time.deltaTime);
    }

    private void HandleKeyboardInput()
    {
        if (isPlayingNonLooping) return; // Prevent cancelling specialized combat actions

        foreach (var move in moveset)
        {
            if (string.IsNullOrEmpty(move.shortcutKey) || move.shortcutKey == "none" || move.shortcutKey == "NONE") continue;

            if (Input.GetKeyDown(move.shortcutKey))
            {
                PlayMove(move.moveName);
                break;
            }
        }
    }

    public void PlayMove(string name)
    {
        SimpleMove target = moveset.Find(m => m.moveName.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (target == null) return;

        if (currentMove == target && !isPlayingNonLooping) return;

        currentMove = target;
        currentFrameIndex = 0;
        frameTimer = 0f;
        isPlayingNonLooping = !currentMove.isLoopable;
        
        ApplyFrameSprite();
    }

    private void UpdateAnimation(float deltaTime)
    {
        if (currentMove == null || currentMove.frames.Count == 0) return;

        frameTimer += deltaTime * currentMove.speedMultiplier;
        float targetDuration = currentMove.frames[currentFrameIndex].duration;

        if (frameTimer >= targetDuration)
        {
            frameTimer -= targetDuration;
            currentFrameIndex++;

            if (currentFrameIndex >= currentMove.frames.Count)
            {
                if (currentMove.isLoopable)
                {
                    currentFrameIndex = 0;
                    OnAnimationComplete?.Invoke(currentMove);
                }
                else
                {
                    OnAnimationComplete?.Invoke(currentMove);
                    isPlayingNonLooping = false;
                    PlayMove(defaultMove);
                    return;
                }
            }

            ApplyFrameSprite();

            if (currentFrameIndex == currentMove.hitFrame)
            {
                OnHitFrameReached?.Invoke(currentMove);
                Debug.Log($"[COMBAT] Impact frame reached for: {currentMove.moveName}!");
            }
        }
    }

    private void ApplyFrameSprite()
    {
        if (currentMove == null || currentFrameIndex >= currentMove.frames.Count) return;
        spriteRenderer.sprite = currentMove.frames[currentFrameIndex].sprite;
        OnFrameChanged?.Invoke(currentMove.moveName, currentFrameIndex);
    }
}
`;
      charFolder.file(`SpriteMovesetController.cs`, csScript);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}_slicer_pack.zip`);
    } catch (err) {
      console.error("Error generating single row ZIP:", err);
      alert("Failed to generate Game Single Moveset Pack ZIP.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const handleAnimationNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Security: Sanitize input to prevent XSS and limit length
    const sanitized = e.target.value.replace(/[<>"/\\;]/g, '').slice(0, 32);
    setAnimationName(sanitized);
  };

  const handleDeleteFrame = (globalIndex: number, silent = false) => {
    if (!silent) {
      const confirmMsg = language === 'pt'
        ? `Tem certeza que deseja apagar o Sprite Frame ${globalIndex} definitivamente?`
        : language === 'es'
        ? `¿Estás seguro de que deseas eliminar el Sprite Frame ${globalIndex} permanentemente?`
        : `Are you sure you want to permanently delete Sprite Frame ${globalIndex}?`;

      if (!window.confirm(confirmMsg)) return;
    }

    pushToHistory();
      
      // Remove from rects list
      setRects(prev => prev.filter((_, i) => i !== globalIndex));
      
      // Update customOrder
      setCustomOrder(prev => {
        return prev
          .filter(idx => idx !== globalIndex)
          .map(idx => idx > globalIndex ? idx - 1 : idx);
      });

      // Update disabledIndices
      setDisabledIndices(prev => {
        const next = new Set<number>();
        prev.forEach(idx => {
          if (idx !== globalIndex) {
            next.add(idx > globalIndex ? idx - 1 : idx);
          }
        });
        return next;
      });

      // Shift frameDurations
      setFrameDurations(prev => {
        const next: Record<number, number> = {};
        Object.entries(prev).forEach(([key, mult]) => {
          const idx = Number(key);
          if (idx !== globalIndex) {
            const newIdx = idx > globalIndex ? idx - 1 : idx;
            next[newIdx] = mult;
          }
        });
        return next;
      });

      // Clamp currentFrame
      setCurrentFrame(prev => Math.max(0, Math.min(prev, rects.length - 2)));
  };

  const handleDeleteRow = (rowIndex: number, silent = false, skipHistory = false) => {
    const rowToDelete = rows[rowIndex];
    if (!rowToDelete) return;
    
    const isCustomRow = rowIndex >= autoRows.length;
    if (!isCustomRow && rowToDelete.length === 0) return;

    const rowNameDisplay = getActionName(rowIndex);
    
    if (!silent) {
      const confirmMsg = language === 'pt'
        ? `Tem certeza que deseja apagar a "${rowNameDisplay}" inteira? Isso excluirá todos os ${rowToDelete.length} frames associados.`
        : language === 'es'
        ? `¿Estás seguro de que deseas eliminar la "${rowNameDisplay}"? Esto eliminará todos los ${rowToDelete.length} fotogramas asociados.`
        : `Are you sure you want to delete the "${rowNameDisplay}"? This will remove all ${rowToDelete.length} associated frames.`;

      if (!window.confirm(confirmMsg)) return;
    }
    
    if (!skipHistory) pushToHistory();
      
    if (isCustomRow) {
      // For custom rows, we JUST remove the row itself.
      // We DO NOT remove the underlying rects from the global rects state, 
      // because those frames might still be needed in their original autoRows.
      const customRowIndex = rowIndex - autoRows.length;
      
      setCustomRows(prev => prev.filter((_, i) => i !== customRowIndex));
    } else {
      // For auto rows, we delete the physical rectangles globally.
      // Get all global indices that belong to this row
      const indicesToDelete = new Set(rowToDelete.map(r => rects.indexOf(r)).filter(idx => idx !== -1));
      
      // Filter out rects
      setRects(prev => prev.filter((_, i) => !indicesToDelete.has(i)));
      
      // Shift custom-order elements
      setCustomOrder(prev => {
        return prev
          .filter(idx => !indicesToDelete.has(idx))
          .map(idx => {
            const deletedCountBefore = Array.from(indicesToDelete).filter(deletedIdx => deletedIdx < idx).length;
            return idx - deletedCountBefore;
          });
      });

      // Shift disabled indices set
      setDisabledIndices(prev => {
        const next = new Set<number>();
        prev.forEach(idx => {
          if (!indicesToDelete.has(idx)) {
            const deletedCountBefore = Array.from(indicesToDelete).filter(deletedIdx => deletedIdx < idx).length;
            next.add(idx - deletedCountBefore);
          }
        });
        return next;
      });

      // Shift custom frame multipliers
      setFrameDurations(prev => {
        const next: Record<number, number> = {};
        Object.entries(prev).forEach(([key, mult]) => {
          const idx = Number(key);
          if (!indicesToDelete.has(idx)) {
            const deletedCountBefore = Array.from(indicesToDelete).filter(deletedIdx => deletedIdx < idx).length;
            next[idx - deletedCountBefore] = mult;
          }
        });
        return next;
      });

      // Update customRows: if any of their frames were deleted, remove them
      setCustomRows(prev => {
        return prev
          .map(row => row.filter(r => !indicesToDelete.has(rects.indexOf(r))))
          .filter(row => row.length > 0); // Remove custom rows that become empty
      });
    }

    // Both autoRows and customRows need their row metadata shifted
    // Shift all Row-Index based states
    const shiftRowState = <T,>(prev: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {};
      Object.entries(prev).forEach(([key, val]) => {
        const idx = Number(key);
        if (idx < rowIndex) {
          next[idx] = val;
        } else if (idx > rowIndex) {
          next[idx - 1] = val;
        }
      });
      return next;
    };

    setRowNames(prev => shiftRowState(prev));
    setRowTypes(prev => shiftRowState(prev));
    setRowSpeeds(prev => shiftRowState(prev));
    setRowLoopPoints(prev => shiftRowState(prev));
    setRowPivots(prev => shiftRowState(prev));
    setRowPixelateEnabled(prev => shiftRowState(prev));
    setRowPixelateSize(prev => shiftRowState(prev));
    setRowKeys(prev => shiftRowState(prev));
    setRowHits(prev => shiftRowState(prev));
    setRowDisabledFrames(prev => shiftRowState(prev));

    setSelectedRow('all');
    setCurrentFrame(0);

    // Trigger success feedback
    if (!silent) {
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2000);
    }
  };

  const smallRectsCount = rects.filter(r => r.w < 10 || r.h < 10).length;

  return (
    <div 
      className={`flex flex-col lg:flex-row h-full overflow-hidden bg-neutral-950 text-neutral-300 font-mono text-sm transition-all duration-300 relative pb-16 lg:pb-0 ${isDraggingFile ? 'scale-[0.98] ring-4 ring-emerald-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-[200] bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-neutral-900 border-2 border-dashed border-emerald-500 p-12 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
            <Upload className="w-16 h-16 text-emerald-500 animate-bounce" />
            <p className="text-xl font-bold text-white">Solte para importar</p>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">{t.clearAll}</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                {t.confirmClearAll}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all"
              >
                {t.cancel}
              </button>
              <button 
                onClick={executeClearAll}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-900/20"
              >
                {t.clearAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Processing Overlay */}
      {isProcessingVideo && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-8 text-center animate-in zoom-in duration-300">
            <div className="relative w-32 h-32 mx-auto">
              <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-emerald-500 rounded-full transition-all duration-300"
                style={{ 
                  clipPath: `polygon(50% 50%, -50% -50%, ${videoProgress > 12.5 ? '150% -50%' : '50% -50%'}, ${videoProgress > 37.5 ? '150% 150%' : videoProgress > 12.5 ? '150% 50%' : '50% 50%'}, ${videoProgress > 62.5 ? '-50% 150%' : videoProgress > 37.5 ? '50% 150%' : '50% 50%'}, ${videoProgress > 87.5 ? '-50% -50%' : videoProgress > 62.5 ? '-50% 50%' : '50% 50%'})`,
                  transform: `rotate(${videoProgress * 3.6}deg)`
                }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">{t.processingVideo}</h2>
              <div className="space-y-2">
                <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${videoProgress}%` }}
                  ></div>
                </div>
                <p className="text-emerald-500 font-mono text-sm font-bold">
                  {t.videoProgress.replace('{n}', videoProgress.toString())}
                </p>
              </div>
              <p className="text-neutral-500 text-xs italic leading-relaxed">
                {t.videoSizeWarning}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Audio ZIP Optional Prompt Modal */}
      {showAudioZipPrompt && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="space-y-2 text-center">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-indigo-500" />
              </div>
              <h2 className="text-xl font-bold text-white text-center">
                {language === 'pt' ? '🎵 Incluir Áudio / Vídeo?' : language === 'es' ? '🎵 ¿Incluir Audio / Video?' : '🎵 Include Audio / Video?'}
              </h2>
              <p className="text-neutral-400 text-xs leading-relaxed text-left">
                {language === 'pt' 
                  ? 'Deseja incluir um arquivo de áudio ou vídeo (áudio de referência) junto com os seus frames no arquivo ZIP? Se sim, você selecionará o arquivo agora para que ele seja inserido automaticamente no ZIP e registrado no arquivo metadata JSON.' 
                  : language === 'es'
                  ? '¿Desea incluir un archivo de audio o video (audio de referencia) junto con sus fotogramas en el archivo ZIP? Si es así, seleccionará el archivo ahora para que se inserte en el ZIP y se registre en el JSON.'
                  : 'Would you like to include an audio or video file (reference audio) alongside your frames in the ZIP archive? If so, you will select the file now to bundle it in the ZIP and log it under the JSON metadata.'}
              </p>
            </div>

            <div className="grid gap-3">
              <button 
                onClick={() => {
                  audioZipInputRef.current?.click();
                }}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-900/10"
              >
                🎵 {language === 'pt' ? 'Sim, selecionar arquivo' : language === 'es' ? 'Sí, seleccionar archivo' : 'Yes, select file'}
              </button>
              
              <button 
                onClick={async () => {
                  setShowAudioZipPrompt(false);
                  await handleDownloadZip(null);
                }}
                className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-neutral-700 cursor-pointer"
              >
                ❌ {language === 'pt' ? 'Não, apenas frames' : language === 'es' ? 'No, solo fotogramas' : 'No, export frames only'}
              </button>

              <button 
                onClick={() => setShowAudioZipPrompt(false)}
                className="w-full py-2 bg-transparent hover:text-white text-neutral-400 text-xs rounded-xl font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {language === 'pt' ? 'Cancelar' : language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
            </div>
            
            <input 
              type="file" 
              ref={audioZipInputRef}
              accept="audio/*,video/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setShowAudioZipPrompt(false);
                  await handleDownloadZip(file);
                }
                if (e.target) {
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-8">
            <div className="space-y-2">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">
                {t.languageModal.title}
              </h2>
              <p className="text-neutral-500 text-sm">
                {t.languageModal.subtitle}
              </p>
            </div>

            <div className="grid gap-3">
              <button 
                onClick={() => handleLanguageSelect('pt')}
                className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-neutral-700"
              >
                <span className="text-xl">🇧🇷</span> Português
              </button>
              <button 
                onClick={() => handleLanguageSelect('en')}
                className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-neutral-700"
              >
                <span className="text-xl">🇺🇸</span> English
              </button>
              <button 
                onClick={() => handleLanguageSelect('es')}
                className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-neutral-700"
              >
                <span className="text-xl">🇪🇸</span> Español
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Palette Extractor Modal */}
      {showPalette && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl max-w-lg w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
               <div>
                  <h2 className="text-xl font-bold text-white text-left">Color Palette</h2>
                  <p className="text-xs text-neutral-400 text-left">Extracted {palette.length} colors</p>
               </div>
               <button onClick={() => setShowPalette(false)} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group">
                 <X className="w-5 h-5 text-neutral-400 group-hover:text-white" />
               </button>
            </div>
            
            <div className="grid grid-cols-8 gap-2 mb-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {palette.map((color, i) => (
                    <div key={i} className="group relative">
                        <div 
                            className="w-full aspect-square rounded-md shadow-sm border border-neutral-700/50 cursor-crosshair hover:scale-110 transition-transform" 
                            style={{ backgroundColor: color }}
                            onClick={() => {
                                navigator.clipboard.writeText(color);
                            }}
                        />
                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none transition-opacity z-10">
                            {color}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadPaletteTxt}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-neutral-700"
              >
                <FileJson className="w-4 h-4" /> 
                Download .HEX
              </button>
              <button
                onClick={downloadPaletteImage}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <ImageIcon className="w-4 h-4" /> 
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl text-left space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                O que há de novo? (Slicer 2.2)
              </h2>
              <p className="text-neutral-400 text-sm">
                Confira as mais recentes novidades adicionadas à ferramenta!
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                <h3 className="font-bold text-pink-400 flex items-center gap-2 mb-2">
                  <Crop className="w-4 h-4" /> Janelas Múltiplas (Recorte Avançado)
                </h3>
                <p className="text-sm text-neutral-300">
                  Tem um Sprite Sheet gigante e quer fatiar apenas algumas partes? Agora o <strong>Recortar Imagem</strong> permite <strong>"Salvar Janela & Extrair Mais"</strong>! Recorte várias áreas diferentes da mesma imagem e junte tudo num único workspace sem precisar abrir e fechar a imagem repetidas vezes! Excelente para resgatar frames perdidos nos Movesets.
                </p>
              </div>

              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                <h3 className="font-bold text-emerald-400 flex items-center gap-2 mb-2">
                  <CheckSquare className="w-4 h-4" /> Caixas de Colisão (Hitboxes / Hurtboxes)
                </h3>
                <p className="text-sm text-neutral-300">
                  Agora você pode desenhar áreas de colisão diretamente no Frame Preview (clicando sobre a imagem recortada dentro de uma Ação). As Hitboxes (vermelhas) e Hurtboxes (verdes) serão exportadas em JSON junto às imagens para leitura nas engines!
                </p>
              </div>

              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                <h3 className="font-bold text-blue-400 flex items-center gap-2 mb-2">
                  <MousePointer2 className="w-4 h-4" /> Mesclar Frames (Manual)
                </h3>
                <p className="text-sm text-neutral-300">
                  Tinha problemas com efeitos (como bolas de Ki e magia) ficando separados do personagem no fatiamento automático? Agora é super simples! Ative a ferramenta de seleção manual (ícone de mouse na barra vertical do editor Slicer), selecione uma área contendo todo o personagem e a magia, e eles serão <strong>mesclados automaticamente</strong> em um único Frame contendo ambos!
                </p>
              </div>
              
              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                <h3 className="font-bold text-amber-500 flex items-center gap-2 mb-2">
                  <Archive className="w-4 h-4" /> Atlas Compacto com Texture-Packer
                </h3>
                <p className="text-sm text-neutral-300">
                  Use o novo botão "Export Compact Atlas", ele junta todas as imagens em uma só imagem condensada e otimizada (como TexturePacker) + um JSON contendo as coordenadas. Além disso adicionamos a opção de renderizar a imagem com contornos nas exportações.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20"
              >
                Incrível, fechar!
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-neutral-800">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300" 
                style={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }}
              />
            </div>
            
            <button 
              onClick={closeTutorial}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
            >
              {t.tutorial.skip}
            </button>

            <div className="flex flex-col items-center text-center space-y-6">
              <div className="p-4 bg-neutral-800 rounded-2xl">
                {tutorialSteps[tutorialStep].icon}
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">
                  {tutorialSteps[tutorialStep].title}
                </h2>
                <div className="text-neutral-400 leading-relaxed">
                  {tutorialSteps[tutorialStep].content}
                </div>
              </div>

              <div className="flex gap-3 w-full pt-4">
                {tutorialStep > 0 && (
                  <button 
                    onClick={() => setTutorialStep(s => s - 1)}
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all"
                  >
                    {t.tutorial.prev}
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (tutorialStep < tutorialSteps.length - 1) {
                      setTutorialStep(s => s + 1);
                    } else {
                      closeTutorial();
                    }
                  }}
                  className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
                >
                  {tutorialStep === tutorialSteps.length - 1 ? t.tutorial.start : t.tutorial.next}
                </button>
              </div>

              <div className="flex gap-1.5">
                {tutorialSteps.map((_, i) => (
                  <div 
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === tutorialStep ? 'bg-emerald-500 w-4' : 'bg-neutral-700'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Warning Overlay */}
      {showMobileWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
            <Smartphone className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">{t.desktopRecommended}</h2>
            <p className="text-neutral-400 text-xs mb-6">
              {t.desktopSiteInstructions}
            </p>
            <button
              onClick={() => setDismissedWarning(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              {t.continueAnyway}
            </button>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {showCropModal && imageElement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl max-w-5xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">{t.cropSpriteSheet}</h2>
                <p className="text-neutral-400 text-xs">
                  {t.cropDescription}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-lg">
                  <ZoomOut className="w-3 h-3 text-neutral-500" />
                  <input 
                    type="range" min="0.2" max="4" step="0.1" value={cropZoom}
                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                    className="w-32 accent-emerald-500"
                  />
                  <ZoomIn className="w-3 h-3 text-neutral-500" />
                  <span className="text-xs text-white min-w-[3rem] text-right">{Math.round(cropZoom * 100)}%</span>
                </div>
                <button 
                  onClick={() => setCropRect(null)}
                  className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-900/30 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  {t.clearSelection}
                </button>
              </div>
            </div>

            <div className="relative flex-1 border border-neutral-800 rounded-xl overflow-auto bg-neutral-950/50 custom-scrollbar">
              <div 
                className="relative origin-top-left"
                style={{ transform: `scale(${cropZoom})`, width: imageElement.width, height: imageElement.height }}
              >
                <img 
                  src={imageSrc!} 
                  alt="Full Sheet" 
                  className="max-w-none select-none pointer-events-none" 
                  style={{ imageRendering: 'pixelated' }}
                />
                <div 
                  className="absolute inset-0 cursor-crosshair touch-none"
                  onMouseDown={(e) => {
                    if (!imageElement) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.max(0, Math.min(imageElement.width, (e.clientX - rect.left) / cropZoom));
                    const y = Math.max(0, Math.min(imageElement.height, (e.clientY - rect.top) / cropZoom));

                    if (cropRect) {
                      const isInside = x > cropRect.x && x < cropRect.x + cropRect.w && 
                                       y > cropRect.y && y < cropRect.y + cropRect.h;
                      
                      if (isInside) {
                        setActiveHandle('move');
                        return;
                      }
                    }

                    setCropRect({ x, y, w: 0, h: 0 });
                    setIsDrawingNewCrop(true);
                  }}
                  onTouchStart={(e) => {
                    if (!imageElement) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const touch = e.touches[0];
                    const x = Math.max(0, Math.min(imageElement.width, (touch.clientX - rect.left) / cropZoom));
                    const y = Math.max(0, Math.min(imageElement.height, (touch.clientY - rect.top) / cropZoom));

                    if (cropRect) {
                      const isInside = x > cropRect.x && x < cropRect.x + cropRect.w && 
                                       y > cropRect.y && y < cropRect.y + cropRect.h;
                      
                      if (isInside) {
                        setActiveHandle('move');
                        return;
                      }
                    }

                    setCropRect({ x, y, w: 0, h: 0 });
                    setIsDrawingNewCrop(true);
                  }}
                  onMouseMove={(e) => {
                    if (!cropRect || !imageElement) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.max(0, Math.min(imageElement.width, (e.clientX - rect.left) / cropZoom));
                    const y = Math.max(0, Math.min(imageElement.height, (e.clientY - rect.top) / cropZoom));

                    if (isDrawingNewCrop) {
                      setCropRect({ ...cropRect, w: x - cropRect.x, h: y - cropRect.y });
                    } else if (activeHandle) {
                      let newRect = { ...cropRect };
                      if (activeHandle === 'tl') { newRect.w += newRect.x - x; newRect.h += newRect.y - y; newRect.x = x; newRect.y = y; }
                      else if (activeHandle === 'tr') { newRect.w = x - newRect.x; newRect.h += newRect.y - y; newRect.y = y; }
                      else if (activeHandle === 'bl') { newRect.w += newRect.x - x; newRect.h = y - newRect.y; newRect.x = x; }
                      else if (activeHandle === 'br') { newRect.w = x - newRect.x; newRect.h = y - newRect.y; }
                      else if (activeHandle === 'move') {
                        newRect.x = Math.max(0, Math.min(imageElement.width - newRect.w, x - newRect.w / 2));
                        newRect.y = Math.max(0, Math.min(imageElement.height - newRect.h, y - newRect.h / 2));
                      }
                      setCropRect(newRect);
                    }
                  }}
                  onTouchMove={(e) => {
                    if (!cropRect || !imageElement) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const touch = e.touches[0];
                    const x = Math.max(0, Math.min(imageElement.width, (touch.clientX - rect.left) / cropZoom));
                    const y = Math.max(0, Math.min(imageElement.height, (touch.clientY - rect.top) / cropZoom));

                    if (isDrawingNewCrop) {
                      setCropRect({ ...cropRect, w: x - cropRect.x, h: y - cropRect.y });
                    } else if (activeHandle) {
                      let newRect = { ...cropRect };
                      if (activeHandle === 'tl') { newRect.w += newRect.x - x; newRect.h += newRect.y - y; newRect.x = x; newRect.y = y; }
                      else if (activeHandle === 'tr') { newRect.w = x - newRect.x; newRect.h += newRect.y - y; newRect.y = y; }
                      else if (activeHandle === 'bl') { newRect.w += newRect.x - x; newRect.h = y - newRect.y; newRect.x = x; }
                      else if (activeHandle === 'br') { newRect.w = x - newRect.x; newRect.h = y - newRect.y; }
                      else if (activeHandle === 'move') {
                        newRect.x = Math.max(0, Math.min(imageElement.width - newRect.w, x - newRect.w / 2));
                        newRect.y = Math.max(0, Math.min(imageElement.height - newRect.h, y - newRect.h / 2));
                      }
                      setCropRect(newRect);
                    }
                  }}
                  onMouseUp={() => {
                    setActiveHandle(null);
                    setIsDrawingNewCrop(false);
                    if (cropRect) {
                      setCropRect({
                        x: cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x,
                        y: cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y,
                        w: Math.abs(cropRect.w),
                        h: Math.abs(cropRect.h)
                      });
                    }
                  }}
                  onTouchEnd={() => {
                    setActiveHandle(null);
                    setIsDrawingNewCrop(false);
                    if (cropRect) {
                      setCropRect({
                        x: cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x,
                        y: cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y,
                        w: Math.abs(cropRect.w),
                        h: Math.abs(cropRect.h)
                      });
                    }
                  }}
                >
                  {multiCropWindows.map((win, idx) => (
                    <div 
                      key={idx}
                      className="absolute border-2 border-blue-500/50 bg-blue-500/10 pointer-events-none"
                      style={{ 
                        left: win.x, 
                        top: win.y, 
                        width: win.w, 
                        height: win.h 
                      }}
                    />
                  ))}
                  {cropRect && (
                    <div 
                      className="absolute border-2 border-emerald-500 bg-emerald-500/10 pointer-events-none"
                      style={{ 
                        left: Math.min(cropRect.x, cropRect.x + cropRect.w), 
                        top: Math.min(cropRect.y, cropRect.y + cropRect.h), 
                        width: Math.abs(cropRect.w), 
                        height: Math.abs(cropRect.h) 
                      }}
                    >
                      {/* Handles */}
                      {!isDrawingNewCrop && (
                        <>
                          {['tl', 'tr', 'bl', 'br'].map(handle => (
                            <div 
                              key={handle}
                              className="absolute w-6 h-6 bg-white border-2 border-emerald-500 rounded-full cursor-pointer pointer-events-auto shadow-lg flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform"
                              style={{ 
                                left: handle.includes('l') ? 0 : '100%',
                                top: handle.includes('t') ? 0 : '100%',
                                width: 12 / cropZoom,
                                height: 12 / cropZoom,
                              }}
                              onMouseDown={(e) => { 
                                e.stopPropagation(); 
                                setActiveHandle(handle); 
                              }}
                              onTouchStart={(e) => {
                                e.stopPropagation();
                                setActiveHandle(handle);
                              }}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-6">
              <div className="text-xs text-neutral-500">
                {cropRect ? (
                  <span>{t.selection}: {Math.round(Math.abs(cropRect.w))}x{Math.round(Math.abs(cropRect.h))} at ({Math.round(cropRect.x)}, {Math.round(cropRect.y)})</span>
                ) : (
                  <span>{t.clickDragRegion}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setShowCropModal(false);
                    setCropRect(null);
                    setMultiCropWindows([]);
                  }} 
                  className="px-4 py-2 text-neutral-400 hover:text-white font-bold transition-colors text-sm"
                >
                  {t.cancel}
                </button>
                <button
                  disabled={!cropRect || Math.abs(cropRect.w) < 5 || Math.abs(cropRect.h) < 5}
                  onClick={() => {
                    if (cropRect) {
                      const finalX = Math.min(cropRect.x, cropRect.x + cropRect.w);
                      const finalY = Math.min(cropRect.y, cropRect.y + cropRect.h);
                      const finalW = Math.abs(cropRect.w);
                      const finalH = Math.abs(cropRect.h);
                      setMultiCropWindows(prev => [...prev, { x: finalX, y: finalY, w: finalW, h: finalH }]);
                      setCropRect(null);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  Salvar Janela & Extrair Mais
                </button>
                <button 
                  disabled={((!cropRect || Math.abs(cropRect.w) < 5 || Math.abs(cropRect.h) < 5) && multiCropWindows.length === 0)}
                  onClick={() => {
                    if (imageElement) {
                      let allWindows = [...multiCropWindows];
                      if (cropRect && Math.abs(cropRect.w) >= 5 && Math.abs(cropRect.h) >= 5) {
                        const finalX = Math.min(cropRect.x, cropRect.x + cropRect.w);
                        const finalY = Math.min(cropRect.y, cropRect.y + cropRect.h);
                        allWindows.push({ x: finalX, y: finalY, w: Math.abs(cropRect.w), h: Math.abs(cropRect.h) });
                      }
                      
                      if (allWindows.length > 0) {
                        // Stitch all windows vertically with 4px gap
                        const gap = 4;
                        const maxWidth = Math.max(...allWindows.map(w => w.w));
                        const totalHeight = allWindows.reduce((sum, w) => sum + w.h, 0) + gap * Math.max(0, allWindows.length - 1);
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = maxWidth;
                        canvas.height = totalHeight;
                        const ctx = canvas.getContext('2d');
                        
                        if (ctx) {
                          let currentY = 0;
                          const newStitchedWindows: {yStart: number, yEnd: number, id: number}[] = [];
                          for (let i = 0; i < allWindows.length; i++) {
                            const win = allWindows[i];
                            ctx.drawImage(
                              imageElement,
                              win.x, win.y, win.w, win.h,
                              0, currentY, win.w, win.h
                            );
                            newStitchedWindows.push({
                              id: i + 1,
                              yStart: currentY,
                              yEnd: currentY + win.h
                            });
                            currentY += win.h + gap;
                          }
                          
                          setStitchedWindows(newStitchedWindows);
                          const newImgSrc = canvas.toDataURL('image/png');
                          setImageSrc(newImgSrc);
                          setRects([]); // Force redetection
                          setCustomOrder([]);
                          setDisabledIndices(new Set());
                          setFrameDurations({});
                          setSelectedRectIndex(null);
                        }
                      }
                    }
                    setShowCropModal(false);
                    setCropRect(null);
                    setMultiCropWindows([]);
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Concluir Recortes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Frame Selector Modal */}
      {showVideoFrameSelector && videoFrames.length > 0 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-md p-2 md:p-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-7xl h-[95vh] md:h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-neutral-900/50 flex-none">
              <div>
                <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-500" />
                  {language === 'pt' ? 'Suíte de Importação de Vídeo da Arena' : language === 'es' ? 'Suite de Importación de Video' : 'Advanced Video Sprite Import Suite'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {language === 'pt' ? 'Recorte detalhes, remova energia/fundos dinâmicos e alinhe suas animações perfeitamente.' : 'Crop details, remove background and align your animations perfectly.'}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto text-xs">
                <button 
                  onClick={() => setSelectedVideoFrames(new Set(videoFrames.map((_, i) => i)))}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-lg transition-all border border-neutral-700"
                >
                  {t.selectAllFrames}
                </button>
                <button 
                  onClick={() => setSelectedVideoFrames(new Set())}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-lg transition-all border border-neutral-700"
                >
                  {t.deselectAllFrames}
                </button>
              </div>
            </div>

            {/* Split Layout Container */}
            <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[380px,1fr] overflow-hidden min-h-0 bg-neutral-950">
              
              {/* Left Column: Processing Controls & Big Preview */}
              <div className="lg:border-r border-neutral-800 flex flex-col overflow-y-auto max-h-[50vh] lg:max-h-full p-4 space-y-4 bg-neutral-900/40 select-none custom-scrollbar border-b lg:border-b-0">
                
                {/* Big Preview Title & Frame Selector */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    {language === 'pt' ? 'Visualização do Frame' : 'Frame Preview'} #{videoPreviewIndex + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setVideoPreviewIndex(prev => Math.max(0, prev - 1))}
                      disabled={videoPreviewIndex === 0}
                      className="p-1 rounded bg-neutral-800 text-white disabled:opacity-30 hover:bg-neutral-700"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setVideoPreviewIndex(prev => Math.min(videoFrames.length - 1, prev + 1))}
                      disabled={videoPreviewIndex === videoFrames.length - 1}
                      className="p-1 rounded bg-neutral-800 text-white disabled:opacity-30 hover:bg-neutral-700"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Main Big Processed Frame Preview */}
                <div className="aspect-video w-full rounded-lg overflow-hidden border border-neutral-800 relative bg-neutral-950 flex-none h-44">
                  <FrameCanvas
                    frame={videoFrames[videoPreviewIndex]}
                    cropLeft={videoCropLeft}
                    cropRight={videoCropRight}
                    cropTop={videoCropTop}
                    cropBottom={videoCropBottom}
                    chromaEnabled={videoChromaEnabled}
                    chromaColor={videoChromaColor}
                    chromaColor2={videoChromaColor2}
                    chromaColor3={videoChromaColor3}
                    chromaTolerance={videoChromaTolerance}
                    chromaSmoothing={videoChromaSmoothing}
                    pixelateEnabled={videoPixelateEnabled}
                    pixelateSize={videoPixelateSize}
                  />
                  
                  {/* Aspect Ratio Guideline Border overlay for Crop visualization */}
                  <div className="absolute inset-0 border border-emerald-500/20 pointer-events-none z-20" />
                </div>

                {/* Auto Letterbox Remover Button */}
                <button
                  onClick={handleAutoDetectLetterbox}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500/15 to-amber-600/10 hover:from-amber-500/25 hover:to-amber-600/20 text-xs text-amber-400 font-extrabold rounded-lg border border-amber-500/30 transition-all flex items-center justify-center gap-2 shadow-sm animate-pulse-slow active:scale-[0.98]"
                  title="Detecta e preenche automaticamente as tarjas pretas de cinema clássicas de vídeos do YouTube"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {language === 'pt' ? 'REMOVER SUPORTES / TARJAS PRETAS' : 'AUTO-DETECT & CROP LETTERBOX'}
                </button>

                {/* Sizing & Crop Sliders */}
                <div className="space-y-3 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <Crop className="w-3.5 h-3.5" />
                      {language === 'pt' ? 'MÁSCARA DE RECORTE (CROP)' : 'CROP BORDERS'}
                    </span>
                    <button 
                      onClick={() => {
                        setVideoCropLeft(0);
                        setVideoCropRight(0);
                        setVideoCropTop(0);
                        setVideoCropBottom(0);
                      }}
                      className="text-[10px] text-neutral-500 hover:text-white"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Sliders Grid */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-neutral-400">{language === 'pt' ? 'Corte Superior' : 'Crop Top'}</span>
                        <span className="font-mono text-emerald-500">{videoCropTop}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="80" value={videoCropTop}
                        onChange={(e) => setVideoCropTop(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-neutral-400">{language === 'pt' ? 'Corte Inferior' : 'Crop Bottom'}</span>
                        <span className="font-mono text-emerald-500">{videoCropBottom}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="80" value={videoCropBottom}
                        onChange={(e) => setVideoCropBottom(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-neutral-400">{language === 'pt' ? 'Corte Esquerda' : 'Crop Left'}</span>
                        <span className="font-mono text-emerald-500">{videoCropLeft}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="80" value={videoCropLeft}
                        onChange={(e) => setVideoCropLeft(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-neutral-400">{language === 'pt' ? 'Corte Direita' : 'Crop Right'}</span>
                        <span className="font-mono text-emerald-500">{videoCropRight}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="80" value={videoCropRight}
                        onChange={(e) => setVideoCropRight(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Chroma Key / Background Removal */}
                <div className="space-y-3 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/40">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={videoChromaEnabled}
                        onChange={(e) => setVideoChromaEnabled(e.target.checked)}
                        className="rounded bg-neutral-800 border-neutral-700 text-emerald-500 focus:ring-0 w-4 h-4"
                      />
                      <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5" />
                        {language === 'pt' ? 'REMOVER FUNDOS (CHROMA KEY)' : 'CHROMA KEY REMOVAL'}
                      </span>
                    </label>
                  </div>

                  {videoChromaEnabled && (
                    <div className="space-y-3 text-xs animate-in slide-in-from-top-2 duration-200">
                      
                      {/* Color selectors (Multi Color support) */}
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">
                          {language === 'pt' ? 'Cores do Fundo a Extrair (Até 3 para degradês):' : 'Background Colors to Remove (Up to 3 for gradients):'}
                        </span>
                        <div className="flex gap-2 items-center">
                          <label className="flex flex-col items-center gap-1 cursor-pointer">
                            <input 
                              type="color" 
                              value={videoChromaColor}
                              onChange={(e) => setVideoChromaColor(e.target.value)}
                              className="w-8 h-8 rounded-md bg-transparent border-none cursor-pointer"
                            />
                            <span className="text-[9px] font-mono text-neutral-500">1ª Cor</span>
                          </label>

                          <label className="flex flex-col items-center gap-1 cursor-pointer">
                            <input 
                              type="color" 
                              value={videoChromaColor2 || '#000000'}
                              onChange={(e) => setVideoChromaColor2(e.target.value === '#000000' && !videoChromaColor2 ? '#111111' : e.target.value)}
                              className={`w-8 h-8 rounded-md bg-transparent border-none cursor-pointer ${!videoChromaColor2 ? 'border-2 border-dashed border-neutral-700 opacity-40' : ''}`}
                            />
                            <span className="text-[9px] font-mono text-neutral-500">2ª Cor</span>
                          </label>
                          {videoChromaColor2 && (
                            <button 
                              onClick={() => setVideoChromaColor2('')}
                              className="text-[10px] text-red-400 hover:text-red-300 self-center"
                            >
                              X
                            </button>
                          )}

                          <label className="flex flex-col items-center gap-1 cursor-pointer">
                            <input 
                              type="color" 
                              value={videoChromaColor3 || '#000000'}
                              onChange={(e) => setVideoChromaColor3(e.target.value === '#000000' && !videoChromaColor3 ? '#222222' : e.target.value)}
                              className={`w-8 h-8 rounded-md bg-transparent border-none cursor-pointer ${!videoChromaColor3 ? 'border-2 border-dashed border-neutral-700 opacity-40' : ''}`}
                            />
                            <span className="text-[9px] font-mono text-neutral-500">3ª Cor</span>
                          </label>
                          {videoChromaColor3 && (
                            <button 
                              onClick={() => setVideoChromaColor3('')}
                              className="text-[10px] text-red-400 hover:text-red-300 self-center"
                            >
                              X
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tolerance & Smoothing controls */}
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-neutral-400">{t.tolerance || 'Tolerância'}</span>
                          <span className="font-mono text-emerald-500">{videoChromaTolerance}</span>
                        </div>
                        <input 
                          type="range" min="5" max="150" value={videoChromaTolerance}
                          onChange={(e) => setVideoChromaTolerance(Number(e.target.value))}
                          className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-neutral-400">{language === 'pt' ? 'Suavização das Bordas' : 'Edge Smoothing'}</span>
                          <span className="font-mono text-emerald-500">{videoChromaSmoothing}px</span>
                        </div>
                        <input 
                          type="range" min="0" max="25" value={videoChromaSmoothing}
                          onChange={(e) => setVideoChromaSmoothing(Number(e.target.value))}
                          className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Pixel Art Filter */}
                <div className="bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/40 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={videoPixelateEnabled}
                      onChange={(e) => setVideoPixelateEnabled(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-teal-500 focus:ring-0 mt-0.5 w-4 h-4"
                    />
                    <div>
                      <div className="text-sm font-medium text-neutral-200">
                        {language === 'pt' ? 'Filtro Pixel Art' : 'Pixel Art Filter'}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {language === 'pt' ? 'Converte o frame para estética retrô pixelizada.' : 'Converts frame to retro pixelated aesthetic.'}
                      </div>
                    </div>
                  </label>

                  {videoPixelateEnabled && (
                    <div className="pl-6 pt-2">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-neutral-400">{language === 'pt' ? 'Tamanho do Pixel' : 'Pixel Size'}</span>
                        <span className="font-mono text-teal-500">{videoPixelateSize}x</span>
                      </div>
                      <input 
                        type="range" min="2" max="16" value={videoPixelateSize}
                        onChange={(e) => setVideoPixelateSize(Number(e.target.value))}
                        className="w-full accent-teal-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Auto Centering / Motion Normalization */}
                <div className="bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/40 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={videoAutoCenter}
                      onChange={(e) => setVideoAutoCenter(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-emerald-500 focus:ring-0 mt-0.5 w-4 h-4"
                    />
                    <div className="flex flex-col text-xs">
                      <span className="font-black text-emerald-400 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        {language === 'pt' ? 'AUTO-CENTRALIZAR ANIMAÇÃO (ESTÁVEL)' : 'AUTO-CENTER SPRITES'}
                      </span>
                      <span className="text-[10px] text-neutral-500 mt-0.5">
                        {language === 'pt' 
                          ? 'Mapeia a silhueta em cada frame e os centraliza nas células. Elimina tremidas de animação.' 
                          : 'Finds the sprite bounds on each frame and centers them to prevent animation shaking.'
                        }
                      </span>
                    </div>
                  </label>

                  {videoAutoCenter && (
                    <div className="space-y-1.5 pl-6 animate-in slide-in-from-top-1 duration-200 text-xs">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-400">{language === 'pt' ? 'Margem Extra (Respiro do Personagem)' : 'Extra Padding (Breathing Room)'}</span>
                        <span className="font-mono text-emerald-500">{videoAutoCenterPadding}px</span>
                      </div>
                      <input 
                        type="range" min="8" max="150" value={videoAutoCenterPadding}
                        onChange={(e) => setVideoAutoCenterPadding(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                        title={language === 'pt' ? 'Aumente o respiro para golpes/auras grandes, evitando heróis muito cortados' : 'Increase padding for larger actions or auras, avoiding cutoffs'}
                      />
                      <p className="text-[10px] text-neutral-500">
                        {language === 'pt' 
                          ? 'Aumente ao recortar personagens com auras grandes em transformação como Goku para que os limites não fiquem "apertados".' 
                          : 'Increase to let Goku or characters with massive transforming auras breathe inside the cells.'
                        }
                      </p>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Video Frames Grid Selection */}
              <div className="flex flex-col overflow-hidden min-h-0 relative">
                
                {/* Info and Select Help */}
                <div className="p-3 bg-neutral-900 border-b border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 flex-none z-10">
                  <span>
                    {language === 'pt' 
                      ? 'Clique para ver em tela cheia no painel de filtros. Marque/desmarque os frames que deseja.' 
                      : 'Click a frame to inspect/filter on the left panel, toggle selection to choose frames.'
                    }
                  </span>
                  <span className="text-emerald-500 font-extrabold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40 text-[10px]">
                    {selectedVideoFrames.size} / {videoFrames.length} {language === 'pt' ? 'Selecionados' : 'Selected'}
                  </span>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-950 custom-scrollbar min-h-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {videoFrames.map((frame, index) => {
                      const isSelected = selectedVideoFrames.has(index);
                      const isCurrentlyPreviewed = videoPreviewIndex === index;
                      return (
                        <div 
                          key={index}
                          onClick={() => {
                            setVideoPreviewIndex(index);
                          }}
                          className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all border group ${
                            isCurrentlyPreviewed 
                              ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-neutral-950 scale-[1.02] border-emerald-500' 
                              : isSelected
                              ? 'border-emerald-500/30'
                              : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0 border-neutral-800'
                          }`}
                        >
                          <FrameCanvas 
                            frame={frame} 
                            cropLeft={videoCropLeft}
                            cropRight={videoCropRight}
                            cropTop={videoCropTop}
                            cropBottom={videoCropBottom}
                            chromaEnabled={videoChromaEnabled}
                            chromaColor={videoChromaColor}
                            chromaColor2={videoChromaColor2}
                            chromaColor3={videoChromaColor3}
                            chromaTolerance={videoChromaTolerance}
                            chromaSmoothing={videoChromaSmoothing}
                            pixelateEnabled={videoPixelateEnabled}
                            pixelateSize={videoPixelateSize}
                          />
                          
                          {/* Selector Overlay Click Area */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid updating preview just by selecting
                              const next = new Set(selectedVideoFrames);
                              if (isSelected) next.delete(index);
                              else next.add(index);
                              setSelectedVideoFrames(next);
                            }}
                            className="absolute top-2 left-2 z-20 w-6 h-6 rounded-md flex items-center justify-center bg-black/60 border border-white/20 hover:scale-105 active:scale-95 transition-transform"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Square className="w-4 h-4 text-neutral-400" />
                            )}
                          </div>

                          {/* Index Badge */}
                          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-[9px] font-mono text-white px-1.5 py-0.5 rounded-md border border-white/10 z-10 select-none">
                            #{index + 1}
                          </div>

                          {/* Currently Inspecting Indicator */}
                          {isCurrentlyPreviewed && (
                            <div className="absolute top-2 right-2 bg-emerald-500 text-black font-extrabold px-1.5 py-0.5 rounded text-[8px] uppercase z-10 shadow select-none">
                              {language === 'pt' ? 'ANALISANDO' : 'PREVIEW'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="p-4 md:p-5 border-t border-neutral-800 bg-neutral-900/50 flex justify-between items-center flex-none">
              <button 
                onClick={() => {
                  setShowVideoFrameSelector(false);
                  setVideoFrames([]);
                }}
                className="px-5 py-2.5 text-xs font-bold text-neutral-400 hover:bg-neutral-800 rounded-xl transition-all border border-transparent hover:border-neutral-700"
              >
                {t.cancel}
              </button>
              <button 
                onClick={() => setShowImportOptionsModal(true)}
                disabled={selectedVideoFrames.size === 0}
                className="px-8 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {t.confirmSelection 
                  ? t.confirmSelection.replace('{n}', selectedVideoFrames.size.toString()) 
                  : `Confirmar Seleção (${selectedVideoFrames.size})`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opções de Importação de Vídeo Modal */}
      {showImportOptionsModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl text-left space-y-6">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4">
                <HelpCircle className="w-6 h-6 text-emerald-500 animate-bounce" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                {language === 'pt' ? 'Configurar Formato de Importação' : 'Configure Import Format'}
              </h2>
              <p className="text-neutral-400 text-xs md:text-sm">
                {language === 'pt' 
                  ? 'Como você deseja organizar os frames selecionados na mesa de trabalho?' 
                  : 'How do you want to organize the selected frames in your workspace?'}
              </p>
            </div>

            <div className="space-y-4">
              {/* Option 1: Whole frames (Preservar frames inteiros) */}
              <button
                id="import-option-whole"
                onClick={() => {
                  setPreventAutoSlicing(true);
                  setShowImportOptionsModal(false);
                  assembleSelectedFrames(true);
                }}
                className="w-full p-4 bg-neutral-850 hover:bg-neutral-800 hover:border-emerald-500/40 text-left rounded-2xl transition-all border-2 border-transparent group flex gap-3.5 items-start cursor-pointer"
              >
                <div className="mt-0.5 p-2 bg-emerald-500/10 text-emerald-500 rounded-lg group-hover:bg-emerald-500 group-hover:text-black transition-colors shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                    {language === 'pt' ? '🎬 Preservar Frames Inteiros' : '🎬 Keep Whole Frames'}
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] rounded font-black whitespace-nowrap">
                      {language === 'pt' ? 'RECOMENDADO' : 'RECOMMENDED'}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-neutral-400">
                    {language === 'pt' 
                      ? 'Mantém cada frame do vídeo inteiro como uma célula de animação na grade. Sem nenhum fatiamento interno do desenho. Ideal para animações sequenciais de personagens com auras (como Goku), cutscenes ou introduções de vídeo.' 
                      : 'Each video frame is kept fully intact inside a regular grid. No internal drawing slices will be detected. Ideal for character animations with big effects/auras (like Goku), cutscenes, or movie-like intros.'}
                  </p>
                </div>
              </button>

              {/* Option 2: Auto slice island detection (Separar/recortar sprites) */}
              <button
                id="import-option-slice"
                onClick={() => {
                  setPreventAutoSlicing(false);
                  setShowImportOptionsModal(false);
                  assembleSelectedFrames(false);
                }}
                className="w-full p-4 bg-neutral-850 hover:bg-neutral-800 hover:border-amber-500/40 text-left rounded-2xl transition-all border-2 border-transparent group flex gap-3.5 items-start cursor-pointer"
              >
                <div className="mt-0.5 p-2 bg-amber-500/10 text-amber-500 rounded-lg group-hover:bg-amber-500 group-hover:text-black transition-colors shrink-0">
                  <Scissors className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                    {language === 'pt' ? '✂️ Recorte Automático (Tentar Isolar Sprites)' : '✂️ Auto-Slicing (Attempt to Isolate Sprites)'}
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-neutral-400">
                    {language === 'pt' 
                      ? 'Tenta fatiar automaticamente o personagem separando membros ou pequenos elementos soltos em cada frame pela silhueta de transparência. ⚠️ ALERTA: Dependendo do vídeo ou tamanho, o recorte pode falhar, cortar pedaços do Goku ou separar auras de golpes incorretamente.' 
                      : 'Attempts to auto-detect and isolate small separate drawings or elements inside each frame by transparency silhouette. ⚠️ WARNING: Large dynamic animations, glowing effects or raw size can cause wrong, incomplete or shattered cutting.'}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                id="import-option-cancel"
                onClick={() => setShowImportOptionsModal(false)}
                className="w-full px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-xl font-bold text-xs transition-all border border-neutral-750 text-center cursor-pointer"
              >
                {language === 'pt' ? 'Voltar para os Quadros' : 'Go Back to Frames'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar: Settings */}
      <div className={`w-full lg:w-80 border-b lg:border-r border-neutral-800 bg-neutral-900 flex-col shrink-0 lg:max-h-full overflow-y-auto ${mobileTab === 'settings' ? 'flex flex-1 max-h-full' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Maximize className="w-5 h-5 text-emerald-500" />
              Slicer.io
            </h1>
            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded border border-amber-500/20">BETA</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => {
                const email = "micheandre224@gmail.com";
                const subject = encodeURIComponent("Slicer.io Beta Feedback");
                window.location.href = `mailto:${email}?subject=${subject}`;
              }}
              className="p-2 text-neutral-500 hover:text-white transition-colors"
              title="Feedback"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                setTutorialStep(0);
                setShowTutorial(true);
              }}
              className="p-2 text-neutral-500 hover:text-white transition-colors"
              title={t.tutorial.start}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowUpdateModal(true)}
              className="p-2 text-amber-500 hover:text-amber-400 transition-colors animate-pulse"
              title="Novidades (Atualizações)"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Upload */}
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-neutral-500">{t.source}</label>
            <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-neutral-700 rounded-lg cursor-pointer hover:border-emerald-500 hover:bg-neutral-800/50 transition-colors">
              <div className="flex flex-col items-center gap-1">
                <ImageIcon className="w-5 h-5 text-neutral-400" />
                <span className="text-xs">{t.uploadImage}</span>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
            <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-neutral-700 rounded-lg cursor-pointer hover:border-emerald-500 hover:bg-neutral-800/50 transition-colors">
              <div className="flex flex-col items-center gap-1">
                <Play className="w-5 h-5 text-neutral-400" />
                <span className="text-xs">{t.uploadVideo}</span>
              </div>
              <input type="file" className="hidden" accept="video/*" onChange={handleVideoUpload} />
            </label>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button 
                onClick={() => setShowCropModal(true)}
                disabled={!imageSrc}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all disabled:opacity-50 border border-neutral-700"
                title={t.cropSpriteSheet}
              >
                <Crop className="w-3 h-3 text-amber-500" />
                {t.cropSpriteSheet}
              </button>
              <button 
                onClick={handleSaveProject}
                disabled={!imageSrc}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all disabled:opacity-50 border border-neutral-700"
                title={t.saveProject}
              >
                <Save className="w-3 h-3 text-emerald-500" />
                {t.saveProject}
              </button>
              <label className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all cursor-pointer border border-neutral-700">
                <FolderOpen className="w-3 h-3 text-blue-500" />
                {t.openProject}
                <input type="file" className="hidden" accept=".slicer" onChange={handleLoadProject} />
              </label>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs uppercase tracking-wider text-neutral-500">{t.settings}</label>
              {smallRectsCount > 0 && (
                <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20" title="Small rects found (width or height < 10px). They are highlighted in orange.">
                  <AlertTriangle className="w-3 h-3" />
                  {smallRectsCount} small
                </div>
              )}
            </div>
            
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs">{t.backgroundColor}</span>
                <button 
                  onClick={() => setIsPickingColor(!isPickingColor)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${isPickingColor ? 'bg-emerald-500 text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                >
                  <MousePointer2 className="w-3 h-3" />
                  {t.pick}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded border border-neutral-700 relative overflow-hidden bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')]" 
                >
                  <div className="absolute inset-0" style={{ backgroundColor: `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3]/255})` }} />
                </div>
                <span className="text-xs text-neutral-500">rgba({bgColor.join(', ')})</span>
              </div>
            </div>

            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>{t.tolerance}</span>
                <span>{tolerance}</span>
              </label>
              <input type="range" min="0" max="100" value={tolerance} onChange={e => setTolerance(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>

            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>{t.mergeDistance}</span>
                <span>{mergeDist}px</span>
              </label>
              <input type="range" min="0" max="20" value={mergeDist} onChange={e => setMergeDist(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>

            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>{t.minSize}</span>
                <span>{minSize}px</span>
              </label>
              <input type="range" min="1" max="50" value={minSize} onChange={e => setMinSize(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>

            <div>
              <button 
                onClick={() => {
                  setBgColor([0, 0, 0, 0]);
                  setTolerance(10);
                  setMergeDist(2);
                  setMinSize(4);
                  setDisabledIndices(new Set());
                  if (rects.length > 0) {
                    setCustomOrder(rects.map((_, i) => i));
                  }
                }}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs py-2 rounded transition-colors"
              >
                {t.resetSettings}
              </button>
            </div>
            
            <div className="flex gap-2">
                <button
                onClick={() => {
                  setIsPickingColor(false);
                  setIsMagicWandMode(!isMagicWandMode);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-bold transition-all text-xs border ${
                  isMagicWandMode 
                    ? 'bg-[#a259ff] border-[#a259ff] text-white shadow-lg shadow-[#a259ff]/20' 
                    : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                }`}
                >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Magic Wand</span>
              </button>
              
              <button
                onClick={extractPalette}
                disabled={isDetecting || !imageElement}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-bold transition-all text-xs border bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                <Palette className="w-3.5 h-3.5" />
                <span>Extract Palette</span>
              </button>
            </div>
          </div>

          {/* Slicing Method / Método de Fatiamento */}
          <div className="space-y-2 pt-4 border-t border-neutral-800">
            <label className="block text-xs uppercase tracking-wider text-neutral-500">
              {language === 'pt' ? 'Método de Fatiamento' : 'Slicing Method'}
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-950 rounded-lg border border-neutral-850">
              <button
                onClick={() => {
                  setPreventAutoSlicing(false);
                  // Trigger redetection instantly if image loaded
                  setSkipAutoDetection(false);
                  // Subtle state tick to run useEffect again
                  setTolerance(t => t + 1 > 150 ? t - 1 : t + 1);
                }}
                className={`py-2 px-2 text-[10px] font-black rounded-md transition-all flex flex-col items-center justify-center gap-1 leading-snug text-center cursor-pointer ${
                  !preventAutoSlicing 
                    ? 'bg-emerald-500 text-black shadow-md' 
                    : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
                title={language === 'pt' ? 'Isola cada desenho/membro separadamente (ideal para sprites fáceis)' : 'Isolate each sprite island individually'}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>{language === 'pt' ? 'Auto-Recorte' : 'Auto-Slicing'}</span>
              </button>
              <button
                onClick={() => {
                  setPreventAutoSlicing(true);
                }}
                className={`py-2 px-2 text-[10px] font-black rounded-md transition-all flex flex-col items-center justify-center gap-1 leading-snug text-center cursor-pointer ${
                  preventAutoSlicing 
                    ? 'bg-emerald-500 text-black shadow-md' 
                    : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
                title={language === 'pt' ? 'Preserva frames inteiros do vídeo em uma grade regular de células sem fatiar' : 'Preserve full frames as sequential cells'}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{language === 'pt' ? 'Frames Inteiros' : 'Whole Frames'}</span>
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-neutral-500">
              {preventAutoSlicing 
                ? (language === 'pt' 
                  ? '🎯 Frames Inteiros Ativo: Recomendado para vídeos e animações contínuas. Impede fatiamentos indesejados no Goku/personagem.' 
                  : '🎯 Whole Frames Active: Keep cells 100% intact. Recommended for dynamic action sequences and cinematic cutscenes.')
                : (language === 'pt' 
                  ? '✂️ Auto-Recorte Ativo: Identifica silhuetas e divide os desenhos pelas transparências de cor.' 
                  : '✂️ Auto-Slicing Active: Groups and cuts distinct shapes by color transparency bounds.')
              }
            </p>
          </div>

          {/* Detection */}
          <div className="space-y-4 pt-4 border-t border-neutral-800">
            <label className="block text-xs uppercase tracking-wider text-neutral-500">{t.autoDetectSprites}</label>
            <button 
              onClick={() => {
                if (imageElement) {
                  detectBackgroundColor(imageElement);
                  setTolerance(15); 
                  setMergeDist(2);
                  setMinSize(4);
                  
                  // If after a short delay we still have only 1 large sprite, try to increase tolerance
                  setTimeout(() => {
                    if (rects.length === 1) {
                      const r = rects[0];
                      if (r.w * r.h > imageElement.width * imageElement.height * 0.8) {
                        setTolerance(30);
                      }
                    }
                  }, 500);
                }
              }}
              className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2 rounded text-[10px] font-bold transition-all"
            >
              <Wand2 className="w-3 h-3" />
              {t.autoDetectSprites}
            </button>
          </div>

          {/* Batch Actions */}
          {rects.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-neutral-800">
              <label className="block text-xs uppercase tracking-wider text-neutral-500">{t.batchActions}</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleSelectAll}
                  className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all border border-neutral-700"
                >
                  <CheckSquare className="w-3 h-3 text-emerald-500" />
                  {t.selectAll}
                </button>
                <button 
                  onClick={handleDeselectAll}
                  className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all border border-neutral-700"
                >
                  <Square className="w-3 h-3 text-red-500" />
                  {t.deselectAll}
                </button>
                <button 
                  onClick={handleInvertSelection}
                  className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all border border-neutral-700"
                >
                  <RefreshCw className="w-3 h-3 text-blue-500" />
                  {t.invertSelection}
                </button>
                <button 
                  onClick={handleAutoCrop}
                  className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all border border-neutral-700"
                >
                  <Scissors className="w-3 h-3 text-amber-500" />
                  {t.autoCrop}
                </button>
                {smallRectsCount > 0 && (
                  <button 
                    onClick={() => {
                      pushToHistory();
                      const next = new Set(disabledIndices);
                      rects.forEach((r, i) => {
                        if (r.w < 10 || r.h < 10) {
                          next.delete(i); // Enable small rects
                        } else {
                          next.add(i); // Disable others
                        }
                      });
                      setDisabledIndices(next);
                    }}
                    className="col-span-2 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 py-2 rounded text-[10px] font-bold transition-all border border-amber-500/20"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {language === 'pt' ? `Selecionar Apenas Recortes Pequenos (${smallRectsCount})` : language === 'es' ? `Seleccionar Solo Recortes Pequeños (${smallRectsCount})` : `Select Only Small Rects (${smallRectsCount})`}
                  </button>
                )}
                <button 
                  onClick={handleRemoveDisabled}
                  className="col-span-2 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded text-[10px] font-bold transition-all border border-neutral-700"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  {t.removeDisabled}
                </button>
              </div>
              <button 
                onClick={handleClearAll}
                className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 py-2 rounded text-[10px] font-bold transition-all border border-red-900/30"
              >
                <Trash2 className="w-3 h-3" />
                {t.clearAll}
              </button>
            </div>
          )}

          {selectedRectIndex !== null && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">{t.gridSplit} ({t.row} {selectedRectIndex})</span>
                  <span className="text-[8px] text-blue-300/60 uppercase tracking-widest">{t.realTimePreview}</span>
                </div>
                <button onClick={() => setSelectedRectIndex(null)} className="text-neutral-500 hover:text-white">×</button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                    <span>{t.columns}</span>
                    <span className="font-bold text-blue-400">{gridCols}</span>
                  </div>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={() => setGridCols(Math.max(1, gridCols - 1))} className="w-6 h-6 bg-neutral-800 rounded text-xs">-</button>
                    <input 
                      type="range" min="1" max="20" value={gridCols} 
                      onChange={e => setGridCols(Number(e.target.value))}
                      className="flex-1 accent-blue-500 h-1"
                    />
                    <button onClick={() => setGridCols(gridCols + 1)} className="w-6 h-6 bg-neutral-800 rounded text-xs">+</button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                    <span>{t.rows}</span>
                    <span className="font-bold text-blue-400">{gridRows}</span>
                  </div>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={() => setGridRows(Math.max(1, gridRows - 1))} className="w-6 h-6 bg-neutral-800 rounded text-xs">-</button>
                    <input 
                      type="range" min="1" max="20" value={gridRows} 
                      onChange={e => setGridRows(Number(e.target.value))}
                      className="flex-1 accent-blue-500 h-1"
                    />
                    <button onClick={() => setGridRows(gridRows + 1)} className="w-6 h-6 bg-neutral-800 rounded text-xs">+</button>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <button 
                  onClick={handleGridSplit}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] pointer-events-auto"
                >
                  {t.splitInto.replace('{n}', (gridCols * gridRows).toString())}
                </button>
              </div>

              <div className="pt-1">
                <div className="text-[10px] text-neutral-500 mb-2 italic">
                  {t.smartSplitDesc}
                </div>
                <button 
                  onClick={handleSmartSplit}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98] pointer-events-auto flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-3 h-3" />
                  {t.smartSplit}
                </button>
              </div>

              <div className="pt-1">
                <div className="text-[10px] text-neutral-500 mb-2 italic">
                  Ou use o Corte de Efeitos (VFX) para separar faíscas e brilhos:
                </div>
                <button 
                  onClick={handleVfxSplit}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98] pointer-events-auto flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3 h-3" />
                  {t.typeEffect} Split
                </button>
              </div>

              <div className="pt-1">
                <div className="text-[10px] text-neutral-500 mb-2 italic">
                  {t.refineSelectionDesc}
                </div>
                <button 
                  onClick={handleRefineSelection}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-amber-900/20 active:scale-[0.98] pointer-events-auto flex items-center justify-center gap-2"
                >
                  <Maximize className="w-3 h-3" />
                  {t.refineSelection}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Rights */}
        <div className="p-6 border-t border-neutral-800 mt-auto bg-neutral-900/50">
          <p className="text-[10px] leading-relaxed text-neutral-500 text-center">
            © 2026 Sprite Slicer • {t.footer.createdBy} <span className="text-neutral-400 font-bold">Michel André L. Da Silva</span>
            <br />
            <span className="text-emerald-500/80">{t.footer.philosophy}</span>
            <br />
            {t.footer.support}
          </p>
        </div>
      </div>

      {/* Main Area: Canvas with Split Layout */}
      <div className={`flex-1 flex bg-neutral-950 relative overflow-hidden ${mobileTab === 'workspace' ? 'flex flex-col lg:flex-row' : 'hidden lg:flex lg:flex-row'}`}>
        
        {/* Left Pane: Sprite Mode / Canvas Editor */}
        <div className={`flex-grow flex flex-col relative overflow-hidden h-full transition-all duration-500 ease-in-out ${isCombatMode ? 'hidden' : 'w-full h-full'}`}>
        {/* Smart Tips Button */}
        {showSmartTips && (
          <div className="absolute top-20 left-4 z-50">
            <button 
              onClick={() => setShowSmartTipsModal(true)}
              className="bg-neutral-800/80 backdrop-blur text-neutral-300 p-2 rounded-full shadow-lg border border-neutral-700 hover:bg-neutral-700 transition-colors"
              title={t.help}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Smart Tips Modal */}
        {showSmartTipsModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">{t.help}</h3>
              <div className="space-y-4 text-sm text-neutral-300">
                {rects.length === 1 && <p>• {t.hints.singleLargeSprite}</p>}
                {rects.length > 50 && <p>• {t.hints.multipleCharacters}</p>}
                {rects.length === 0 && bgColor[3] > 200 && <p>• {t.hints.transparencyIssue}</p>}
                {customOrder.length > 1 && customOrder.every((val, index) => val === index) && <p>• {t.hints.reorderFrames}</p>}
                {rects.length <= 50 && rects.length > 0 && bgColor[3] <= 200 && customOrder.length <= 1 && <p>{t.noTipsAvailable}</p>}
              </div>
              <button 
                onClick={() => setShowSmartTipsModal(false)}
                className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-bold"
              >
                {t.close}
              </button>
            </div>
          </div>
        )}

        {/* Video Frames Pagination Panel */}
        {importedVideoFrameUrls.length > videoWindowSize && preventAutoSlicing && (
          <div className="absolute top-16 left-4 z-20 bg-neutral-900/95 backdrop-blur-md border border-emerald-500/30 p-3 rounded-2xl flex flex-col gap-2.5 pointer-events-auto shadow-2xl max-w-sm sm:max-w-md md:max-w-xl transition-all">
            <div className="flex justify-between items-center bg-neutral-950/40 p-1.5 rounded-xl border border-neutral-800/40">
              <div className="flex flex-col text-left">
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  🎬 {language === 'pt' ? 'MESA DE TRABALHO DIGITAL (VIDEO)' : 'DIGITAL WORKSPACE (VIDEO)'}
                </span>
                <span className="text-[9px] text-neutral-400 font-semibold font-mono">
                  {language === 'pt'
                    ? `Filtrando página de ${videoWindowSize} frames de um total de ${importedVideoFrameUrls.length}`
                    : `Filtering page of ${videoWindowSize} frames out of ${importedVideoFrameUrls.length}`}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-neutral-500 font-mono">{language === 'pt' ? 'Tamanhos:' : 'Sizes:'}</span>
                <select
                  value={videoWindowSize}
                  onChange={(e) => {
                    const newSize = Number(e.target.value);
                    setVideoWindowSize(newSize);
                    setTimeout(() => {
                      assembleSelectedFrames(true, 0, importedVideoFrameUrls);
                    }, 50);
                  }}
                  className="bg-neutral-800 text-white text-[9px] font-bold rounded px-1.5 py-0.5 border border-neutral-700 outline-none"
                >
                  <option value={10}>10</option>
                  <option value={12}>12</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1.5 items-center">
              {Array.from({ length: Math.ceil(importedVideoFrameUrls.length / videoWindowSize) }).map((_, wIdx) => {
                const isActive = currentVideoWindow === wIdx;
                const startFrame = wIdx * videoWindowSize + 1;
                const endFrame = Math.min(importedVideoFrameUrls.length, (wIdx + 1) * videoWindowSize);
                return (
                  <button
                    key={wIdx}
                    onClick={() => {
                      assembleSelectedFrames(true, wIdx, importedVideoFrameUrls);
                    }}
                    className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all border cursor-pointer flex flex-col items-center min-w-[65px] ${
                      isActive
                        ? 'bg-emerald-500 text-black border-transparent shadow-lg shadow-emerald-500/20 active:scale-95'
                        : 'bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border-neutral-800 hover:border-neutral-700 active:scale-95'
                    }`}
                  >
                    <span>{language === 'pt' ? `Janela ${wIdx + 1}` : `Window ${wIdx + 1}`}</span>
                    <span className={`text-[8px] font-mono mt-0.5 ${isActive ? 'text-black/60 font-black' : 'text-neutral-500'}`}>
                      {startFrame}-{endFrame}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
          <div className="bg-neutral-900/80 backdrop-blur border border-neutral-800 px-3 py-1.5 rounded text-xs flex items-center gap-2 pointer-events-auto">
            {isDetecting ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> {t.detecting}</>
            ) : (
              <>{t.spritesDetected.replace('{active}', playableRects.length.toString()).replace('{total}', rects.length.toString())}</>
            )}
          </div>

          {/* Zoom/Pan Controls */}
          {imageSrc && (
            <div className="flex gap-2 bg-neutral-900/80 backdrop-blur border border-neutral-800 p-2 rounded pointer-events-auto shadow-xl">
               {isCombatMode && (
                 <>
                   <button 
                     onClick={() => { setIsCombatMode(!isCombatMode); }}
                     className={`px-3 py-2.5 rounded-lg flex items-center gap-2 font-bold text-xs tracking-wider uppercase transition-all duration-200 ${isCombatMode ? 'bg-gradient-to-r from-red-500 to-amber-500 text-white shadow-lg animate-pulse border border-red-400' : 'bg-neutral-850 hover:bg-neutral-800 text-amber-500 border border-amber-500/20'}`}
                     title="Testar Combate e Movesets em Tempo Real"
                   >
                     <Zap className="w-4 h-4 fill-current text-current animate-bounce" />
                     {isCombatMode ? 'Sair do Moveset' : 'Moveset Edit'}
                   </button>
                   <div className="w-px bg-neutral-800 mx-1" />
                 </>
               )}
               <button 
                onClick={() => { setIsPanMode(!isPanMode); setIsManualSelecting(false); }}
                className={`p-2.5 rounded-lg transition-colors ${isPanMode ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                title={t.panTool}
              >
                <Move className="w-5 h-5" />
              </button>
              <button 
                onClick={() => { setIsManualSelecting(!isManualSelecting); setIsPanMode(false); }}
                className={`p-2.5 rounded-lg transition-colors ${isManualSelecting ? 'bg-blue-500 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                title={t.manualSelectionTool}
              >
                <MousePointer2 className="w-5 h-5" />
              </button>
              <div className="w-px bg-neutral-800 mx-1" />
              <div className="flex gap-1">
                <button 
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="p-2.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition-colors"
                  title={`${t.undo} (Ctrl+Z)`}
                >
                  <Undo2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="p-2.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition-colors"
                  title={`${t.redo} (Ctrl+Y)`}
                >
                  <Redo2 className="w-5 h-5" />
                </button>
              </div>
              <div className="w-px bg-neutral-800 mx-1" />
              <button 
                onClick={() => { setScale(1); setPan({x: 0, y: 0}); }}
                className="px-2 text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                title={t.resetZoom}
              >
                1:1
              </button>
              <button 
                onClick={() => setScale(s => Math.max(0.1, s - 0.25))}
                className="p-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title={t.zoomOut}
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-xs flex items-center justify-center w-12 text-neutral-400 font-bold">
                {Math.round(scale * 100)}%
              </span>
              <button 
                onClick={() => setScale(s => Math.min(10, s + 0.25))}
                className="p-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title={t.zoomIn}
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div 
          className={`flex-1 overflow-hidden bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')] ${isPanMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()} // Prevent context menu for right-click panning
        >
          {false ? (
            <div id="battle-arena-mobile" className="h-[calc(100vh-230px)] lg:h-full flex flex-col p-4 bg-neutral-950 overflow-y-auto select-none">
              
              {/* Header Status HUD */}
              <div className="grid grid-cols-2 gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-xl shadow-xl mb-4 relative overflow-hidden">
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

                {/* Player Character Column */}
                <div className="relative z-10 flex flex-col">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center font-bold text-emerald-400 font-sans shadow-sm text-sm">
                      HP
                    </div>
                    <div>
                      <span className="text-white font-bold text-sm tracking-wide block uppercase font-sans">
                        {characterName || 'Herói'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">PLAYER (VOCÊ)</span>
                    </div>
                  </div>
                  {/* Health Bar */}
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-full h-5 overflow-hidden p-0.5 relative shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${isPlayerHurt ? 'bg-red-400 animate-ping' : 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}
                      style={{ width: `${playerHp}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow font-mono">
                      {playerHp}/100
                    </span>
                  </div>
                </div>

                {/* Dummy/Combat Target Column */}
                <div className="relative z-10 flex flex-col text-right">
                  <div className="flex items-center justify-end gap-2 mb-1.5">
                    <div>
                      <span className="text-white font-bold text-sm tracking-wide block uppercase font-sans">
                        Boneco de Treino
                      </span>
                      <span className="text-[10px] text-red-400 font-mono">ALVO (BOT COMBATE)</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-center font-bold text-red-500 font-sans shadow-sm text-sm">
                      BOT
                    </div>
                  </div>
                  {/* Health Bar */}
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-full h-5 overflow-hidden p-0.5 relative shadow-inner">
                    <div 
                      className={`h-full rounded-full ml-auto transition-all duration-300 ${isDummyHurt ? 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-gradient-to-l from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
                      style={{ width: `${dummyHp}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow font-mono">
                      {dummyHp}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Combat Stage Arena */}
              <div className="relative flex-1 min-h-[220px] rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 flex items-center justify-center overflow-hidden shadow-2xl mb-4">
                {/* Cyber Combat Arena Background Assets Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[size:100%_4px] opacity-20 pointer-events-none" />
                <div className="absolute bottom-6 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-neutral-900 to-neutral-950 border-t border-neutral-800" />

                {/* STAGE HUD OVERLAY GUIDES */}
                <span className="absolute top-3 left-3 text-[9px] font-mono text-neutral-500 tracking-wider">
                  ARENA DE COMBATE SENSORIAL DA IA v1.1
                </span>
                <span className="absolute top-3 right-3 text-[9px] font-mono text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  MOTOR ATIVO (LATÊNCIA ZERO)
                </span>

                {/* HIT EFFECT POPUP OVERLAY */}
                {showVfx && (
                  <div className="absolute z-30 left-[75%] top-[35%] transform -translate-x-1/2 -translate-y-1/2 animate-bounce scale-150 pointer-events-none">
                    <span className="px-3 py-1.5 rounded bg-amber-500 border-2 border-white text-neutral-950 font-black text-sm uppercase shadow-[0_0_15px_rgba(245,158,11,0.6)] font-sans tracking-wide">
                      {showVfx}
                    </span>
                  </div>
                )}

                {/* Dual Fighters Layout */}
                <div className="w-full max-w-lg flex justify-between px-12 relative z-20 items-end pb-4">
                  
                  {/* Left Side: Playable Sprite Frame */}
                  <div className="flex flex-col items-center">
                    {/* Character Label Details */}
                    <div className="mb-2 text-center">
                      <span className="px-2 py-0.5 rounded bg-neutral-950/80 border border-neutral-800 text-[9px] text-emerald-400 font-mono">
                        {(sandboxActiveRow === 'none' ? 'IDLE' : rowNames[sandboxActiveRow] || rowTypes[sandboxActiveRow] || `ACAO ${sandboxActiveRow}`).toUpperCase()}
                      </span>
                    </div>

                    {/* Frame Visual Wrapper */}
                    <div className={`p-4 rounded-xl flex items-center justify-center transition-all duration-150 select-none ${isPlayerHurt ? 'bg-red-950/50 border-2 border-red-500/80 scale-95 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-shake' : 'bg-neutral-950/20 hover:bg-neutral-950/40'}`}>
                      <canvas 
                        ref={sandboxCanvasRef}
                        className="transform scale-[2.5] origin-bottom transition-transform object-contain shadow-sm"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                  </div>

                  {/* VS Middle Badge */}
                  <div className="h-28 flex flex-col items-center justify-center">
                    <span className="text-xl font-black italic bg-gradient-to-r from-red-500 via-amber-400 to-red-500 bg-clip-text text-transparent px-3 py-1 border border-neutral-800 rounded bg-neutral-950/50 scale-90 font-mono tracking-widest shadow-inner">
                      VS
                    </span>
                  </div>

                  {/* Right Side: Damage Target Training Dummy */}
                  <div className="flex flex-col items-center">
                    <div className="mb-2 text-center">
                      <span className="px-2 py-0.5 rounded bg-neutral-950/80 border border-neutral-800 text-[9px] text-red-400 font-mono">
                        {isDummyHurt ? 'AGUENTANDO IMPACTO' : 'BONECO DE TESTES'}
                      </span>
                    </div>

                    <div className={`p-4 rounded-xl flex items-center justify-center transition-all duration-150 select-none ${isDummyHurt ? 'bg-red-950/40 border-2 border-red-500 scale-95 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-shake' : 'bg-neutral-900 border border-neutral-800 text-neutral-500'}`}>
                      <div className="w-16 h-20 flex flex-col justify-center items-center gap-1.5">
                        <Palette className={`w-8 h-8 transition-transform duration-100 ${isDummyHurt ? 'scale-125 text-red-500 rotate-12' : 'text-neutral-500 hover:scale-110 hover:text-neutral-400'}`} />
                        <span className={`text-[10px] font-mono tracking-wide ${isDummyHurt ? 'text-red-400 font-bold' : 'text-neutral-400'}`}>
                          {isDummyHurt ? 'AI DAMAGED!' : 'DUMMY CLONE'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Combat Logs Console & Triggers Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left Side: Real-time Interactive Triggers */}
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span>Mapeamento de Combos Ativos</span>
                    <span className="text-[10px] text-amber-500 font-normal normal-case">Clique para testar / Segure para editar frames!</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto font-sans">
                    {rows.map((row, index) => {
                      const type = rowTypes[index] || 'custom';
                      const key = rowKeys[index] || 'none';
                      const actionLabel = getActionName(index);
                      
                      return (
                        <div key={index} className="relative group">
                          <button
                            onPointerDown={() => {
                              isLongPressActive.current = false;
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = setTimeout(() => {
                                isLongPressActive.current = true;
                                setLongPressRowIndex(index);
                                if (navigator.vibrate) {
                                  try { navigator.vibrate(40); } catch (err) {}
                                }
                              }, 600); // 600ms hold time is perfect
                            }}
                            onPointerUp={(e) => {
                              if (isLongPressActive.current) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onPointerLeave={() => {
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onPointerCancel={() => {
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onClick={(e) => {
                              if (isLongPressActive.current) {
                                e.preventDefault();
                                return;
                              }
                              setSandboxActiveRow(index);
                              setSandboxFrame(0);
                              setArenaLogs(l => [`👊 [CLIQUE] Ativou "${actionLabel}"`, ...l.slice(0, 15)]);
                            }}
                            className={`w-full p-2 pr-6 rounded-lg border text-left flex flex-col justify-between transition-all leading-tight ${sandboxActiveRow === index ? 'bg-amber-500/10 border-amber-500 text-white' : 'bg-neutral-950 border-neutral-850 hover:bg-neutral-900 hover:border-neutral-800 text-neutral-300'}`}
                          >
                            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 font-semibold block truncate">
                              {actionLabel}
                            </span>
                            <div className="flex items-center justify-between mt-1 w-full">
                              <span className="text-[9px] text-neutral-400">Tipo: <span className="font-mono text-white text-[8px]">{type}</span></span>
                              <span className="px-1 py-0.2 rounded bg-neutral-800 border border-neutral-700 text-[8px] text-neutral-300 font-black uppercase font-mono animate-pulse">
                                TECLA: {key}
                              </span>
                            </div>
                          </button>

                          {/* Float Pencil Rename Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingComboRowIndex(index);
                              setEditingComboRowName(getActionName(index));
                            }}
                            className="absolute top-1 right-1 p-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 transition-colors z-20 shadow border border-neutral-800"
                            title="Editar Nome do Moveset"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>

                          {/* Inline Rename Input Overlay */}
                          {editingComboRowIndex === index && (
                            <div className="absolute inset-0 z-30 bg-neutral-950 border-2 border-amber-500 rounded-lg p-1.5 flex items-center justify-between gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <input
                                type="text"
                                value={editingComboRowName}
                                onChange={(e) => setEditingComboRowName(e.target.value.replace(/[<>"/\\;]/g, '').slice(0, 32))}
                                className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 text-white rounded px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:border-amber-500 font-bold"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    pushToHistory();
                                    setRowNames(prev => ({ ...prev, [index]: editingComboRowName }));
                                    setEditingComboRowIndex(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingComboRowIndex(null);
                                  }
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    pushToHistory();
                                    setRowNames(prev => ({ ...prev, [index]: editingComboRowName }));
                                    setEditingComboRowIndex(null);
                                  }}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingComboRowIndex(null);
                                  }}
                                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px]"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {longPressRowIndex === index && (
                            <div className="absolute inset-0 z-30 bg-neutral-950 border-2 border-amber-500 rounded-lg p-1 flex items-center justify-between gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <span className="text-[9px] text-amber-400 font-bold px-1 uppercase font-mono">Editar?</span>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setMobileEditModalRow(index);
                                    setMobileEditSelectedFrame(0);
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[9px] font-black uppercase tracking-wider shadow whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Editar' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteRow(index, true);
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/30 text-[9px] font-black uppercase tracking-wider shadow whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Excluir' : 'Delete'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px] font-bold whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Cancelar' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-1 pt-2 border-t border-neutral-850 grid grid-cols-2 gap-2 text-center md:text-left">
                    <button
                      onClick={() => setDummyAutoAttack(!dummyAutoAttack)}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 w-full ${dummyAutoAttack ? 'bg-red-500/10 border-red-500 text-red-500 hover:bg-neutral-900' : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dummyAutoAttack ? 'bg-red-500 animate-ping' : 'bg-neutral-500'}`} />
                      {dummyAutoAttack ? 'Parar Contra-Ataque' : 'Ativar Contra-Ataque'}
                    </button>
                    <button
                      onClick={() => {
                        setPlayerHp(100);
                        setDummyHp(100);
                        setArenaLogs(l => [`🔄 [ARENA] Vida de todos os combatentes foi regenerada.`, ...l.slice(0, 15)]);
                      }}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 hover:border-neutral-750 hover:text-white transition-colors"
                    >
                      Regenerar Tudo
                    </button>
                  </div>

                  <div className="mt-2 text-center md:text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setMovesetRowIndex(0);
                        setMovesetType('idle');
                        setShowCreateMovesetModal(true);
                      }}
                      className="w-full py-2.5 px-3 text-[11px] font-black rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/15 transition-all font-mono uppercase tracking-wider h-9"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Criar Moveset
                    </button>
                  </div>
                </div>

                {/* Right Side: Real-time Arena Combat Logs Console */}
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Console de logs de combate</span>
                    <button 
                      onClick={() => setArenaLogs([])}
                      className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors uppercase font-mono"
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="flex-1 min-h-[100px] max-h-[150px] overflow-y-auto bg-neutral-950 border border-neutral-850 p-2 rounded-lg flex flex-col gap-1.5 font-mono text-[10px]">
                    {arenaLogs.length === 0 ? (
                      <span className="text-neutral-600 italic block m-auto text-center py-6">
                        Pressione as teclas (Z, X, C, V, etc.) ou clique em botões para ver o log em tempo real.
                      </span>
                    ) : (
                      arenaLogs.map((log, i) => (
                        <div 
                          key={i} 
                          className={`pb-1 border-b border-neutral-900/60 transition-all ${log.includes('⚔️') ? 'text-amber-400 font-bold' : log.includes('🏆') ? 'text-emerald-400 font-bold' : log.includes('💀') ? 'text-red-500 font-bold' : log.includes('Contra-Ataque') ? 'text-red-400' : 'text-neutral-400'}`}
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Engine Export Guides & Integrations Block */}
              <div className="mt-4 bg-neutral-900/40 border border-neutral-850 p-4 rounded-xl flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      📦 Integrar Moveset Completo no Jogo
                    </span>
                    <span className="text-xs text-neutral-400">
                      Gera organizador de pastas por ação, arquivo JSON estrutural de combate e script C# de movimentação pronto para Unity/Godot.
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadMovesetZip}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 shrink-0 shadow-lg border border-emerald-500/30 w-full md:w-auto justify-center"
                  >
                    <Download className="w-4 h-4" />
                    Baixar Pack Completo de Combate
                  </button>
                </div>
                
                <div className="border-t border-neutral-800/80 pt-3 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                      ✂️ Baixar Linha de Sprite Isolada
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Baixe apenas uma única linha/animação específica para atualizar seu jogo de forma rápida sem mexer no restante.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setDownloadRowIndex(0);
                      setShowDownloadRowModal(true);
                    }}
                    className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white font-bold text-xs uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 shrink-0 border border-neutral-700 w-full md:w-auto justify-center"
                  >
                    <Layers className="w-4 h-4 text-amber-500 animate-pulse" />
                    Escolher Linha para Baixar
                  </button>
                </div>
              </div>

            </div>
          ) : imageSrc ? (
            <div 
              style={{ 
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                width: 'max-content',
                height: 'max-content',
                transition: isPanning ? 'none' : 'transform 0.1s ease-out'
              }}
            >
              <canvas 
                ref={canvasRef} 
                onClick={handleCanvasClick}
                onMouseDown={(e) => {
                  if (isPickingColor) handleCanvasClick(e);
                  else handleCanvasMouseDown(e);
                }}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onTouchStart={(e) => {
                  if (isPickingColor) handleCanvasClick(e);
                  else handleCanvasMouseDown(e);
                }}
                onTouchMove={handleCanvasMouseMove}
                onTouchEnd={handleCanvasMouseUp}
                className={`shadow-2xl ${isPickingColor || isManualSelecting ? 'cursor-crosshair' : ''}`}
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-4">
              <Upload className="w-12 h-12 opacity-50" />
              <p>{t.uploadToBegin}</p>
            </div>
          )}
          
          {/* Recovery UI for missing image element when data is present */}
          {((imageSrc && !imageElement) || (rects.length > 0 && !imageElement)) && (
            <div className="absolute inset-0 z-40 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
              <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
                {imageError ? <AlertCircle className="w-12 h-12 text-red-500 animate-pulse" /> : <AlertTriangle className="w-12 h-12 text-amber-500 animate-pulse" />}
              </div>
              <div className="space-y-2 mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest font-mono">
                  {imageError ? (language === 'pt' ? 'Erro de Carregamento' : 'Loading Error') : (language === 'pt' ? 'Recuperação de Emergência' : 'Emergency Recovery')}
                </h3>
                <p className="text-[10px] max-w-xs mx-auto leading-relaxed text-neutral-400 font-sans">
                  {imageError || (language === 'pt' 
                    ? 'Seus recortes foram recuperados, mas o arquivo de imagem falhou no carregamento automático (pode ser muito grande). Por favor, re-selecione a imagem original para continuar.' 
                    : 'Your frames were recovered, but the image file failed to load automatically (it might be too large). Please re-select the original image to continue.')}
                </p>
              </div>
              <label className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl cursor-pointer transition-all shadow-lg active:scale-95 flex items-center gap-2 text-[10px] uppercase font-mono tracking-wider border border-emerald-400/20">
                <Upload className="w-4 h-4" />
                <span>{language === 'pt' ? 'Vincular Spritesheet' : 'Re-link Spritesheet'}</span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processImageFile(file);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Close Left Pane */}
        </div>

        {/* Right Pane: Arena View (Movesets Edit) */}
        <div className={`bg-neutral-950 overflow-y-auto select-none transition-all duration-500 ease-in-out flex flex-col ${isCombatMode ? 'w-full h-full opacity-100 p-4 md:p-6' : 'w-0 h-0 opacity-0 pointer-events-none p-0 overflow-hidden hidden'}`}>
          {isCombatMode && (
            <div id="battle-arena-desktop" className="h-full flex flex-col select-none">
              
              {/* Return to Studio Back Button */}
              <div className="flex items-center justify-between mb-4 gap-4 flex-none border-b border-neutral-800 pb-3">
                <button
                  onClick={() => setIsCombatMode(false)}
                  className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-850 px-3 py-2 rounded-lg border border-neutral-800 transition-colors shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao Studio
                </button>
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                  <Zap className="w-3 h-3 animate-pulse" />
                  Arena de Combate Ativa
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-xl shadow-xl mb-4 relative overflow-hidden">
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

                {/* Player Character Column */}
                <div className="relative z-10 flex flex-col">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center font-bold text-emerald-400 font-sans shadow-sm text-sm">
                      HP
                    </div>
                    <div>
                      <span className="text-white font-bold text-sm tracking-wide block uppercase font-sans">
                        {characterName || 'Herói'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">PLAYER (VOCÊ)</span>
                    </div>
                  </div>
                  {/* Health Bar */}
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-full h-5 overflow-hidden p-0.5 relative shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${isPlayerHurt ? 'bg-red-400 animate-ping' : 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}
                      style={{ width: `${playerHp}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow font-mono">
                      {playerHp}/100
                    </span>
                  </div>
                </div>

                {/* Dummy/Combat Target Column */}
                <div className="relative z-10 flex flex-col text-right">
                  <div className="flex items-center justify-end gap-2 mb-1.5">
                    <div>
                      <span className="text-white font-bold text-sm tracking-wide block uppercase font-sans">
                        Boneco de Treino
                      </span>
                      <span className="text-[10px] text-red-400 font-mono">ALVO (BOT COMBATE)</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-center font-bold text-red-500 font-sans shadow-sm text-sm">
                      BOT
                    </div>
                  </div>
                  {/* Health Bar */}
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-full h-5 overflow-hidden p-0.5 relative shadow-inner">
                    <div 
                      className={`h-full rounded-full ml-auto transition-all duration-300 ${isDummyHurt ? 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-gradient-to-l from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
                      style={{ width: `${dummyHp}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow font-mono">
                      {dummyHp}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Combat Stage Arena */}
              <div className="relative flex-1 min-h-[220px] rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 flex items-center justify-center overflow-hidden shadow-2xl mb-4">
                {/* Cyber Combat Arena Background Assets Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[size:100%_4px] opacity-20 pointer-events-none" />
                <div className="absolute bottom-6 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-neutral-900 to-neutral-950 border-t border-neutral-800" />

                {/* STAGE HUD OVERLAY GUIDES */}
                <span className="absolute top-3 left-3 text-[9px] font-mono text-neutral-500 tracking-wider">
                  ARENA DE COMBATE SENSORIAL DA IA v1.1
                </span>
                <span className="absolute top-3 right-3 text-[9px] font-mono text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  MOTOR ATIVO (LATÊNCIA ZERO)
                </span>

                {/* HIT EFFECT POPUP OVERLAY */}
                {showVfx && (
                  <div className="absolute z-30 left-[75%] top-[35%] transform -translate-x-1/2 -translate-y-1/2 animate-bounce scale-150 pointer-events-none">
                    <span className="px-3 py-1.5 rounded bg-amber-500 border-2 border-white text-neutral-950 font-black text-sm uppercase shadow-[0_0_15px_rgba(245,158,11,0.6)] font-sans tracking-wide">
                      {showVfx}
                    </span>
                  </div>
                )}

                {/* Dual Fighters Layout */}
                <div className="w-full max-w-lg flex justify-between px-12 relative z-20 items-end pb-4">
                  
                  {/* Left Side: Playable Sprite Frame */}
                  <div className="flex flex-col items-center">
                    {/* Character Label Details */}
                    <div className="mb-2 text-center">
                      <span className="px-2 py-0.5 rounded bg-neutral-950/80 border border-neutral-800 text-[9px] text-emerald-400 font-mono">
                        {(sandboxActiveRow === 'none' ? 'IDLE' : rowNames[sandboxActiveRow] || rowTypes[sandboxActiveRow] || `ACAO ${sandboxActiveRow}`).toUpperCase()}
                      </span>
                    </div>

                    {/* Frame Visual Wrapper */}
                    <div className={`p-4 rounded-xl flex items-center justify-center transition-all duration-150 select-none ${isPlayerHurt ? 'bg-red-950/50 border-2 border-red-500/80 scale-95 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-shake' : 'bg-neutral-950/20 hover:bg-neutral-950/40'}`}>
                      <canvas 
                        ref={sandboxCanvasRef}
                        className="transform scale-[2.5] origin-bottom transition-transform object-contain shadow-sm"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                  </div>

                  {/* VS Middle Badge */}
                  <div className="h-28 flex flex-col items-center justify-center">
                    <span className="text-xl font-black italic bg-gradient-to-r from-red-500 via-amber-400 to-red-500 bg-clip-text text-transparent px-3 py-1 border border-neutral-800 rounded bg-neutral-950/50 scale-90 font-mono tracking-widest shadow-inner">
                      VS
                    </span>
                  </div>

                  {/* Right Side: Damage Target Training Dummy */}
                  <div className="flex flex-col items-center">
                    <div className="mb-2 text-center">
                      <span className="px-2 py-0.5 rounded bg-neutral-950/80 border border-neutral-800 text-[9px] text-red-400 font-mono">
                        {isDummyHurt ? 'AGUENTANDO IMPACTO' : 'BONECO DE TESTES'}
                      </span>
                    </div>

                    <div className={`p-4 rounded-xl flex items-center justify-center transition-all duration-150 select-none ${isDummyHurt ? 'bg-red-950/40 border-2 border-red-500 scale-95 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-shake' : 'bg-neutral-900 border border-neutral-800 text-neutral-500'}`}>
                      <div className="w-16 h-20 flex flex-col justify-center items-center gap-1.5">
                        <Palette className={`w-8 h-8 transition-transform duration-100 ${isDummyHurt ? 'scale-125 text-red-500 rotate-12' : 'text-neutral-500 hover:scale-110 hover:text-neutral-400'}`} />
                        <span className={`text-[10px] font-mono tracking-wide ${isDummyHurt ? 'text-red-400 font-bold' : 'text-neutral-400'}`}>
                          {isDummyHurt ? 'AI DAMAGED!' : 'DUMMY CLONE'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Combat Logs Console & Triggers Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left Side: Interactive Triggers */}
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span>Mapeamento de Combos Ativos</span>
                    <span className="text-[10px] text-amber-500 font-normal normal-case">Clique para testar / Segure para editar frames!</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto font-sans">
                    {rows.map((row, index) => {
                      const type = rowTypes[index] || 'custom';
                      const key = rowKeys[index] || 'none';
                      const actionLabel = getActionName(index);
                      
                      return (
                        <div key={index} className="relative group">
                          <button
                            onPointerDown={() => {
                              isLongPressActive.current = false;
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = setTimeout(() => {
                                isLongPressActive.current = true;
                                setLongPressRowIndex(index);
                                if (navigator.vibrate) {
                                  try { navigator.vibrate(40); } catch (err) {}
                                }
                              }, 600);
                            }}
                            onPointerUp={(e) => {
                              if (isLongPressActive.current) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onPointerLeave={() => {
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onPointerCancel={() => {
                              if (longPressTimerRef.current) {
                                clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onClick={(e) => {
                              if (isLongPressActive.current) {
                                e.preventDefault();
                                return;
                              }
                              setSandboxActiveRow(index);
                              setSandboxFrame(0);
                              setArenaLogs(l => [`👊 [CLIQUE] Ativou "${actionLabel}"`, ...l.slice(0, 15)]);
                            }}
                            className={`w-full p-2 pr-6 rounded-lg border text-left flex flex-col justify-between transition-all leading-tight ${sandboxActiveRow === index ? 'bg-amber-500/10 border-amber-500 text-white' : 'bg-neutral-950 border-neutral-850 hover:bg-neutral-900 hover:border-neutral-800 text-neutral-300'}`}
                          >
                            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 font-semibold block truncate">
                              {actionLabel}
                            </span>
                            <div className="flex items-center justify-between mt-1 w-full">
                              <span className="text-[9px] text-neutral-400">Tipo: <span className="font-mono text-white text-[8px]">{type}</span></span>
                              <span className="px-1 py-0.2 rounded bg-neutral-800 border border-neutral-700 text-[8px] text-neutral-300 font-black uppercase font-mono animate-pulse">
                                TECLA: {key}
                              </span>
                            </div>
                          </button>

                          {/* Float Pencil Rename Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingComboRowIndex(index);
                              setEditingComboRowName(getActionName(index));
                            }}
                            className="absolute top-1 right-1 p-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 transition-colors z-20 shadow border border-neutral-800"
                            title="Editar Nome do Moveset"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>

                          {/* Inline Rename Input Overlay */}
                          {editingComboRowIndex === index && (
                            <div className="absolute inset-0 z-30 bg-neutral-950 border-2 border-amber-500 rounded-lg p-1.5 flex items-center justify-between gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <input
                                type="text"
                                value={editingComboRowName}
                                onChange={(e) => setEditingComboRowName(e.target.value.replace(/[<>"/\\;]/g, '').slice(0, 32))}
                                className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 text-white rounded px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:border-amber-500 font-bold"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    pushToHistory();
                                    setRowNames(prev => ({ ...prev, [index]: editingComboRowName }));
                                    setEditingComboRowIndex(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingComboRowIndex(null);
                                  }
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    pushToHistory();
                                    setRowNames(prev => ({ ...prev, [index]: editingComboRowName }));
                                    setEditingComboRowIndex(null);
                                  }}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingComboRowIndex(null);
                                  }}
                                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px]"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {longPressRowIndex === index && (
                            <div className="absolute inset-0 z-30 bg-neutral-950 border-2 border-amber-500 rounded-lg p-1 flex items-center justify-between gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <span className="text-[9px] text-amber-400 font-bold px-1 uppercase font-mono">Editar?</span>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setMobileEditModalRow(index);
                                    setMobileEditSelectedFrame(0);
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[9px] font-black uppercase tracking-wider shadow whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Editar' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteRow(index, true);
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/30 text-[9px] font-black uppercase tracking-wider shadow whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Excluir' : 'Delete'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setLongPressRowIndex(null);
                                    isLongPressActive.current = false;
                                  }}
                                  className="px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px] font-bold whitespace-nowrap"
                                >
                                  {language === 'pt' ? 'Cancelar' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-1 pt-2 border-t border-neutral-850 grid grid-cols-2 gap-2 text-center md:text-left">
                    <button
                      onClick={() => setDummyAutoAttack(!dummyAutoAttack)}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 w-full ${dummyAutoAttack ? 'bg-red-500/10 border-red-500 text-red-500 hover:bg-neutral-900' : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dummyAutoAttack ? 'bg-red-500 animate-ping' : 'bg-neutral-500'}`} />
                      {dummyAutoAttack ? 'Parar Contra-Ataque' : 'Ativar Contra-Ataque'}
                    </button>
                    <button
                      onClick={() => {
                        setPlayerHp(100);
                        setDummyHp(100);
                        setArenaLogs(l => [`🔄 [ARENA] Vida de todos os combatentes foi regenerada.`, ...l.slice(0, 15)]);
                      }}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 hover:border-neutral-750 hover:text-white transition-colors"
                    >
                      Regenerar Tudo
                    </button>
                  </div>

                  <div className="mt-2 text-center md:text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setMovesetRowIndex(0);
                        setMovesetType('idle');
                        setShowCreateMovesetModal(true);
                      }}
                      className="w-full py-2.5 px-3 text-[11px] font-black rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/15 transition-all font-mono uppercase tracking-wider h-9"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Criar Moveset
                    </button>
                  </div>
                </div>

                {/* Right Side: Real-time Arena Combat Logs Console */}
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Console de logs de combate</span>
                    <button 
                      onClick={() => setArenaLogs([])}
                      className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors uppercase font-mono"
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="flex-1 min-h-[100px] max-h-[150px] overflow-y-auto bg-neutral-950 border border-neutral-850 p-2 rounded-lg flex flex-col gap-1.5 font-mono text-[10px]">
                    {arenaLogs.length === 0 ? (
                      <span className="text-neutral-600 italic block m-auto text-center py-6">
                        Pressione as teclas (Z, X, C, V, etc.) ou clique em botões para ver o log em tempo real.
                      </span>
                    ) : (
                      arenaLogs.map((log, i) => (
                        <div 
                          key={i} 
                          className={`pb-1 border-b border-neutral-900/60 transition-all ${log.includes('⚔️') ? 'text-amber-400 font-bold' : log.includes('🏆') ? 'text-emerald-400 font-bold' : log.includes('💀') ? 'text-red-500 font-bold' : log.includes('Contra-Ataque') ? 'text-red-400' : 'text-neutral-400'}`}
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Engine Export Guides & Integrations Block */}
              <div className="mt-4 bg-neutral-900/40 border border-neutral-850 p-4 rounded-xl flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5 text-left font-sans">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      📦 Integrar Moveset Completo no Jogo
                    </span>
                    <span className="text-xs text-neutral-400">
                      Gera organizador de pastas por ação, arquivo JSON estrutural de combate e script C# de movimentação pronto para Unity/Godot.
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadMovesetZip}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 shrink-0 shadow-lg border border-emerald-500/30 w-full md:w-auto justify-center"
                  >
                    <Download className="w-4 h-4" />
                    Baixar Pack Completo de Combate
                  </button>
                </div>
                
                <div className="border-t border-neutral-800/80 pt-3 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5 text-left font-sans">
                    <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5 font-sans">
                      ✂️ Baixar Linha de Sprite Isolada
                    </span>
                    <span className="text-[11px] text-neutral-400 font-sans">
                      Baixe apenas uma única linha/animação específica para atualizar seu jogo de forma rápida sem mexer no restante.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setDownloadRowIndex(0);
                      setShowDownloadRowModal(true);
                    }}
                    className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white font-bold text-xs uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 shrink-0 border border-neutral-700 w-full md:w-auto justify-center"
                  >
                    <Layers className="w-4 h-4 text-amber-500 animate-pulse" />
                    Escolher Linha para Baixar
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar: Preview & Export */}
      <div className={`w-full lg:w-80 border-t lg:border-l border-neutral-800 bg-neutral-900 flex-col shrink-0 lg:max-h-full overflow-y-auto ${isCombatMode ? 'hidden' : (mobileTab === 'export' ? 'flex flex-1 max-h-full' : 'hidden lg:flex')}`}>
        <div className="p-4 space-y-4 border-b border-neutral-800">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">{t.backgroundColor}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => imageElement && detectBackgroundColor(imageElement)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-[10px] font-bold border border-emerald-500/20"
                  title={t.autoDetectBg}
                >
                  <Wand2 className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setShowMask(!showMask)}
                  className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${showMask ? 'bg-magenta-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                  style={showMask ? { backgroundColor: '#ff00ff' } : {}}
                >
                  {showMask ? t.hideMask : t.showMask}
                </button>
                <div 
                  className="w-4 h-4 rounded border border-neutral-700" 
                  style={{ backgroundColor: `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3]/255})` }}
                />
                <button 
                  onClick={() => setIsPickingColor(!isPickingColor)}
                  className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${isPickingColor ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                >
                  {isPickingColor ? t.clickOnImage : t.pickColor}
                </button>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 text-neutral-400">
                <span>{t.tolerance}</span>
                <span>{tolerance}</span>
              </div>
              <input 
                type="range" min="1" max="150" value={tolerance} 
                onChange={(e) => setTolerance(parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[10px] mb-1 text-neutral-500">
                  <span>{t.mergeDistance}</span>
                  <span>{mergeDist}px</span>
                </div>
                <input 
                  type="range" min="0" max="20" value={mergeDist} 
                  onChange={(e) => setMergeDist(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1 text-neutral-500">
                  <span>{t.minSize}</span>
                  <span>{minSize}px</span>
                </div>
                <input 
                  type="range" min="1" max="50" value={minSize} 
                  onChange={(e) => setMinSize(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">{t.animationPreview}</h2>
        </div>
        
        <div className="p-4 border-b border-neutral-800 flex flex-col items-center justify-center min-h-[280px] relative overflow-hidden bg-neutral-950">
          {/* Preview Background Layer */}
          <div className={`absolute inset-0 z-0 ${
            previewBg === 'checker' ? "bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')]" : 
            previewBg === 'white' ? "bg-white" :
            previewBg === 'black' ? "bg-black" :
            previewBg === 'green' ? "bg-[#00ff00]" :
            "bg-[#ff00ff]"
          }`} />
          
          {(() => {
            const currentRect = playableRects[currentFrame];
            const zoomFactor = animationZoom === 'fit' ? null : Number(animationZoom.replace('x', ''));
            return (
              <canvas 
                ref={previewCanvasRef} 
                className="relative z-10 transition-all duration-150" 
                style={{ 
                  imageRendering: 'pixelated', 
                  maxWidth: '90%',
                  maxHeight: '220px',
                  objectFit: 'contain',
                  width: zoomFactor && currentRect ? `${currentRect.w * zoomFactor}px` : undefined,
                  height: zoomFactor && currentRect ? `${currentRect.h * zoomFactor}px` : undefined,
                  mixBlendMode: blendMode === 'screen' ? 'screen' : 'normal'
                }} 
              />
            );
          })()}
          
          {/* Zoom Selector Control Bar */}
          <div className="absolute bottom-2 left-2 z-20 flex bg-black/60 p-1 rounded-lg backdrop-blur-sm border border-white/10 gap-1 items-center">
            <span className="text-[9px] text-neutral-400 font-bold px-1 uppercase tracking-wider hidden sm:inline">Zoom:</span>
            {(['fit', '1x', '2x', '3x', '4x', '5x'] as const).map((z) => (
              <button
                key={z}
                onClick={() => setAnimationZoom(z)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border transition-all ${
                  animationZoom === z 
                    ? 'bg-emerald-500 text-black border-emerald-400' 
                    : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:bg-neutral-700'
                }`}
              >
                {z === 'fit' ? (language === 'pt' ? 'Ajustar' : 'Fit') : z.toUpperCase()}
              </button>
            ))}
          </div>
          
          {/* Preview BG Switcher */}
          <div className="absolute top-2 right-2 z-20 flex flex-col gap-2">
            <div className="flex gap-1 bg-black/50 p-1 rounded-lg backdrop-blur-sm border border-white/10">
              {(['checker', 'white', 'black', 'green', 'magenta'] as const).map((bg) => (
                <button
                  key={bg}
                  onClick={() => setPreviewBg(bg)}
                  className={`w-4 h-4 rounded-sm border ${previewBg === bg ? 'border-emerald-500 scale-110' : 'border-white/20'} transition-all`}
                  style={{ 
                    background: bg === 'checker' ? "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')" :
                                bg === 'white' ? '#fff' :
                                bg === 'black' ? '#000' :
                                bg === 'green' ? '#00ff00' : '#ff00ff'
                  }}
                  title={t[bg as keyof typeof t] as string}
                />
              ))}
            </div>
            
            <button 
              onClick={() => setOnionSkin(!onionSkin)}
              className={`flex items-center justify-center gap-2 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${onionSkin ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/50 text-neutral-400 border-white/10 hover:text-white'}`}
              title={t.onionSkin}
            >
              <Layers className="w-3 h-3" />
              {t.onionSkin}
            </button>

            <button 
              onClick={() => setBlendMode(prev => prev === 'normal' ? 'screen' : 'normal')}
              className={`flex items-center justify-center gap-2 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${blendMode === 'screen' ? 'bg-purple-500 text-white border-purple-400' : 'bg-black/50 text-neutral-400 border-white/10 hover:text-white'}`}
              title="VFX Blend Mode (Screen)"
            >
              <Sparkles className="w-3 h-3" />
              {blendMode === 'screen' ? 'VFX ON' : 'VFX OFF'}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 border-b border-neutral-800">
          {importedVideoFrameUrls.length > 0 && preventAutoSlicing && (
            <div className="flex gap-1 p-1 bg-neutral-950/60 rounded-xl border border-neutral-800/40 w-full mb-3 select-none">
              <button
                onClick={() => {
                  setPreviewAllVideoFrames(false);
                  setCurrentFrame(0);
                }}
                className={`flex-1 py-2 text-center text-[10px] font-black rounded-lg transition-all border cursor-pointer ${
                  !previewAllVideoFrames
                    ? 'bg-emerald-500 text-black border-transparent shadow shadow-emerald-500/20'
                    : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
                }`}
              >
                {language === 'pt' ? 'PÁGINA ATUAL' : 'CURRENT PAGE'}
              </button>
              <button
                onClick={() => {
                  setPreviewAllVideoFrames(true);
                  setCurrentFrame(0);
                }}
                className={`flex-1 py-1.5 text-center text-[10px] font-black rounded-lg transition-all border cursor-pointer flex items-center justify-center gap-1 ${
                  previewAllVideoFrames
                    ? 'bg-emerald-500 text-black border-transparent shadow shadow-emerald-500/20'
                    : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
                }`}
              >
                🎬 {language === 'pt' ? 'VÍDEO COMPLETO' : 'FULL VIDEO'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
              <button 
                onClick={() => setCurrentFrame(prev => prev > 0 ? prev - 1 : animationFramesInfo.length - 1)}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                disabled={animationFramesInfo.length === 0}
                title={t.prevFrame}
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/20 cursor-pointer"
                disabled={animationFramesInfo.length === 0}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {isPlaying ? t.pause : t.play}
              </button>
              <button 
                onClick={() => setCurrentFrame(prev => (prev + 1) % animationFramesInfo.length)}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                disabled={animationFramesInfo.length === 0}
                title={t.nextFrame}
              >
                <SkipForward className="w-5 h-5" />
              </button>
              <div className="text-xs text-neutral-400 bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800 whitespace-nowrap font-mono">
                {animationFramesInfo.length > 0 ? (currentFrameRef.current % animationFramesInfo.length) + 1 : 0} / {animationFramesInfo.length}
              </div>
            </div>

          {animationFramesInfo.length > 0 && (
            <div className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
              <div className="flex flex-col">
                <span className="text-xs text-neutral-400">{t.frameDuration}</span>
                <span className="text-[10px] text-neutral-500">
                  {((frameDurations[customOrder.filter(idx => !disabledIndices.has(idx))[currentFrame]] || 1) * animationSpeed).toFixed(2)}s
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const rectIndex = customOrder.filter(idx => !disabledIndices.has(idx))[currentFrame];
                    const currentMult = frameDurations[rectIndex] || 1;
                    if (currentMult > 0.5) {
                      setFrameDurations(prev => ({ ...prev, [rectIndex]: currentMult - 0.5 }));
                      pushToHistory();
                    }
                  }}
                  className="w-6 h-6 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                >
                  -
                </button>
                <span className="text-sm font-bold w-8 text-center">
                  {frameDurations[customOrder.filter(idx => !disabledIndices.has(idx))[currentFrame]] || 1}x
                </span>
                <button 
                  onClick={() => {
                    const rectIndex = customOrder.filter(idx => !disabledIndices.has(idx))[currentFrame];
                    const currentMult = frameDurations[rectIndex] || 1;
                    setFrameDurations(prev => ({ ...prev, [rectIndex]: currentMult + 0.5 }));
                    pushToHistory();
                  }}
                  className="w-6 h-6 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="flex justify-between text-xs mb-1">
              <span>{t.speed}</span>
              <span>{animationSpeed.toFixed(2)}s</span>
            </label>
            <input 
              type="range" min="0.01" max="0.5" step="0.01" 
              value={animationSpeed} 
              onChange={e => setAnimationSpeed(Number(e.target.value))} 
              className="w-full accent-emerald-500" 
            />
          </div>

          <div>
            <label className="block text-xs mb-1">{t.animationName}</label>
            <input 
              type="text" 
              value={animationName}
              onChange={handleAnimationNameChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {rows.length > 1 && (
            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>{t.selectRow}</span>
                <span>{selectedRow === 'all' ? t.allRows : `${t.row} ${Number(selectedRow) + 1}`}</span>
              </label>
              <select 
                value={selectedRow} 
                onChange={e => setSelectedRow(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{t.allRows}</option>
                {rows.map((row, i) => (
                  <option key={i} value={i}>{t.row} {i + 1} ({row.length} {t.frames.toLowerCase()})</option>
                ))}
              </select>
            </div>
          )}

          {rects.length > 0 && (
            <div className="p-3 bg-neutral-900/50 rounded border border-neutral-800 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-bold text-neutral-300">
                  {selectedRow === 'all' ? t.rowSettings : (rows.length === 1 ? t.rowSettings : `${t.rowSettings} (${Number(selectedRow) + 1})`)}
                </h3>
              </div>
              
              <div>
                <label className="block text-xs mb-1 text-neutral-400">{t.animType}</label>
                <select 
                  value={selectedRow === 'all' ? (rowTypes['all'] || 'custom') : (rowTypes[rows.length === 1 ? 0 : Number(selectedRow)] || 'custom')}
                  onChange={e => {
                    const type = e.target.value;
                    const rowIndex = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
                    setRowTypes(prev => ({ ...prev, [rowIndex]: type }));
                    
                    if (['run', 'idle', 'attack'].includes(type)) {
                      setRowPivots(prev => ({ ...prev, [rowIndex]: 'bottom' }));
                    } else if (['jump', 'roll', 'hurt'].includes(type)) {
                      setRowPivots(prev => ({ ...prev, [rowIndex]: 'center' }));
                    }
                    
                    if (type !== 'custom') {
                      setRowNames(prev => {
                        const currentName = prev[rowIndex as number] || '';
                        const defaultNames = ['idle', 'run', 'jump', 'roll', 'attack', 'hurt', 'effect', ''];
                        if (defaultNames.includes(currentName)) {
                           return { ...prev, [rowIndex]: type };
                        }
                        return prev;
                      });
                    }
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="custom">{t.typeCustom}</option>
                  <option value="idle">{t.typeIdle}</option>
                  <option value="run">{t.typeRun}</option>
                  <option value="jump">{t.typeJump}</option>
                  <option value="roll">{t.typeRoll}</option>
                  <option value="attack">{t.typeAttack}</option>
                  <option value="hurt">{t.typeHurt}</option>
                  <option value="effect">{t.typeEffect}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1 text-neutral-400">{t.characterName}</label>
                <input 
                  type="text" 
                  value={characterName}
                  onChange={e => setCharacterName(e.target.value)}
                  placeholder="Ex: Sonic, Mario..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-neutral-400">{t.rowName}</label>
                <input 
                  type="text" 
                  value={selectedRow === 'all' ? (rowNames['all' as any] || '') : (rowNames[rows.length === 1 ? 0 : Number(selectedRow)] || '')}
                  onChange={e => {
                    const rowIndex = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
                    setRowNames(prev => ({ ...prev, [rowIndex]: e.target.value }));
                  }}
                  placeholder={selectedRow === 'all' ? animationName : (rows.length === 1 ? animationName : `${animationName}_row${Number(selectedRow) + 1}`)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">{t.pivotY}</label>
                <select 
                  value={selectedRow === 'all' ? (rowPivots['all' as any] || 'center') : (rowPivots[rows.length === 1 ? 0 : Number(selectedRow)] || 'center')}
                  onChange={e => {
                    const rowIndex = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
                    setRowPivots(prev => ({ ...prev, [rowIndex]: e.target.value as 'center' | 'bottom' }));
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="center">{t.pivotCenter}</option>
                  <option value="bottom">{t.pivotBottom}</option>
                </select>
              </div>

              {/* Pixel Art Stylization (Studio Tab) */}
              <div className="bg-neutral-800/40 p-2.5 rounded-lg border border-neutral-700/30 space-y-2 mt-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={selectedRow === 'all' ? (rowPixelateEnabled['all' as any] || false) : (rowPixelateEnabled[rows.length === 1 ? 0 : Number(selectedRow)] || false)}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      const rowIndex = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
                      setRowPixelateEnabled(prev => ({ ...prev, [rowIndex]: enabled }));
                      if (enabled && !rowPixelateSize[rowIndex]) {
                        setRowPixelateSize(prev => ({ ...prev, [rowIndex]: 4 }));
                      }
                      pushToHistory();
                    }}
                    className="rounded bg-neutral-950 border-neutral-800 text-teal-500 focus:ring-0 mt-0.5 w-4 h-4"
                  />
                  <div>
                    <div className="text-[11px] font-bold text-neutral-200">
                      {language === 'pt' ? 'Estilização Pixel Art' : 'Pixel Art Styling'}
                    </div>
                    <div className="text-[9px] text-neutral-500 mt-0.5">
                      {language === 'pt' ? 'Converte esta linha para estética retrô.' : 'Converts this line to retro aesthetic.'}
                    </div>
                  </div>
                </label>

                {(selectedRow === 'all' ? (rowPixelateEnabled['all' as any]) : (rowPixelateEnabled[rows.length === 1 ? 0 : Number(selectedRow)])) && (
                  <div className="pl-6 pt-1">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-neutral-400">{language === 'pt' ? 'Tamanho do Pixel' : 'Pixel Size'}</span>
                      <span className="font-mono text-teal-500">{selectedRow === 'all' ? (rowPixelateSize['all' as any] || 4) : (rowPixelateSize[rows.length === 1 ? 0 : Number(selectedRow)] || 4)}x</span>
                    </div>
                    <input 
                      type="range" min="2" max="12" value={selectedRow === 'all' ? (rowPixelateSize['all' as any] || 4) : (rowPixelateSize[rows.length === 1 ? 0 : Number(selectedRow)] || 4)}
                      onChange={(e) => {
                        const size = Number(e.target.value);
                        const rowIndex = selectedRow === 'all' ? 'all' : (rows.length === 1 ? 0 : Number(selectedRow));
                        setRowPixelateSize(prev => ({ ...prev, [rowIndex]: size }));
                      }}
                      onMouseUp={() => pushToHistory()}
                      className="w-full accent-teal-500 h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {selectedRow !== 'all' && (
                <>
                  <div>
                    <label className="block text-xs mb-1 text-neutral-400">Teclado de Combate (Tecla)</label>
                    <select 
                      value={rowKeys[Number(selectedRow)] || 'none'}
                      onChange={e => {
                        const rIndex = Number(selectedRow);
                        setRowKeys(prev => ({ ...prev, [rIndex]: e.target.value }));
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="none">Nenhuma (Parado/Sem Botão)</option>
                      <option value="z">Z (Ataque Padrão)</option>
                      <option value="x">X (Ataque Forte)</option>
                      <option value="c">C (Ataque Especial)</option>
                      <option value="v">V (Habilidade Secundária)</option>
                      <option value="a">A (Esquerda / Defesa)</option>
                      <option value="s">S (Cachoeira / Agachar)</option>
                      <option value="d">D (Direita / Corrida)</option>
                      <option value="q">Q (Combo Especial)</option>
                      <option value="w">W (Pulo)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs text-neutral-400">Multiplicador de Velocidade</label>
                      <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 rounded">{rowSpeeds[Number(selectedRow)] || 1.0}x</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="range"
                        min="0.1"
                        max="4.0"
                        step="0.05"
                        value={rowSpeeds[Number(selectedRow)] || 1.0}
                        onChange={e => {
                          const rIndex = Number(selectedRow);
                          setRowSpeeds(prev => ({ ...prev, [rIndex]: parseFloat(e.target.value) }));
                        }}
                        onMouseUp={() => pushToHistory()}
                        className="flex-1 accent-emerald-500 h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => {
                          setRowSpeeds(prev => ({ ...prev, [Number(selectedRow)]: 1.0 }));
                          pushToHistory();
                        }}
                        className="text-[9px] text-neutral-500 hover:text-white transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs mb-1 text-neutral-400">Frame de Impacto (Hit)</label>
                    <select 
                      value={rowHits[Number(selectedRow)] || 0}
                      onChange={e => {
                        const rIndex = Number(selectedRow);
                        setRowHits(prev => ({ ...prev, [rIndex]: parseInt(e.target.value) }));
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    >
                      {Array.from({ length: rows[Number(selectedRow)]?.length || 1 }).map((_, fIndex) => (
                        <option key={fIndex} value={fIndex}>Frame {fIndex}</option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-2 border-t border-neutral-850 mt-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(Number(selectedRow))}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 text-xs font-semibold transition-all hover:border-red-900/60"
                      title="Excluir todos os frames desta linha de animação"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Excluir Linha Selecionada</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {customOrder.length > 0 && (
            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>{t.toggleReorder}</span>
                <button 
                  onClick={() => setDisabledIndices(new Set())}
                  className="text-emerald-500 hover:text-emerald-400"
                >
                  {t.enableAll}
                </button>
              </label>
              <div className="text-[10px] text-neutral-500 mb-2 italic">{t.dragToReorder}</div>
              
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={customOrder.map(String)}
                  strategy={rectSortingStrategy}
                >
                  <div className="flex flex-col gap-3 max-h-52 overflow-y-auto p-2 border border-neutral-800 rounded bg-neutral-950 custom-scrollbar">
                    {selectedRow === 'all' ? (
                      rows.map((row, rIndex) => {
                        const rowIndices = customOrder.filter(idx => rows[rIndex].includes(rects[idx]));
                        if (rowIndices.length === 0) return null;
                        return (
                          <div key={rIndex} className="flex flex-col gap-1">
                            <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider border-b border-neutral-800 pb-1">
                              {getRowLabel(rIndex)}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {rowIndices.map((globalIndex) => {
                                const isDisabled = disabledIndices.has(globalIndex);
                                return (
                                  <SortableFrame
                                    key={globalIndex}
                                    id={String(globalIndex)}
                                    globalIndex={globalIndex}
                                    isDisabled={isDisabled}
                                    onToggle={() => {
                                      pushToHistory();
                                      const next = new Set(disabledIndices);
                                      if (isDisabled) next.delete(globalIndex);
                                      else next.add(globalIndex);
                                      setDisabledIndices(next);
                                    }}
                                    onDelete={() => handleDeleteFrame(globalIndex)}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {customOrder
                          .filter(idx => rows[Number(selectedRow)]?.includes(rects[idx]))
                          .map((globalIndex) => {
                            const isDisabled = disabledIndices.has(globalIndex);
                            return (
                              <SortableFrame
                                key={globalIndex}
                                id={String(globalIndex)}
                                globalIndex={globalIndex}
                                isDisabled={isDisabled}
                                onToggle={() => {
                                  pushToHistory();
                                  const next = new Set(disabledIndices);
                                  if (isDisabled) next.delete(globalIndex);
                                  else next.add(globalIndex);
                                  setDisabledIndices(next);
                                }}
                                onDelete={() => handleDeleteFrame(globalIndex)}
                              />
                            );
                          })}
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <div className="space-y-2 bg-neutral-950 p-2 rounded-lg border border-neutral-800">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[10px] text-neutral-400 group-hover:text-neutral-200 transition-colors">{t.transparentGif}</span>
                <div 
                  onClick={() => setExportTransparent(!exportTransparent)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${exportTransparent ? 'bg-emerald-600' : 'bg-neutral-700'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${exportTransparent ? 'left-4.5' : 'left-0.5'}`} />
                </div>
              </label>
              
              {!exportTransparent && (
                <div className="flex items-center justify-between gap-2 animate-in slide-in-from-top-1 duration-200">
                  <span className="text-[10px] text-neutral-400">{t.gifBackground}</span>
                  <input 
                    type="color" 
                    value={exportBgColor}
                    onChange={(e) => setExportBgColor(e.target.value)}
                    className="w-8 h-4 bg-transparent border-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 bg-neutral-950 p-2 rounded-lg border border-neutral-800">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[10px] text-neutral-400 group-hover:text-neutral-200 transition-colors">Contorno no Export</span>
                <div 
                  onClick={() => setExportOutline(!exportOutline)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${exportOutline ? 'bg-amber-600' : 'bg-neutral-700'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${exportOutline ? 'left-4.5' : 'left-0.5'}`} />
                </div>
              </label>
              
              {exportOutline && (
                <div className="flex items-center justify-between gap-2 animate-in slide-in-from-top-1 duration-200">
                  <span className="text-[10px] text-neutral-400">Cor do Contorno</span>
                  <input 
                    type="color" 
                    value={exportOutlineColor}
                    onChange={(e) => setExportOutlineColor(e.target.value)}
                    className="w-8 h-4 bg-transparent border-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <button 
              onClick={handleDownloadGif}
              disabled={playableRects.length === 0 || isExportingGif}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 text-xs shadow-lg shadow-emerald-900/20"
            >
              {isExportingGif ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              {isExportingGif ? t.exporting : t.exportGif}
            </button>
            
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setShowAudioZipPrompt(true)}
                disabled={playableRects.length === 0 || isExportingGif}
                className="col-span-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] shadow-lg shadow-indigo-900/20 cursor-pointer"
              >
                {isExportingGif ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3 text-white" />}
                {isExportingGif ? t.exporting : t.exportZip}
              </button>
              <button 
                onClick={handleExportSpritesheet}
                disabled={playableRects.length === 0 || isExportingGif}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] border border-neutral-700"
              >
                {isExportingGif ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <Layers className="w-3 h-3 text-blue-400" />}
                {isExportingGif ? t.exporting : t.exportSpritesheet}
              </button>
              
              <button 
                onClick={handleExportOptimizedAtlas}
                disabled={playableRects.length === 0 || isExportingGif}
                className="flex items-center justify-center gap-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 hover:text-amber-400 px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] border border-amber-600/30"
              >
                {isExportingGif ? <Loader2 className="w-3 h-3 animate-spin text-amber-500" /> : <Archive className="w-3 h-3 text-amber-500" />}
                {isExportingGif ? t.exporting : 'Export Compact Atlas'}
              </button>
              
              <div className="col-span-2 flex flex-col gap-1 mt-2">
                <label className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Engine Export</label>
                <div className="flex bg-neutral-900 rounded border border-neutral-800 p-0.5">
                  <button 
                    onClick={() => setExportFormat('json')}
                    className={`flex-1 text-[10px] py-1 rounded-sm transition-colors ${exportFormat === 'json' ? 'bg-neutral-800 text-white font-medium shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >JSON (Web)</button>
                  <button 
                    onClick={() => setExportFormat('godot')}
                    className={`flex-1 text-[10px] py-1 rounded-sm transition-colors ${exportFormat === 'godot' ? 'bg-[#478cbf]/20 text-[#478cbf] font-medium shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >Godot (.tres)</button>
                   <button 
                    onClick={() => setExportFormat('gamemaker')}
                    className={`flex-1 text-[10px] py-1 rounded-sm transition-colors ${exportFormat === 'gamemaker' ? 'bg-[#50b14c]/20 text-[#50b14c] font-medium shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >GameMaker (.yy)</button>
                </div>
              </div>

              <button 
                onClick={exportFormat === 'json' ? handleDownloadJson : exportFormat === 'godot' ? handleDownloadGodot : handleDownloadGameMaker}
                disabled={playableRects.length === 0}
                className="col-span-2 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] border border-neutral-700"
              >
                <FileJson className="w-3 h-3 text-amber-400" />
                {exportFormat === 'json' ? t.exportMetadata : exportFormat === 'godot' ? 'Export Godot Format' : 'Export GameMaker Format'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col min-h-0 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500">{t.jsonOutput}</h2>
            <button 
              onClick={handleDownloadJson}
              className="text-emerald-500 hover:text-emerald-400 flex items-center gap-1 text-xs"
              disabled={playableRects.length === 0}
            >
              <Download className="w-3 h-3" /> {t.exportJson}
            </button>
          </div>
          <textarea 
            readOnly 
            value={JSON.stringify(jsonOutput, null, 2)}
            className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 text-xs font-mono text-emerald-400/80 focus:outline-none resize-none min-h-[200px]"
          />
        </div>
      </div>

      {/* Mobile Frame Customizer Modal */}
      {mobileEditModalRow !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-neutral-800 shrink-0">
              <div>
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest font-sans">
                  {language === 'pt' ? 'Editor de Frames' : language === 'es' ? 'Editor de Fotogramas' : 'Frame Editor'}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white font-bold text-xs">
                    {getActionName(mobileEditModalRow)}
                  </span>
                  <select 
                    value={rowTypes[mobileEditModalRow] || 'custom'}
                    onChange={(e) => {
                      pushToHistory();
                      const val = e.target.value;
                      setRowTypes(prev => ({ ...prev, [mobileEditModalRow!]: val }));
                    }}
                    className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-[9px] text-amber-500 font-bold focus:outline-none focus:border-amber-500 uppercase"
                  >
                    <option value="idle">Idle</option>
                    <option value="run">Run</option>
                    <option value="attack">Attack</option>
                    <option value="damage">Damage</option>
                    <option value="death">Death</option>
                    <option value="custom">Custom</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                        handleDeleteRow(mobileEditModalRow!, true);
                        setMobileEditModalRow(null);
                    }}
                    className="ml-auto p-1.5 rounded-lg bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white transition-colors flex items-center justify-center border border-red-500/20"
                    title={language === 'pt' ? 'Excluir Action' : 'Delete Action'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileEditModalRow(null)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                id="close-mobile-editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core Action Frame Picker Preview section as stated by user */}
            <div className="flex flex-col items-center justify-center bg-neutral-950 border border-neutral-800 rounded-xl p-4 gap-3 relative overflow-hidden group select-none shrink-0 min-h-[160px]">
              {/* Alpha Checkerboard Background inside Preview Box */}
              <div className="absolute inset-0 z-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')] opacity-15 pointer-events-none" />
              
              {/* Hitbox Types Toggle */}
              <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setActiveBoxType('hitbox')}
                  className={`px-2 py-1 text-[9px] font-bold uppercase rounded border transition-colors ${activeBoxType === 'hitbox' ? 'bg-red-500/20 text-red-500 border-red-500' : 'bg-neutral-900/80 text-neutral-500 border-neutral-800 hover:text-neutral-300'}`}
                >
                  Hitbox (Ataque)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBoxType('hurtbox')}
                  className={`px-2 py-1 text-[9px] font-bold uppercase rounded border transition-colors ${activeBoxType === 'hurtbox' ? 'bg-green-500/20 text-green-500 border-green-500' : 'bg-neutral-900/80 text-neutral-500 border-neutral-800 hover:text-neutral-300'}`}
                >
                  Hurtbox (Corpo)
                </button>
                {(() => {
                  const rRects = rows[mobileEditModalRow] || [];
                  const rRect = rRects[mobileEditSelectedFrame];
                  const globalIdx = rRect ? rects.indexOf(rRect) : -1;
                  const boxes = frameBoxes[globalIdx] || [];
                  if (boxes.length === 0) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const newBoxes = {...frameBoxes};
                        delete newBoxes[globalIdx];
                        setFrameBoxes(newBoxes);
                      }}
                      className="mt-1 px-2 py-1 text-[8px] font-bold uppercase rounded bg-neutral-900/80 text-neutral-400 border border-neutral-800 hover:bg-red-900/40 hover:text-red-400 text-left transition-colors"
                    >
                      Limpar Caixas
                    </button>
                  );
                })()}
              </div>

              {/* Live Cropped Draw Canvas of Selected Square Frame with Hitbox Overlay */}
              <div className="relative z-10 flex items-center justify-center min-h-[80px]">
                {(() => {
                  const rRects = rows[mobileEditModalRow] || [];
                  const rRect = rRects[mobileEditSelectedFrame];
                  const globalIdx = rRect ? rects.indexOf(rRect) : -1;
                  
                  return (
                    <div 
                      className="relative transform scale-[2.5] max-w-[120px] max-h-[120px] select-none cursor-crosshair"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (globalIdx === -1) return;
                        
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = (e.clientX - rect.left) / rect.width;
                        const y = (e.clientY - rect.top) / rect.height;
                        
                        setIsDrawingBox(true);
                        setDrawingStart({ x, y });
                        setDrawingCurrent({ x, y });
                      }}
                      onPointerMove={(e) => {
                        if (!isDrawingBox || globalIdx === -1 || !drawingStart) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                        setDrawingCurrent({ x, y });
                      }}
                      onPointerUp={(e) => {
                        if (!isDrawingBox || globalIdx === -1 || !drawingStart || !drawingCurrent) {
                          setIsDrawingBox(false);
                          return;
                        }
                        
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                        
                        const minX = Math.min(drawingStart.x, x);
                        const minY = Math.min(drawingStart.y, y);
                        const w = Math.abs(x - drawingStart.x);
                        const h = Math.abs(y - drawingStart.y);
                        
                        if (w > 0.05 && h > 0.05) { // Threshold
                          const newBox: EditBox = {
                            id: `box-${Date.now()}`,
                            type: activeBoxType,
                            x: minX,
                            y: minY,
                            w,
                            h
                          };
                          setFrameBoxes(prev => ({
                            ...prev,
                            [globalIdx]: [...(prev[globalIdx] || []), newBox]
                          }));
                        }
                        
                        setIsDrawingBox(false);
                        setDrawingStart(null);
                        setDrawingCurrent(null);
                      }}
                      onPointerLeave={(e) => {
                         if (isDrawingBox) {
                             setIsDrawingBox(false);
                             setDrawingStart(null);
                             setDrawingCurrent(null);
                         }
                      }}
                    >
                      <canvas
                        ref={mobileCanvasRef}
                        className="object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      
                      {/* SVG Overlay for Boxes */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                        {(frameBoxes[globalIdx] || []).map((box) => (
                          <rect
                            key={box.id}
                            x={`${box.x * 100}%`}
                            y={`${box.y * 100}%`}
                            width={`${box.w * 100}%`}
                            height={`${box.h * 100}%`}
                            fill={box.type === 'hitbox' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}
                            stroke={box.type === 'hitbox' ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)'}
                            strokeWidth="0.5"
                          />
                        ))}
                        
                        {/* Currently drawing box */}
                        {isDrawingBox && drawingStart && drawingCurrent && (
                          <rect
                            x={`${Math.min(drawingStart.x, drawingCurrent.x) * 100}%`}
                            y={`${Math.min(drawingStart.y, drawingCurrent.y) * 100}%`}
                            width={`${Math.abs(drawingCurrent.x - drawingStart.x) * 100}%`}
                            height={`${Math.abs(drawingCurrent.y - drawingStart.y) * 100}%`}
                            fill={activeBoxType === 'hitbox' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}
                            stroke={activeBoxType === 'hitbox' ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)'}
                            strokeWidth="0.5"
                            strokeDasharray="1,1"
                          />
                        )}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* Status Indicator & Frame Index */}
              <div className="relative z-10 text-center w-full">
                <span className="block text-[11px] font-mono text-neutral-400">
                  {language === 'pt' ? 'Frame Selecionado' : language === 'es' ? 'Fotograma Seleccionado' : 'Selected Frame'}: <span className="font-bold text-emerald-400">#{mobileEditSelectedFrame + 1}</span> (Global ID: <span className="text-neutral-500">#{rects.indexOf((rows[mobileEditModalRow] || [])[mobileEditSelectedFrame])}</span>)
                </span>
              </div>

              {/* Toggle Enable-Disable Frame Button under current selected frame */}
              <div className="relative z-10 flex gap-2 w-full pt-1">
                {(() => {
                  const rRects = rows[mobileEditModalRow] || [];
                  const rRect = rRects[mobileEditSelectedFrame];
                  const globalIdx = rRect ? rects.indexOf(rRect) : -1;
                  const isGlobalDisabled = globalIdx !== -1 && disabledIndices.has(globalIdx);
                  const isRowDisabled = globalIdx !== -1 && rowDisabledFrames[mobileEditModalRow]?.has(globalIdx);
                  const isDisabledForThisView = isGlobalDisabled || isRowDisabled;

                  return (
                    <div className="flex flex-col gap-2 w-full">
                      <div className="flex gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => {
                            if (globalIdx === -1) return;
                            const next = new Set(disabledIndices);
                            if (isGlobalDisabled) {
                              next.delete(globalIdx);
                              pushToHistory();
                              setDisabledIndices(next);
                            } else {
                              next.add(globalIdx);
                              pushToHistory();
                              setDisabledIndices(next);
                            }
                          }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl font-bold uppercase text-[9px] sm:text-[10px] tracking-wide transition-all ${
                            isGlobalDisabled 
                              ? 'bg-emerald-600/20 border-2 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                              : 'bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-neutral-950/60'
                          }`}
                        >
                          {isGlobalDisabled ? (
                            <>
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>{language === 'pt' ? 'Ativar Global' : 'Enable Global'}</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5" />
                              <span>{language === 'pt' ? 'Desativar Global' : 'Disable Global'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (globalIdx === -1) return;
                            pushToHistory();
                            setRowDisabledFrames(prev => {
                              const nextSet = new Set(prev[mobileEditModalRow] || []);
                              if (isRowDisabled) nextSet.delete(globalIdx);
                              else nextSet.add(globalIdx);
                              return { ...prev, [mobileEditModalRow]: nextSet };
                            });
                          }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl font-bold uppercase text-[9px] sm:text-[10px] tracking-wide transition-all ${
                            isRowDisabled 
                              ? 'bg-emerald-600/20 border-2 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                              : 'bg-amber-950/40 border border-amber-900/40 text-amber-500 hover:bg-neutral-950/60'
                          }`}
                        >
                          {isRowDisabled ? (
                            <>
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>{language === 'pt' ? '+ No Moveset' : '+ In Moveset'}</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5" />
                              <span>{language === 'pt' ? '- Do Moveset' : '- From Moveset'}</span>
                            </>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            if (globalIdx === -1) return;
                            handleDeleteFrame(globalIdx, true);
                            // Clamp active selected frame
                            setMobileEditSelectedFrame(prev => Math.max(0, prev - 1));
                          }}
                          className="px-2 bg-red-950/20 hover:bg-red-900/30 text-red-500 border border-red-900/30 rounded-xl transition-all font-sans"
                          title={language === 'pt' ? 'Excluir Frame Definitivamente' : 'Delete Frame Definitively'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Ignition Toggle Button */}
                      <div className="flex gap-2 w-full">
                         <button
                          type="button"
                          onClick={() => {
                            if (globalIdx === -1) return;
                            pushToHistory();
                            setRowLoopPoints(prev => {
                              const currentPoint = prev[mobileEditModalRow];
                              // If already set to this frame, unset it. Otherwise set it.
                              const nextPoint = currentPoint === mobileEditSelectedFrame ? null : mobileEditSelectedFrame;
                              return { ...prev, [mobileEditModalRow]: nextPoint };
                            });
                          }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shadow-lg ${
                            rowLoopPoints[mobileEditModalRow] === mobileEditSelectedFrame
                              ? 'bg-amber-500 border-2 border-amber-400 text-neutral-950 scale-102 ring-4 ring-amber-500/10' 
                              : 'bg-neutral-800 border border-neutral-700 text-amber-500 hover:bg-neutral-750'
                          }`}
                          title="Define o ponto onde a animação trava e fica em loop até ser disparada"
                        >
                          <Zap className={`w-4 h-4 ${rowLoopPoints[mobileEditModalRow] === mobileEditSelectedFrame ? 'fill-current' : ''}`} />
                          <span>{language === 'pt' ? 'Trava de Ignição' : 'Ignition Lock'}</span>
                        </button>
                      </div>

                      {/* Speed Multiplier for this Moveset */}
                      <div className="bg-neutral-800/40 p-2 rounded-xl border border-neutral-700/30">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] uppercase font-bold text-neutral-400 font-mono tracking-tight">
                            {t.movesetSpeed}
                          </label>
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            {rowSpeeds[mobileEditModalRow] || 1.0}x
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range"
                            min="0.1"
                            max="4.0"
                            step="0.05"
                            value={rowSpeeds[mobileEditModalRow] || 1.0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setRowSpeeds(prev => ({ ...prev, [mobileEditModalRow]: val }));
                            }}
                            onMouseUp={() => pushToHistory()}
                            className="flex-1 accent-emerald-500 h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer"
                          />
                          <button 
                            onClick={() => {
                              setRowSpeeds(prev => ({ ...prev, [mobileEditModalRow]: 1.0 }));
                              pushToHistory();
                            }}
                            className="text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-tighter"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Squares of Frames Grid / list for custom toggles */}
            <div className="flex-1 flex flex-col min-h-0 gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 font-mono">
                {language === 'pt' ? 'Quadrados de Frames' : language === 'es' ? 'Cuadrados' : 'Frame Squares'}
              </span>
              <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 p-1.5 border border-neutral-850 rounded-xl bg-neutral-950/40 custom-scrollbar">
                {(() => {
                  const rRects = rows[mobileEditModalRow] || [];
                  return rRects.map((rect, frameIdx) => {
                    const gIdx = rects.indexOf(rect);
                    const isGlobalDisabled = disabledIndices.has(gIdx);
                    const isRowDisabled = rowDisabledFrames[mobileEditModalRow]?.has(gIdx);
                    const isFrameDisabled = isGlobalDisabled || isRowDisabled;
                    const isSelected = mobileEditSelectedFrame === frameIdx;
                    const isIgnitionPoint = rowLoopPoints[mobileEditModalRow] === frameIdx;
                    
                    return (
                      <button
                        key={frameIdx}
                        onClick={() => setMobileEditSelectedFrame(frameIdx)}
                        className={`aspect-square flex flex-col items-center justify-center rounded-xl font-bold transition-all border outline-none relative ${
                          isSelected
                            ? 'bg-amber-500 text-neutral-950 border-amber-400 font-black ring-4 ring-amber-500/20'
                            : isFrameDisabled
                              ? 'bg-neutral-950 border-neutral-900 text-neutral-600 line-through opacity-40'
                              : 'bg-neutral-800/40 hover:bg-neutral-800 border-neutral-800 text-white'
                        }`}
                      >
                        {isIgnitionPoint && (
                          <div className="absolute -top-1 -left-1 bg-amber-500 text-neutral-950 rounded-full p-0.5 shadow-sm border border-neutral-900 z-10">
                            <Zap className="w-2.5 h-2.5 fill-current" />
                          </div>
                        )}
                        <span className={`text-[8px] block tracking-tight ${isSelected ? 'text-neutral-900 font-bold' : 'text-neutral-500'}`}>
                          #{frameIdx + 1}
                        </span>
                        <span className="text-xs mt-0.5">
                          {isFrameDisabled ? '❌' : `F${gIdx}`}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Save Close Button */}
            <div className="pt-2 border-t border-neutral-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setMobileEditModalRow(null)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-colors border border-emerald-500/20 flex items-center justify-center gap-1.5"
              >
                <span>{language === 'pt' ? 'Salvar & Fechar' : language === 'es' ? 'Guardar y Cerrar' : 'Save & Close'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Criar Moveset Arena Modal */}
      {showCreateMovesetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 custom-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-neutral-800 shrink-0">
              <div>
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>CRIAR MOVESET</span>
                </h3>
                <span className="text-neutral-400 font-semibold text-xs text-left block mt-0.5">
                  Mapeie ou repudie animações de combate
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateMovesetModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                id="close-moveset-creator"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Sprite Reference & Select Frames */}
            <div className="flex flex-col gap-2 text-left">
              <label className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider font-mono">
                1. Selecionar Frames (Animação)
              </label>

              {/* Full Sprite Image Reference */}
              {imageSrc && (
                <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2 relative flex justify-center max-h-[150px] overflow-hidden">
                  <div className="absolute inset-0 z-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')] opacity-15 pointer-events-none" />
                  <img src={imageSrc} className="relative z-10 max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                </div>
              )}

              {rects.length === 0 ? (
                <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/30 text-red-400 text-xs text-center font-bold">
                  Nenhum frame fatiado detectado! Recorte sprites primeiro.
                </div>
              ) : (
                <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto p-2 bg-neutral-950 border border-neutral-800 rounded-xl custom-scrollbar">
                  {rows.map((row, rIndex) => (
                    <div key={rIndex} className="flex flex-col gap-2">
                      <div className="text-[10px] text-amber-500 font-bold uppercase tracking-wider border-b border-neutral-800 pb-1">
                        {getRowLabel(rIndex)}
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {row.map((rect) => {
                          const idx = rects.indexOf(rect);
                          if (idx === -1) return null;
                          const isSelected = movesetSelectedFrames.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setMovesetSelectedFrames(prev => 
                                  prev.includes(idx) ? prev.filter(f => f !== idx) : [...prev, idx]
                                );
                              }}
                              className={`aspect-square relative flex items-center justify-center rounded-lg border overflow-hidden ${
                                isSelected ? 'border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'border-neutral-800 hover:border-neutral-600'
                              }`}
                            >
                              <div className="absolute inset-0 z-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')] opacity-30 pointer-events-none" />
                              <span className={`absolute top-0.5 left-0.5 text-[8px] font-black z-20 px-1 rounded ${isSelected ? 'bg-amber-500 text-black' : 'bg-black/80 text-white'}`}>
                                 #{idx + 1}
                              </span>
                              <div className="relative z-10 w-full h-full flex items-center justify-center p-1">
                                <canvas
                                  ref={el => {
                                    if (el && imageElement) {
                                      const ctx = el.getContext('2d');
                                      if (ctx) {
                                        el.width = rect.w;
                                        el.height = rect.h;
                                        ctx.drawImage(imageElement, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
                                      }
                                    }
                                  }}
                                  className="max-w-full max-h-full object-contain"
                                  style={{ imageRendering: 'pixelated' }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Select Preset Action Type */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider font-mono">
                2. Escolher o Tipo do Moveset (Preset)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'idle', label: 'Idle (Repouso)', emoji: '💤' },
                  { id: 'attack', label: 'Atacar / Golpear', emoji: '👊' },
                  { id: 'run', label: 'Correr / Andar', emoji: '🏃' },
                  { id: 'hurt', label: 'Tomar Dano', emoji: '💥' }
                ].map((preset) => {
                  const isPresetSel = movesetType === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setMovesetType(preset.id)}
                      className={`py-2 px-2.5 rounded-xl border text-left flex items-center gap-2 transition-all text-xs font-semibold ${
                        isPresetSel 
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]' 
                          : 'bg-neutral-950 border-neutral-850 hover:bg-neutral-900 text-neutral-400'
                      }`}
                    >
                      <span className="text-sm">{preset.emoji}</span>
                      <span className="truncate">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mapped Fields Details */}
            <div className="bg-neutral-950 border border-neutral-850 p-3.5 rounded-xl flex flex-col gap-3 text-left">
              {/* Action custom name override */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-neutral-400 uppercase font-mono">Nome da Ação</span>
                  <input
                    type="text"
                    value={movesetName}
                    onChange={(e) => setMovesetName(e.target.value)}
                    placeholder="Ex: Punch"
                    className="w-full bg-neutral-900 text-white font-bold text-xs rounded-lg border border-neutral-800 p-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-neutral-400 uppercase font-mono">Tecla de Combate</span>
                  <select
                    value={movesetKey}
                    onChange={(e) => setMovesetKey(e.target.value)}
                    className="w-full bg-neutral-900 text-white font-mono text-xs rounded-lg border border-neutral-800 p-2 focus:outline-none focus:border-amber-500"
                  >
                    {['NONE', 'SPACE', 'A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', 'V', 'C', 'X', 'Z'].map((k) => (
                      <option key={k} value={k}>
                        {k === 'NONE' ? 'Sem Tecla' : k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Speed factor slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[8px] font-bold text-neutral-400 uppercase font-mono">
                  <span>Velocidade da Animação</span>
                  <span className="text-amber-500 font-black">{movesetSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={movesetSpeed}
                  onChange={(e) => setMovesetSpeed(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-900 rounded-lg h-1"
                />
              </div>

              {/* Hit Frame impact slider (Only for Attack or Action presets) */}
              {movesetType === 'attack' && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[8px] font-bold text-neutral-400 uppercase font-mono">
                    <span>Frame do Golpe (Impacto / Dano)</span>
                    <span className="text-red-400 font-black">F{movesetHitFrame}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, (movesetSelectedFrames.length || 1) - 1)}
                    step="1"
                    value={movesetHitFrame}
                    onChange={(e) => setMovesetHitFrame(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-neutral-900 rounded-lg h-1"
                  />
                  <span className="text-[8px] text-neutral-500 font-mono text-center">
                    Ao atingir o Frame {movesetHitFrame}, causa dano real e treme a tela da arena!
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Actions */}
            <div className="pt-2 border-t border-neutral-800 shrink-0">
              <button
                type="button"
                disabled={movesetSelectedFrames.length === 0}
                onClick={() => {
                  pushToHistory();

                  // Create new custom row
                  const newCustomRow = movesetSelectedFrames.map(idx => rects[idx]);
                  const newIndex = autoRows.length + customRows.length;
                  
                  // Update states in react objects
                  setCustomRows(prev => [...prev, newCustomRow]);
                  setRowTypes(prev => ({ ...prev, [newIndex]: movesetType }));
                  setRowNames(prev => ({ ...prev, [newIndex]: movesetName }));
                  setRowKeys(prev => ({ ...prev, [newIndex]: movesetKey.toUpperCase() }));
                  setRowSpeeds(prev => ({ ...prev, [newIndex]: movesetSpeed }));
                  setRowHits(prev => ({ ...prev, [newIndex]: movesetHitFrame }));

                  // Log action feedback
                  const movesetTypeNamePt = movesetType === 'idle' ? 'IDLE' : movesetType === 'attack' ? 'ATAQUE' : movesetType === 'run' ? 'CORRER' : 'DANO';
                  setArenaLogs(l => [
                    `✨ [MOVESET] Novo Moveset "${movesetName}" configurado como ${movesetTypeNamePt} na Linha Customizada ${newIndex + 1}!`,
                    ...l.slice(0, 15)
                  ]);

                  // Instantly switch sandbox preview to test this row
                  setSandboxActiveRow(newIndex);
                  setSandboxFrame(0);

                  setShowCreateMovesetModal(false);
                }}
                className={`w-full font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider shadow-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  movesetSelectedFrames.length === 0 
                  ? 'bg-neutral-800 text-neutral-600 border-neutral-700 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-500/20 shadow-amber-500/20'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Configurar Moveset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escolher Linha para Baixar Modal */}
      {showDownloadRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 custom-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-neutral-800 shrink-0">
              <div>
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                  <Download className="w-4 h-4 text-emerald-500" />
                  <span>BAIXAR ANIMAÇÃO</span>
                </h3>
                <span className="text-neutral-400 font-semibold text-xs text-left block mt-0.5">
                  Selecione uma animação individual do sprite
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadRowModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                id="close-row-download"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Frame Canvas Crop Preview with high visibility */}
            {rows.length > 0 && (
              <div className="flex flex-col items-center justify-center bg-neutral-950 border border-emerald-500/20 rounded-xl p-4 gap-2 relative overflow-hidden select-none shrink-0 min-h-[140px] shadow-inner">
                {/* Alpha Checkerboard Background inside Preview Box */}
                <div className="absolute inset-0 z-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')] opacity-15 pointer-events-none" />
                
                <div className="relative z-10 flex items-center justify-center min-h-[64px]">
                  <canvas
                    ref={downloadRowCanvasRef}
                    className="transform scale-[2.5] max-w-[120px] max-h-[120px] object-contain select-none shadow-md"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="relative z-10 text-emerald-400 font-bold text-[10px] font-mono uppercase bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 mt-1">
                  Preview do Primeiro Frame
                </div>
              </div>
            )}

            {/* Step 1: Select Active Row */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider font-mono">
                Selecione qual linha do sprite deseja exportar:
              </label>
              {rows.length === 0 ? (
                <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/30 text-red-400 text-xs text-center font-bold">
                  Nenhum sprite recortado fatiado! Recorte primeiro.
                </div>
              ) : (
                <select
                  value={downloadRowIndex}
                  onChange={(e) => {
                    setDownloadRowIndex(Number(e.target.value));
                  }}
                  className="w-full bg-neutral-950 text-white font-mono text-xs rounded-xl border border-neutral-800 p-2.5 focus:outline-none focus:border-emerald-500 font-bold"
                >
                  {rows.map((row, i) => {
                    const label = rowNames[i] || rowTypes[i] || `Ação ${i+1}`;
                    return (
                      <option key={i} value={i}>
                        {getRowLabel(i)} ({row.length} Frames) - "{label}"
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            {/* Warning / Notes block */}
            <div className="bg-neutral-950 border border-neutral-850 p-3 rounded-lg text-left">
              <span className="text-[10px] text-neutral-400 font-semibold leading-relaxed block">
                💡 O arquivo de download conterá todas as imagens compactadas individuais da linha "{getActionName(downloadRowIndex)}", arquivo estrutural JSON e um Script de controlador de moveset C# isolado pronto para ser importado na Unity ou no Godot.
              </span>
            </div>

            {/* Confirm Actions */}
            <div className="pt-2 border-t border-neutral-800 shrink-0">
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={() => {
                  handleDownloadSingleRowZip(downloadRowIndex);
                  setShowDownloadRowModal(false);
                }}
                className={`w-full font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider shadow-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  rows.length === 0 
                  ? 'bg-neutral-800 text-neutral-600 border-neutral-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/20 shadow-emerald-500/20'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Linhas Selecionadas (Pack)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden flex border-t border-neutral-800 bg-neutral-900 absolute bottom-0 left-0 right-0 z-50 h-16 pointer-events-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setMobileTab('settings')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'settings' ? 'text-emerald-500' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] uppercase font-bold">{t.settings}</span>
        </button>
        <button 
          onClick={() => setMobileTab('workspace')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'workspace' ? 'text-emerald-500' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Move className="w-5 h-5" />
          <span className="text-[10px] uppercase font-bold">Workspace</span>
        </button>
        <button 
          onClick={() => setMobileTab('export')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'export' ? 'text-emerald-500' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Download className="w-5 h-5" />
          <span className="text-[10px] uppercase font-bold">{t.export}</span>
        </button>
      </div>

      <AnimatePresence>
        {showDeleteSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-emerald-500/20 border border-emerald-400/50 flex items-center gap-3 backdrop-blur-md"
          >
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <span className="font-black uppercase tracking-widest text-xs">
              {language === 'pt' ? 'Ação Excluída!' : language === 'es' ? '¡Acción Eliminada!' : 'Action Deleted!'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
