import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, AlertTriangle, CheckCircle2, FileJson, RefreshCw, Upload, Image as ImageIcon, ArrowRight, HelpCircle, X } from 'lucide-react';

interface LoopConfig {
  enabled: boolean;
  startFrame: number;
  endFrame: number;
  repeatCount: number;
  ignitionFrame?: number;
}

interface SpriteData {
  frames: any[];
  loop?: LoopConfig;
  [key: string]: any;
}

export default function SpriteStudio() {
  const [jsonInput, setJsonInput] = useState<string>('{\n  "frames": []\n}');
  const [parsedData, setParsedData] = useState<SpriteData | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // File Upload State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  
  // Loop State
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(0);
  const [repeatCount, setRepeatCount] = useState(-1);
  const [ignitionFrame, setIgnitionFrame] = useState(0);
  
  // Preview State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPreviewFrame, setCurrentPreviewFrame] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPos, setTutorialPos] = useState({ top: 0, left: 0, show: false });

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('spriteStudioTutorialSeen');
    if (!hasSeenTutorial) {
      // Small delay to ensure elements are rendered
      setTimeout(() => setShowTutorial(true), 500);
      localStorage.setItem('spriteStudioTutorialSeen', 'true');
    }
  }, []);

  const tutorialSteps = [
    {
      target: 'tutorial-json-upload',
      title: 'Carregar JSON',
      content: 'Primeiro, cole aqui o JSON gerado pelo Slicer.io ou faça upload do arquivo.',
      position: 'bottom'
    },
    {
      target: 'tutorial-image-upload',
      title: 'Carregar Imagem',
      content: 'Em seguida, selecione a imagem (spritesheet) correspondente para que a animação possa acontecer.',
      position: 'bottom'
    },
    {
      target: 'tutorial-preview',
      title: 'Preview da Animação',
      content: 'Aqui você verá a animação em ação! Ajuste o loop e os frames conforme necessário.',
      position: 'left'
    }
  ];

  useEffect(() => {
    if (!showTutorial) return;

    const updatePosition = () => {
      const step = tutorialSteps[tutorialStep];
      const targetEl = document.getElementById(step.target);
      
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        let top = rect.bottom + 16;
        let left = rect.left;
        
        if (step.position === 'left') {
          top = rect.top;
          left = rect.left - 320 - 16;
          // Adjust if it goes off screen
          if (left < 16) left = 16;
        }
        
        setTutorialPos({ top, left, show: true });
      } else {
        // Fallback to center if element not found
        setTutorialPos({ 
          top: window.innerHeight / 2 - 100, 
          left: window.innerWidth / 2 - 160, 
          show: true 
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [showTutorial, tutorialStep]);

  const nextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      setTutorialStep(0);
    }
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setShowTutorial(true);
  };

  // Parse JSON when input changes
  useEffect(() => {
    try {
      const data = JSON.parse(jsonInput);
      setParsedData(data);
      setJsonError(null);
      
      // Update loop state from JSON if it exists and we haven't manually edited it recently
      if (data.loop) {
        setLoopEnabled(data.loop.enabled ?? false);
        setStartFrame(data.loop.startFrame ?? 0);
        setEndFrame(data.loop.endFrame ?? 0);
        setRepeatCount(data.loop.repeatCount ?? -1);
        setIgnitionFrame(data.loop.ignitionFrame ?? 0);
      }
      
      // Ensure endFrame is within bounds if frames exist
      if (data.frames && Array.isArray(data.frames) && data.frames.length > 0) {
        if (endFrame >= data.frames.length) {
           setEndFrame(data.frames.length - 1);
        }
      }
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [jsonInput]);

  // Update JSON when loop settings change
  const updateJsonWithLoop = (overrides?: Partial<LoopConfig>) => {
    if (!parsedData) return;
    
    try {
      const newData = { ...parsedData };
      newData.loop = {
        enabled: loopEnabled,
        startFrame,
        endFrame,
        repeatCount,
        ignitionFrame,
        ...overrides
      };
      
      setJsonInput(JSON.stringify(newData, null, 2));
    } catch (e) {
      console.error("Failed to update JSON", e);
    }
  };

  // Format JSON
  const formatJson = () => {
    try {
      const data = JSON.parse(jsonInput);
      setJsonInput(JSON.stringify(data, null, 2));
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  // Handlers for File Uploads
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setJsonInput(result);
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageSrc(result);
      const img = new Image();
      img.onload = () => setImageElement(img);
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const animationStateRef = useRef<"STOPPED" | "PLAYING_INITIAL" | "LOOPING">("STOPPED");
  const loopCountRef = useRef<number>(0);
  const internalFrameRef = useRef<number>(currentPreviewFrame);
  const hasIgnitedRef = useRef<boolean>(false);

  const handleWalkPress = () => {
    // Reinicia tudo para tocar a parte inicial novamente
    animationStateRef.current = "PLAYING_INITIAL";
    internalFrameRef.current = 0;
    hasIgnitedRef.current = false;
    loopCountRef.current = 0;
    lastFrameTimeRef.current = 0;

    setCurrentPreviewFrame(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!isPlaying) {
      internalFrameRef.current = currentPreviewFrame;
      if (currentPreviewFrame < ignitionFrame) {
        hasIgnitedRef.current = false;
        animationStateRef.current = "PLAYING_INITIAL";
      }
    }
  }, [currentPreviewFrame, isPlaying, ignitionFrame]);

  // Reset loop count when play starts or loop settings change
  useEffect(() => {
    loopCountRef.current = 0;
  }, [isPlaying, loopEnabled, startFrame, endFrame, repeatCount, ignitionFrame]);

  // ====================== ANIMATION LOOP CORRIGIDO ======================
  useEffect(() => {
    if (!isPlaying || !parsedData || !parsedData.frames || parsedData.frames.length === 0) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const animate = (time: number) => {
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = time;
      const deltaTime = time - lastFrameTimeRef.current;

      const frameDuration = 100; // ← mude para parsedData.speed * 1000 se quiser usar o valor do JSON

      if (deltaTime > frameDuration) {
        let currentFrame = internalFrameRef.current;

        if (loopEnabled) {
          if (animationStateRef.current === "PLAYING_INITIAL") {
            // === PARTE INICIAL (VERDE) - toca só uma vez ===
            currentFrame++;

            if (currentFrame > ignitionFrame) {
              // Chegou no final da ignição → vai para o loop
              currentFrame = ignitionFrame + 1;
              animationStateRef.current = "LOOPING";
              hasIgnitedRef.current = true;
            }
          } 
          else if (animationStateRef.current === "LOOPING") {
            // === PARTE DE LOOP (AZUL) ===
            currentFrame++;

            if (currentFrame > endFrame) {
              if (repeatCount === -1) {
                currentFrame = ignitionFrame + 1;   // loop infinito
              } else if (loopCountRef.current < repeatCount) {
                loopCountRef.current += 1;
                currentFrame = ignitionFrame + 1;
              } else {
                // terminou os repeats
                setIsPlaying(false);
                if (animationRef.current) cancelAnimationFrame(animationRef.current);
                return;
              }
            }
          }
        } 
        else {
          // Sem loop ativado - comportamento normal
          if (currentFrame >= parsedData.frames.length) {
            setIsPlaying(false);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
          }
          currentFrame++;
        }

        // Atualiza o frame na tela
        setCurrentPreviewFrame(currentFrame);
        internalFrameRef.current = currentFrame;
        lastFrameTimeRef.current = time;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, parsedData, loopEnabled, ignitionFrame, startFrame, endFrame, repeatCount]);

  // Reset preview frame when bounds change
  useEffect(() => {
     if (loopEnabled) {
         if (currentPreviewFrame > endFrame && currentPreviewFrame > ignitionFrame) {
             setCurrentPreviewFrame(startFrame);
             internalFrameRef.current = startFrame;
         }
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopEnabled, startFrame, endFrame, ignitionFrame]);


  const handleExport = () => {
    if (jsonError) {
      alert("Corrija os erros no JSON antes de exportar.");
      return;
    }
    
    // Ensure latest loop settings are in the JSON
    const dataToExport = parsedData ? { ...parsedData } : JSON.parse(jsonInput);
    dataToExport.loop = {
        enabled: loopEnabled,
        startFrame,
        endFrame,
        repeatCount,
        ignitionFrame
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sprite_data_with_loop.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const frameCount = parsedData?.frames?.length || 0;

  // Extract current frame rect for preview
  const currentFrameData = parsedData?.frames?.[currentPreviewFrame];
  let rect = null;
  if (currentFrameData) {
    if (typeof currentFrameData.x === 'number') {
      rect = currentFrameData;
    } else if (currentFrameData.frame && typeof currentFrameData.frame.x === 'number') {
      rect = currentFrameData.frame;
    }
  }

  return (
    <div className="flex flex-col h-full w-full gap-4 p-4 overflow-hidden">
      
      {/* Top Bar for Uploads */}
      <div className="flex-none bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center gap-4 relative">
        <label id="tutorial-json-upload" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all cursor-pointer shadow-lg shadow-emerald-900/20">
          <FileJson className="w-5 h-5" />
          Carregar JSON
          <input type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
        </label>
        <label id="tutorial-image-upload" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all cursor-pointer shadow-lg shadow-blue-900/20">
          <ImageIcon className="w-5 h-5" />
          Carregar Imagem
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
        
        {imageSrc && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 ml-auto mr-12">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Imagem carregada
          </div>
        )}
        
        <button 
          onClick={startTutorial}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-colors"
          title="Ver Tutorial"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-4 overflow-hidden">
        
        {/* Left Column: JSON Editor */}
        <div className="flex-1 flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden min-w-[300px]">
        <div className="h-12 border-b border-neutral-800 bg-neutral-950/50 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 text-emerald-500 font-bold">
            <FileJson className="w-4 h-4" />
            <span>Editor JSON</span>
          </div>
          <button 
            onClick={formatJson}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded-lg transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Formatar
          </button>
        </div>
        
        <div className="flex-1 relative">
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="absolute inset-0 w-full h-full bg-transparent text-neutral-300 p-4 font-mono text-sm resize-none focus:outline-none custom-scrollbar"
            spellCheck={false}
            placeholder="Cole o JSON gerado pelo Slicer aqui..."
          />
        </div>

        {/* Status Bar */}
        <div className={`h-10 border-t flex items-center px-4 text-xs font-bold ${jsonError ? 'bg-red-950/50 border-red-900/50 text-red-400' : 'bg-emerald-950/20 border-neutral-800 text-emerald-500'}`}>
          {jsonError ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="truncate">Erro de Sintaxe: {jsonError}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>JSON Válido</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Loop Editor & Preview */}
      <div className="w-full lg:w-[400px] xl:w-[500px] flex flex-col gap-4">
        
        {/* Preview Area */}
        <div id="tutorial-preview" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col h-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Preview da Animação</h3>
            <div className="flex gap-2">
              <button
                onClick={handleWalkPress}
                disabled={frameCount === 0}
                title="Testar Ignição (Reiniciar)"
                className="p-2 rounded-lg transition-colors bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  if (!isPlaying) {
                    if (currentPreviewFrame >= frameCount - 1) {
                      hasIgnitedRef.current = false;
                      internalFrameRef.current = 0;
                      setCurrentPreviewFrame(0);
                      animationStateRef.current = "PLAYING_INITIAL";
                    } else {
                      internalFrameRef.current = currentPreviewFrame;
                      if (currentPreviewFrame <= ignitionFrame) {
                        animationStateRef.current = "PLAYING_INITIAL";
                      } else {
                        animationStateRef.current = "LOOPING";
                      }
                    }
                  }
                  setIsPlaying(!isPlaying);
                }}
                disabled={frameCount === 0}
                className={`p-2 rounded-lg transition-colors ${isPlaying ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div className="flex-1 bg-neutral-950 rounded-xl border border-neutral-800 flex items-center justify-center relative overflow-hidden">
            {frameCount > 0 ? (
              <div className="text-center flex flex-col items-center justify-center w-full h-full">
                {imageSrc && rect ? (
                  <div className="relative flex items-center justify-center flex-1 w-full h-full">
                    <div 
                      style={{
                        width: rect.w,
                        height: rect.h,
                        backgroundImage: `url(${imageSrc})`,
                        backgroundPosition: `-${rect.x}px -${rect.y}px`,
                        backgroundRepeat: 'no-repeat',
                        transform: 'scale(2)',
                        imageRendering: 'pixelated'
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-6xl font-bold text-neutral-700 mb-2">
                    {currentPreviewFrame}
                  </div>
                )}
                <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-neutral-500">
                  Frame Atual: {currentPreviewFrame}
                </div>
                {!imageSrc && (
                  <div className="absolute bottom-2 right-2 text-[10px] text-neutral-600">
                    Carregue a imagem para ver o sprite
                  </div>
                )}
              </div>
            ) : (
              <div className="text-neutral-600 text-sm">Nenhum frame no JSON</div>
            )}
          </div>
        </div>

        {/* Loop Configuration */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white">Configuração de Loop</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={loopEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setLoopEnabled(checked);
                  updateJsonWithLoop({ enabled: checked });
                }}
                className="w-4 h-4 accent-emerald-500 rounded bg-neutral-800 border-neutral-700"
              />
              <span className="text-sm text-neutral-300">Ativar Loop</span>
            </label>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${loopEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            
            {/* Visual Frame Selector */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 uppercase tracking-wider">Seleção de Frames</label>
              <div className="flex flex-wrap gap-1 p-2 bg-neutral-950 rounded-xl border border-neutral-800 max-h-[150px] overflow-y-auto custom-scrollbar">
                {frameCount > 0 ? (
                  Array.from({ length: frameCount }).map((_, i) => {
                    const isStart = i === startFrame;
                    const isEnd = i === endFrame;
                    const isInLoop = i >= startFrame && i <= endFrame;
                    
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          // Simple logic: click sets start, shift+click sets end
                          // For a better UX, we could implement drag selection, but this works for now
                          let newStart = startFrame;
                          let newEnd = endFrame;
                          if (i < startFrame) {
                            newStart = i;
                            setStartFrame(i);
                          } else if (i > endFrame) {
                            newEnd = i;
                            setEndFrame(i);
                          } else {
                            // Clicked inside, bring start closer
                            newStart = i;
                            setStartFrame(i);
                          }
                          updateJsonWithLoop({ startFrame: newStart, endFrame: newEnd });
                        }}
                        className={`w-8 h-8 rounded text-xs font-bold flex items-center justify-center transition-all
                          ${i === currentPreviewFrame ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-950 z-20' : ''}
                          ${i < ignitionFrame ? 'bg-emerald-500/40 text-emerald-100' : 
                            i === ignitionFrame ? 'bg-yellow-500 text-black' : 
                            'bg-blue-500/40 text-blue-100'}
                        `}
                        title={`Frame ${i}`}
                      >
                        {i}
                      </button>
                    );
                  })
                ) : (
                  <div className="w-full text-center py-4 text-xs text-neutral-600">
                    Adicione frames no JSON para visualizar
                  </div>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 px-1 mt-2">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/40 border border-emerald-500/50 rounded-sm"></div> Fase de Ignição</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-sm"></div> Gatilho (Sensor)</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-sm"></div> Loop</span>
              </div>
            </div>

            {/* Manual Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Início do Loop</label>
                <input 
                  type="number" 
                  min={0}
                  max={Math.max(0, endFrame)}
                  value={startFrame}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setStartFrame(val);
                    updateJsonWithLoop({ startFrame: val });
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Fim do Loop</label>
                <input 
                  type="number" 
                  min={startFrame}
                  max={Math.max(0, frameCount - 1)}
                  value={endFrame}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEndFrame(val);
                    updateJsonWithLoop({ endFrame: val });
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Repetições</label>
                <input 
                  type="number" 
                  min={-1}
                  value={repeatCount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRepeatCount(val);
                    updateJsonWithLoop({ repeatCount: val });
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  title="-1 para infinito"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Gatilho de Ignição (Sensor)</label>
                <input 
                  type="number" 
                  min={0}
                  max={frameCount - 1}
                  value={ignitionFrame}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val < 0 || val >= frameCount) return;

                    setIgnitionFrame(val);
                    
                    // Reset do estado quando muda o ponto de ignição
                    animationStateRef.current = "PLAYING_INITIAL";
                    hasIgnitedRef.current = false;
                    internalFrameRef.current = 0;
                    
                    updateJsonWithLoop({ ignitionFrame: val });
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
                  title="Frame invisível que dispara o salto para o Loop"
                />
              </div>
            </div>
            <p className="text-[10px] text-neutral-500 text-center">
              Dica: Use a Seta Azul no preview para testar a Ignição. Use -1 em "Repetições" para loop infinito.
            </p>
          </div>

          <div className="mt-auto pt-4">
            <button 
              onClick={handleExport}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Exportar JSON Atualizado
            </button>
          </div>
        </div>

      </div>
    </div>
    
    {/* Tutorial Overlay */}
    {showTutorial && tutorialPos.show && (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={() => setShowTutorial(false)} />
        
        {tutorialSteps.map((step, index) => {
          if (index !== tutorialStep) return null;
          
          return (
            <div 
              key={index}
              className="absolute bg-neutral-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl shadow-emerald-900/20 w-[320px] pointer-events-auto animate-in fade-in zoom-in duration-300"
              style={{ top: tutorialPos.top, left: tutorialPos.left }}
            >
              <div className="absolute -top-3 left-6 w-6 h-6 bg-neutral-900 border-t border-l border-emerald-500/30 rotate-45" style={{ display: step.position === 'bottom' ? 'block' : 'none' }} />
              <div className="absolute top-6 -right-3 w-6 h-6 bg-neutral-900 border-t border-r border-emerald-500/30 rotate-45" style={{ display: step.position === 'left' ? 'block' : 'none' }} />
              
              <div className="flex items-start justify-between mb-2 relative z-10">
                <h3 className="text-emerald-400 font-bold text-lg">{step.title}</h3>
                <button onClick={() => setShowTutorial(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-neutral-300 text-sm mb-6 relative z-10">{step.content}</p>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex gap-1">
                  {tutorialSteps.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i === tutorialStep ? 'bg-emerald-500' : 'bg-neutral-700'}`} />
                  ))}
                </div>
                <button 
                  onClick={nextTutorialStep}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  {tutorialStep === tutorialSteps.length - 1 ? 'Concluir' : 'Próximo'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
}
