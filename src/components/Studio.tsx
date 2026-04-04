import React, { useState } from 'react';
import { Image as ImageIcon, Box, ArrowLeft, Lock, AlertTriangle, Key } from 'lucide-react';
import SpriteStudio from './SpriteStudio';
import ThreeDViewer from './ThreeDViewer';

export default function Studio() {
  const [mode, setMode] = useState<'selection' | 'sprite' | '3d'>('selection');
  const [isDevUnlocked, setIsDevUnlocked] = useState(false);
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState(false);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode === '3003') {
      setIsDevUnlocked(true);
      setShowCodePrompt(false);
      setAccessCode('');
      setCodeError(false);
    } else {
      setCodeError(true);
      setAccessCode('');
    }
  };

  if (mode === 'selection') {
    return (
      <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col items-center justify-center p-6">
        <div className="max-w-3xl w-full space-y-12 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">
              Bem-vindo ao <span className="text-emerald-500">Studio</span>
            </h1>
            <p className="text-neutral-400 text-lg max-w-xl mx-auto">
              Escolha o modo de trabalho para começar. Você pode trabalhar com sprites 2D ou modelos 3D.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Modo Sprite */}
            <button
              onClick={() => setMode('sprite')}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-emerald-500/50 transition-all duration-500 shadow-xl">
                <ImageIcon className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Modo Sprite</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Ambiente dedicado para edição, animação e geração de scripts para sprites 2D.
              </p>
            </button>

            {/* Modo 3D */}
            <button
              onClick={() => setMode('3d')}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-emerald-500/50 transition-all duration-500 shadow-xl">
                <Box className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Modo Modelo 3D</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Carregue, visualize e configure modelos 3D com ferramentas avançadas.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col">
      {/* Studio Topbar */}
      <div className="h-14 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 gap-4">
        <button
          onClick={() => setMode('selection')}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-bold">Voltar</span>
        </button>
        <div className="w-px h-6 bg-neutral-800" />
        <h2 className="text-white font-bold flex items-center gap-2">
          {mode === 'sprite' ? (
            <>
              <ImageIcon className="w-4 h-4 text-emerald-500" />
              Modo Sprite
            </>
          ) : (
            <>
              <Box className="w-4 h-4 text-emerald-500" />
              Modo Modelo 3D
            </>
          )}
        </h2>
      </div>

      {/* Studio Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
        {mode === 'sprite' ? (
          <SpriteStudio />
        ) : mode === '3d' && !isDevUnlocked ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500 relative">
            
            {showCodePrompt && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <form 
                  onSubmit={handleCodeSubmit}
                  className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl w-full max-w-sm flex flex-col items-center animate-in zoom-in-95 duration-200"
                >
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 text-emerald-500">
                    <Key className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Acesso Restrito</h3>
                  <p className="text-sm text-neutral-400 mb-6 text-center">
                    Insira o código de 4 dígitos para acessar a área de desenvolvimento.
                  </p>
                  
                  <input
                    type="password"
                    maxLength={4}
                    value={accessCode}
                    onChange={(e) => {
                      setAccessCode(e.target.value.replace(/\D/g, ''));
                      setCodeError(false);
                    }}
                    className={`w-full bg-neutral-950 border ${codeError ? 'border-red-500' : 'border-neutral-800'} rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] text-white focus:outline-none focus:border-emerald-500 transition-colors mb-2`}
                    placeholder="••••"
                    autoFocus
                  />
                  
                  {codeError && (
                    <p className="text-red-500 text-xs mb-4">Código incorreto. Tente novamente.</p>
                  )}
                  
                  <div className="flex gap-3 w-full mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCodePrompt(false);
                        setAccessCode('');
                        setCodeError(false);
                      }}
                      className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={accessCode.length !== 4}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:text-white/50 text-white rounded-xl font-bold transition-colors"
                    >
                      Acessar
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="relative">
              <div 
                className="w-24 h-24 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center mb-8 relative group cursor-pointer"
                onDoubleClick={() => setShowCodePrompt(true)}
                title="Acesso Restrito (Duplo clique para inserir código)"
              >
                <div className="absolute inset-0 bg-emerald-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <Lock className="w-10 h-10 text-emerald-500/50" />
                <AlertTriangle className="w-5 h-5 text-amber-500 absolute -bottom-2 -right-2 bg-neutral-900 rounded-full" />
              </div>
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              Em Desenvolvimento
            </h2>
            
            <div className="max-w-md space-y-4 text-neutral-400 leading-relaxed mb-10">
              <p>
                O Modo Modelo 3D ainda está em fase experimental e incompleto.
              </p>
              <p className="text-sm opacity-80">
                Estamos trabalhando para aprimorar os pontos essenciais e tornar a experiência mais intuitiva. O acesso público está temporariamente restrito.
              </p>
            </div>
            
            <button 
              onClick={() => setMode('selection')} 
              className="px-8 py-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-white rounded-2xl font-bold transition-all flex items-center gap-3"
            >
              <ArrowLeft className="w-5 h-5" />
              Voltar para o Início
            </button>
          </div>
        ) : (
          <ThreeDViewer />
        )}
      </div>
    </div>
  );
}
