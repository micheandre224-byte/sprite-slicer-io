import React, { useState, useEffect } from 'react';
import { loadModel, getBaseScript, customizeCode, downloadCode } from '../utils/codeGenerator';
import { Download, Copy, Wand2, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

export const CodeGeneratorPanel: React.FC = () => {
  const [actionType, setActionType] = useState<string>('walk');
  const [code, setCode] = useState<string>('');
  const [userRequest, setUserRequest] = useState<string>('');
  
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<string>('');
  const [isModelReady, setIsModelReady] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load base script when action type changes
  useEffect(() => {
    setCode(getBaseScript(actionType));
    setUserRequest('');
    setError(null);
  }, [actionType]);

  const handleLoadModel = async () => {
    setIsModelLoading(true);
    setError(null);
    try {
      await loadModel((info) => {
        if (info.status === 'progress' && info.progress) {
          setModelProgress(Math.round(info.progress));
          setModelStatus(`Baixando modelo... ${Math.round(info.progress)}%`);
        } else if (info.status === 'ready') {
          setIsModelReady(true);
          setIsModelLoading(false);
          setModelStatus('IA Pronta!');
        } else if (info.status === 'initiate') {
          setModelStatus('Iniciando IA...');
        } else if (info.status === 'download') {
          setModelStatus('Iniciando download do modelo...');
        }
      });
    } catch (err) {
      console.error(err);
      setError('Falha ao carregar o modelo de IA. Verifique sua conexão.');
      setIsModelLoading(false);
    }
  };

  const handleCustomize = async () => {
    if (!userRequest.trim()) return;
    
    if (!isModelReady) {
      await handleLoadModel();
      // If it failed to load, don't proceed
      if (!isModelReady && error) return;
    }

    setIsGenerating(true);
    setError(null);
    setModelStatus('Personalizando código...');

    try {
      const newCode = await customizeCode(actionType, getBaseScript(actionType), userRequest);
      setCode(newCode);
      setModelStatus('Código personalizado com sucesso!');
    } catch (err) {
      console.error(err);
      setError('Falha ao personalizar o código. Tente novamente.');
      setModelStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = `${actionType.charAt(0).toUpperCase() + actionType.slice(1)}Action3D.cs`;
    downloadCode(code, filename);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white rounded-lg overflow-hidden border border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-emerald-400" />
          Gerador de Scripts 3D (Híbrido)
        </h2>
        
        <select 
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          className="w-full sm:w-auto bg-gray-800 border border-gray-700 text-white text-sm rounded-md focus:ring-emerald-500 focus:border-emerald-500 block p-2"
        >
          <option value="walk">WalkAction3D</option>
          <option value="attack">AttackAction3D</option>
          <option value="hurt">HurtAction3D</option>
          <option value="vfx">VFXAction3D</option>
          <option value="idle">IdleAction3D</option>
        </select>
      </div>

      {/* Beta Warning Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 p-3 px-4 flex items-start gap-3 text-amber-200/90 text-sm">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-400 mb-0.5">Aviso: Ferramenta em fase Beta</p>
          <p>Esta funcionalidade ainda está em desenvolvimento e pode apresentar instabilidades. No momento, a geração e personalização de scripts é <strong>totalmente suportada apenas em C# (Unity)</strong>. O suporte para outras linguagens, como JavaScript (Three.js), está em fase de testes.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden">
        
        {/* Left Panel: Customization */}
        <div className="w-full md:w-1/3 p-4 border-b md:border-b-0 md:border-r border-gray-800 flex flex-col gap-4 shrink-0 md:overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Como deseja personalizar?
            </label>
            <textarea
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              placeholder="Ex: Mude a tecla de corrida para RightCtrl e aumente o runSpeed para 10..."
              className="w-full h-32 shrink-0 bg-gray-800 border border-gray-700 rounded-md p-3 text-sm text-white placeholder-gray-500 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>

          <button
            onClick={handleCustomize}
            disabled={isGenerating || isModelLoading || !userRequest.trim()}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Personalizando...</>
            ) : isModelLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Carregando IA...</>
            ) : (
              <><Wand2 className="w-4 h-4" /> Personalizar com IA</>
            )}
          </button>

          {/* Status & Progress */}
          {(isModelLoading || isModelReady || isGenerating) && (
            <div className="mt-2 p-3 bg-gray-800 rounded-md border border-gray-700">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300">{modelStatus}</span>
                {isModelLoading && <span className="text-emerald-400">{modelProgress}%</span>}
              </div>
              {isModelLoading && (
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div 
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${modelProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-2 p-3 bg-red-900/30 border border-red-800 rounded-md flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-auto pt-4 text-xs text-gray-500">
            <p>O modelo de IA (Gemini 3.1 Flash) agora roda via API. Isso garante respostas instantâneas e zero consumo de memória do seu celular! 🚀</p>
          </div>
        </div>

        {/* Right Panel: Code Preview */}
        <div className="w-full md:w-2/3 flex flex-col bg-[#1e1e1e] min-h-[500px] md:min-h-0">
          <div className="flex justify-between items-center p-2 bg-[#2d2d2d] border-b border-gray-800">
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs text-gray-400 font-mono">
                {actionType.charAt(0).toUpperCase() + actionType.slice(1)}Action3D.cs
              </span>
              <span className="bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border border-gray-600/50" title="Você pode editar o código diretamente aqui">
                Editável
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .cs
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-4 bg-transparent text-sm font-mono text-gray-300 resize-none outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
