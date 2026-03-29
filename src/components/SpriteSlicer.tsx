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
import { Upload, Play, Pause, Download, Maximize, MousePointer2, Loader2, Image as ImageIcon, Smartphone, ZoomIn, ZoomOut, Move, Undo2, Redo2, Save, FolderOpen, HelpCircle, ArrowRight, ArrowDown, Globe, CheckSquare, Square, RefreshCw, Scissors, Trash2, Layers, FileJson, AlertTriangle, SkipBack, SkipForward, Tag, Zap, Sparkles, Wand2, Crop } from 'lucide-react';
import { detectSprites, Rect } from '../lib/sprite-detection';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import localforage from 'localforage';
import { Language, translations } from '../lib/translations';

// --- Sortable Item Component ---
function SortableFrame({ id, globalIndex, isDisabled, onToggle }: { id: string, globalIndex: number, isDisabled: boolean, onToggle: () => void, key?: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    touchAction: 'manipulation',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        onClick={(e) => {
          // Prevent toggle if we are dragging
          if (!isDragging) {
             onToggle();
          }
        }}
        className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors cursor-grab active:cursor-grabbing ${
          isDisabled 
            ? 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700' 
            : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/40 border border-emerald-500/50'
        } ${isDragging ? 'opacity-50 ring-2 ring-emerald-500' : ''}`}
        title={`Drag to reorder, click to toggle Frame ${globalIndex}`}
      >
        {globalIndex}
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

// --- Security Hardening: Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Slicer.io Security Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function SpriteSlicer() {
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
  
  // Crop Modal state
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [isDrawingNewCrop, setIsDrawingNewCrop] = useState(false);
  
  // Custom ordering of frames
  const [customOrder, setCustomOrder] = useState<number[]>([]);
  const [frameDurations, setFrameDurations] = useState<Record<number, number>>({});
  const [rowNames, setRowNames] = useState<Record<number, string>>({});
  const [rowPivots, setRowPivots] = useState<Record<number, 'center' | 'bottom'>>({});
  const [rowTypes, setRowTypes] = useState<Record<number, string>>({});

  // Zoom and Pan state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isManualSelecting, setIsManualSelecting] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [manualSelectionRect, setManualSelectionRect] = useState<Rect | null>(null);
  const [manualRects, setManualRects] = useState<Rect[]>([]);
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
  const [gridCols, setGridCols] = useState(1);
  const [gridRows, setGridRows] = useState(1);

  // Undo/Redo state
  const [history, setHistory] = useState<{ rects: Rect[], customOrder: number[], disabledIndices: Set<number>, frameDurations: Record<number, number> }[]>([]);
  const [redoStack, setRedoStack] = useState<{ rects: Rect[], customOrder: number[], disabledIndices: Set<number>, frameDurations: Record<number, number> }[]>([]);
  const [showSmartTips, setShowSmartTips] = useState(true);
  const [showSmartTipsModal, setShowSmartTipsModal] = useState(false);
  const [activeHint, setActiveHint] = useState<string | null>(null);

  // Missing state variables
  const [language, setLanguage] = useState<Language>('pt');
  const [isDirty, setIsDirty] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [exportTransparent, setExportTransparent] = useState(true);
  const [exportBgColor, setExportBgColor] = useState('#ffffff');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [previewBg, setPreviewBg] = useState('#ffffff');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

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
    setHistory(prev => [...prev, { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      frameDurations: { ...frameDurations }
    }]);
    setRedoStack([]);
  }, [rects, customOrder, disabledIndices, frameDurations]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prevState = history[history.length - 1];
    
    // Save current to redo stack
    setRedoStack(prev => [...prev, { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      frameDurations: { ...frameDurations }
    }]);
    
    // Restore previous
    setRects(prevState.rects);
    setCustomOrder(prevState.customOrder);
    setDisabledIndices(prevState.disabledIndices);
    setFrameDurations(prevState.frameDurations || {});
    
    setHistory(prev => prev.slice(0, -1));
    setSelectedRectIndex(null);
  }, [history, rects, customOrder, disabledIndices, frameDurations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    
    // Save current to history
    setHistory(prev => [...prev, { 
      rects: [...rects], 
      customOrder: [...customOrder], 
      disabledIndices: new Set(disabledIndices),
      frameDurations: { ...frameDurations }
    }]);
    
    // Restore next
    setRects(nextState.rects);
    setCustomOrder(nextState.customOrder);
    setDisabledIndices(nextState.disabledIndices);
    setFrameDurations(nextState.frameDurations || {});
    
    setRedoStack(prev => prev.slice(0, -1));
    setSelectedRectIndex(null);
  }, [redoStack, rects, customOrder, disabledIndices, frameDurations]);

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
          if (data.imageSrc) setImageSrc(data.imageSrc);
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
      };
      
      try {
        await localforage.setItem('spriteSlicerAutoSave', projectData);
      } catch (err) {
        console.error('Failed to auto-save project:', err);
      }
    };

    const timeoutId = setTimeout(saveToLocalForage, 1000); // Debounce auto-save
    return () => clearTimeout(timeoutId);
  }, [isInitialized, imageSrc, rects, bgColor, tolerance, mergeDist, minSize, animationSpeed, animationName, characterName, customOrder, disabledIndices, frameDurations, rowNames, rowPivots, rowTypes]);

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
    
    video.onloadedmetadata = async () => {
      try {
        if (video.duration < 5 || video.duration > 30) {
          alert("Video must be between 5 and 30 seconds.");
          setIsProcessingVideo(false);
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsProcessingVideo(false);
          return;
        }

        const fps = 5;
        const frames = [];
        const frameCount = Math.floor(video.duration * fps);
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        for (let i = 0; i < frameCount; i++) {
          video.currentTime = i / fps;
          await new Promise(resolve => {
            video.onseeked = resolve;
          });
          ctx.drawImage(video, 0, 0);
          frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
          setVideoProgress(Math.round(((i + 1) / frameCount) * 100));
        }

        // Assemble into sprite sheet
        const cols = Math.ceil(Math.sqrt(frameCount));
        const rows = Math.ceil(frameCount / cols);
        
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = cols * canvas.width;
        sheetCanvas.height = rows * canvas.height;
        const sheetCtx = sheetCanvas.getContext('2d');
        if (!sheetCtx) {
          setIsProcessingVideo(false);
          return;
        }

        frames.forEach((frame, i) => {
          const x = (i % cols) * canvas.width;
          const y = Math.floor(i / cols) * canvas.height;
          sheetCtx.putImageData(frame, x, y);
        });

        setImageSrc(sheetCanvas.toDataURL('image/png'));
        setRects([]);
        setCustomOrder([]);
        setDisabledIndices(new Set());
        setFrameDurations({});
        setSelectedRectIndex(null);
        setCurrentFrame(0);
      } catch (error) {
        console.error("Error processing video:", error);
        alert("Error processing video.");
      } finally {
        setIsProcessingVideo(false);
      }
    };

    video.onerror = () => {
      alert("Error loading video file.");
      setIsProcessingVideo(false);
    };
  };

  const processImageFile = (file: File) => {
    // Security: Limit file size to 20MB for images
    if (file.size > 20 * 1024 * 1024) {
      alert("Security Limit: Image file is too large (Max 20MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
      setRects([]);
      setSelectedRectIndex(null);
      setCurrentFrame(0);
      setSelectedRow('all');
      setDisabledIndices(new Set());
      setCustomOrder([]);
      setFrameDurations({});
      setScale(1);
      setPan({ x: 0, y: 0 });
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
    img.onload = () => {
      setImageElement(img);
      detectBackgroundColor(img);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!imageElement) return;
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
  }, [imageElement, bgColor, tolerance, mergeDist, minSize]);

  const rows = useMemo(() => {
    if (rects.length === 0) return [];
    
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
  }, [rects]);

  const activeRects = useMemo(() => {
    if (selectedRow === 'all') return rects;
    return rows[selectedRow] || [];
  }, [rects, rows, selectedRow]);

  // When row changes, reset custom order to match the active rects
  useEffect(() => {
    setCustomOrder(activeRects.map(r => rects.indexOf(r)));
  }, [activeRects, rects]);

  const playableRects = useMemo(() => {
    // Map the custom order back to rects, and filter out disabled ones
    return customOrder
      .filter(index => !disabledIndices.has(index))
      .map(index => rects[index])
      .filter(Boolean); // Ensure rect exists
  }, [customOrder, disabledIndices, rects]);

  useEffect(() => {
    setCurrentFrame(0);
  }, [selectedRow, rects, disabledIndices]);

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
    if (!isPlaying || playableRects.length === 0) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const activeIndices = customOrder.filter(idx => !disabledIndices.has(idx));
      const rectIndex = activeIndices[currentFrameRef.current];
      const multiplier = frameDurations[rectIndex] || 1;
      const currentDuration = animationSpeed * 1000 * multiplier;

      if (time - lastTime > currentDuration) {
        setCurrentFrame((prev) => (prev + 1) % playableRects.length);
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, playableRects.length, animationSpeed, customOrder, disabledIndices, frameDurations]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !imageElement || playableRects.length === 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = playableRects[currentFrame];
    if (!rect) return;

    canvas.width = rect.w;
    canvas.height = rect.h;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a frame with background removal
    const drawFrame = (frameRect: Rect, alpha: number = 1.0) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = frameRect.w;
      tempCanvas.height = frameRect.h;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(
        imageElement,
        frameRect.x, frameRect.y, frameRect.w, frameRect.h,
        0, 0, frameRect.w, frameRect.h
      );

      const imageData = tempCtx.getImageData(0, 0, frameRect.w, frameRect.h);
      removeBackground(imageData, bgColor, tolerance);
      tempCtx.putImageData(imageData, 0, 0);

      ctx.globalAlpha = alpha;
      ctx.drawImage(tempCanvas, 0, 0, rect.w, rect.h);
      ctx.globalAlpha = 1.0;
    };

    // Onion Skin: Draw previous frame semi-transparently
    if (onionSkin && playableRects.length > 1) {
      const prevFrameIdx = (currentFrame - 1 + playableRects.length) % playableRects.length;
      const prevRect = playableRects[prevFrameIdx];
      if (prevRect) {
        drawFrame(prevRect, 0.3);
      }
    }

    // Draw current frame
    drawFrame(rect, 1.0);
  }, [currentFrame, imageElement, playableRects, bgColor, tolerance, onionSkin]);

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
        setRects(prev => [...prev, finalRect]);
        setCustomOrder(prev => [...prev, rects.length]);
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
    
    const enabledRects = rects.filter((_, i) => !disabledIndices.has(i));
    if (enabledRects.length === 0) return;
    
    // Simple packing: grid based on square root
    const count = enabledRects.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    let maxW = 0;
    let maxH = 0;
    enabledRects.forEach(r => {
      if (r.w > maxW) maxW = r.w;
      if (r.h > maxH) maxH = r.h;
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = cols * maxW;
    canvas.height = rows * maxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = imageElement.width;
    sourceCanvas.height = imageElement.height;
    const sCtx = sourceCanvas.getContext('2d');
    if (!sCtx) return;
    sCtx.drawImage(imageElement, 0, 0);
    
    enabledRects.forEach((rect, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      const imageData = sCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
      // Remove background if needed
      removeBackground(imageData, bgColor, tolerance);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = rect.w;
      tempCanvas.height = rect.h;
      tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
      
      ctx.drawImage(tempCanvas, col * maxW, row * maxH);
    });
    
    const link = document.createElement('a');
    link.download = `${animationName}_atlas.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
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
    const activeIndices = customOrder.filter(idx => !disabledIndices.has(idx));
    
    let rowIndex: number | 'all' = selectedRow;
    if (selectedRow !== 'all' && rows.length === 1) {
      rowIndex = 0;
    }

    // Determine the name
    let rawName = '';
    if (rowIndex === 'all') {
      rawName = (rowNames as any)['all'] || '';
    } else {
      rawName = rowNames[rowIndex as number] || '';
    }
    const defaultName = rowIndex === 'all' ? animationName : (rows.length === 1 ? animationName : `${animationName}_row${Number(rowIndex) + 1}`);
    const name = rawName || defaultName;
    
    // Determine the type
    let rawType = 'custom';
    if (rowIndex === 'all') {
      rawType = (rowTypes as any)['all'] || 'custom';
    } else {
      rawType = rowTypes[rowIndex as number] || 'custom';
    }
    
    let type = rawType;
    if (rawType === 'run') type = 'running';
    if (rawType === 'jump') type = 'jumping';
    if (rawType === 'roll') type = 'spindash';
    if (rawType === 'effect') type = 'vfx';
    
    // Determine the pivot rule
    let pivotType = 'center';
    if (rowIndex === 'all') {
      pivotType = (rowPivots as any)['all'] || 'center';
    } else {
      pivotType = rowPivots[rowIndex as number] || 'center';
    }
    const pivotRule = pivotType === 'bottom' ? 'base' : 'center';

    // Filter indices for the selected row
    let rowIndices = activeIndices;
    if (rowIndex !== 'all') {
      rowIndices = activeIndices.filter(idx => rows[rowIndex as number] && rows[rowIndex as number].includes(rects[idx]));
    }

    return {
      character: characterName || "Unknown",
      name,
      type,
      speed: animationSpeed,
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
        return {
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          pivotX: Math.floor(r.w / 2),
          pivotY,
          duration: Number((animationSpeed * multiplier).toFixed(3))
        };
      })
    };
  }, [animationName, animationSpeed, customOrder, disabledIndices, frameDurations, rows, rowNames, rowPivots, rowTypes, rects, selectedRow]);

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
    if (!imageElement || playableRects.length === 0) return;
    setIsExportingGif(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const maxWidth = Math.max(...playableRects.map(r => r.w));
      const maxHeight = Math.max(...playableRects.map(r => r.h));
      
      const gif = GIFEncoder();
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = maxHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("Could not get canvas context");

      const activeIndices = customOrder.filter(idx => !disabledIndices.has(idx));
      for (let i = 0; i < playableRects.length; i++) {
        const rect = playableRects[i];
        const rectIndex = activeIndices[i];
        const multiplier = frameDurations[rectIndex] || 1;
        const currentDelay = animationSpeed * 1000 * multiplier;

        ctx.clearRect(0, 0, maxWidth, maxHeight);
        
        // If not transparent, fill background
        if (!exportTransparent) {
          ctx.fillStyle = exportBgColor;
          ctx.fillRect(0, 0, maxWidth, maxHeight);
        }

        const offsetX = Math.floor((maxWidth - rect.w) / 2);
        const offsetY = Math.floor((maxHeight - rect.h) / 2);
        
        ctx.drawImage(
          imageElement,
          rect.x, rect.y, rect.w, rect.h,
          offsetX, offsetY, rect.w, rect.h
        );
        
        const imageData = ctx.getImageData(0, 0, maxWidth, maxHeight);
        removeBackground(imageData, bgColor, tolerance);
        
        const palette = quantize(imageData.data, 256, { format: 'rgba4444' });
        const index = applyPalette(imageData.data, palette, 'rgba4444');
        
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

  const handleAnimationNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Security: Sanitize input to prevent XSS and limit length
    const sanitized = e.target.value.replace(/[<>"/\\;]/g, '').slice(0, 32);
    setAnimationName(sanitized);
  };

  const smallRectsCount = rects.filter(r => r.w < 10 || r.h < 10).length;

  return (
    <ErrorBoundary fallback={
      <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Ops! Algo deu errado.</h1>
          <p className="text-neutral-400 text-sm">
            O Slicer.io detectou um erro inesperado ou um arquivo malicioso. 
            Por segurança, a aplicação foi reiniciada.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all"
          >
            Recarregar Site
          </button>
        </div>
      </div>
    }>
      <div 
        className={`flex flex-col lg:flex-row h-screen overflow-hidden bg-neutral-950 text-neutral-300 font-mono text-sm transition-all duration-300 ${isDraggingFile ? 'scale-[0.98] ring-4 ring-emerald-500 ring-inset' : ''}`}
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

      {/* Tutorial Modal */}
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
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowCropModal(false);
                    setCropRect(null);
                  }} 
                  className="px-6 py-2 text-neutral-400 hover:text-white font-bold transition-colors"
                >
                  {t.cancel}
                </button>
                <button 
                  disabled={!cropRect || Math.abs(cropRect.w) < 5 || Math.abs(cropRect.h) < 5}
                  onClick={() => {
                    if (cropRect && imageElement) {
                      const canvas = document.createElement('canvas');
                      const finalX = Math.min(cropRect.x, cropRect.x + cropRect.w);
                      const finalY = Math.min(cropRect.y, cropRect.y + cropRect.h);
                      const finalW = Math.abs(cropRect.w);
                      const finalH = Math.abs(cropRect.h);
                      
                      canvas.width = finalW;
                      canvas.height = finalH;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(
                          imageElement,
                          finalX, finalY, finalW, finalH,
                          0, 0, finalW, finalH
                        );
                        canvas.toBlob((blob) => {
                          if (blob) {
                            const url = URL.createObjectURL(blob);
                            setImageSrc(url);
                            setRects([]); // Force redetection
                            setCustomOrder([]);
                            setDisabledIndices(new Set());
                            setFrameDurations({});
                            setSelectedRectIndex(null);
                          }
                        });
                      }
                    }
                    setShowCropModal(false);
                    setCropRect(null);
                  }}
                  className="px-8 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t.cropProceed}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar: Settings */}
      <div className="w-full lg:w-80 border-b lg:border-r border-neutral-800 bg-neutral-900 flex flex-col shrink-0 max-h-[30vh] lg:max-h-full overflow-y-auto">
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
              <Globe className="w-5 h-5" />
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

      {/* Main Area: Canvas */}
      <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
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
          {imageSrc ? (
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
        </div>
      </div>

      {/* Right Sidebar: Preview & Export */}
      <div className="w-full lg:w-80 border-t lg:border-l border-neutral-800 bg-neutral-900 flex flex-col shrink-0 max-h-[40vh] lg:max-h-full overflow-y-auto">
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
        
        <div className="p-4 border-b border-neutral-800 flex flex-col items-center justify-center min-h-[200px] relative overflow-hidden">
          {/* Preview Background Layer */}
          <div className={`absolute inset-0 z-0 ${
            previewBg === 'checker' ? "bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/ENBwGzVgwGEYhAGBZIA/ENBwGwB5EwM/w1b3XwAAAABJRU5ErkJggg==')]" : 
            previewBg === 'white' ? "bg-white" :
            previewBg === 'black' ? "bg-black" :
            previewBg === 'green' ? "bg-[#00ff00]" :
            "bg-[#ff00ff]"
          }`} />
          <canvas 
            ref={previewCanvasRef} 
            className="relative z-10" 
            style={{ 
              imageRendering: 'pixelated', 
              transform: 'scale(2)',
              mixBlendMode: blendMode === 'screen' ? 'screen' : 'normal'
            }} 
          />
          
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
          <div className="flex items-center justify-between gap-2">
              <button 
                onClick={() => setCurrentFrame(prev => prev > 0 ? prev - 1 : playableRects.length - 1)}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors disabled:opacity-50"
                disabled={playableRects.length === 0}
                title={t.prevFrame}
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/20"
                disabled={playableRects.length === 0}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {isPlaying ? t.pause : t.play}
              </button>
              <button 
                onClick={() => setCurrentFrame(prev => (prev + 1) % playableRects.length)}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors disabled:opacity-50"
                disabled={playableRects.length === 0}
                title={t.nextFrame}
              >
                <SkipForward className="w-5 h-5" />
              </button>
              <div className="text-xs text-neutral-400 bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800 whitespace-nowrap">
                {playableRects.length > 0 ? currentFrame + 1 : 0} / {playableRects.length}
              </div>
            </div>

          {playableRects.length > 0 && (
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
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 border border-neutral-800 rounded bg-neutral-950">
                    {customOrder.map((globalIndex) => {
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
                        />
                      );
                    })}
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
                onClick={handleExportSpritesheet}
                disabled={playableRects.length === 0}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] border border-neutral-700"
              >
                <Layers className="w-3 h-3 text-blue-400" />
                {t.exportSpritesheet}
              </button>
              <button 
                onClick={handleExportMetadata}
                disabled={playableRects.length === 0}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded font-bold transition-colors disabled:opacity-50 text-[10px] border border-neutral-700"
              >
                <FileJson className="w-3 h-3 text-amber-400" />
                {t.exportMetadata}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col min-h-0">
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
            className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 text-xs font-mono text-emerald-400/80 focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
