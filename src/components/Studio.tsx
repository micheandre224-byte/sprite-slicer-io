import React, { useState } from 'react';
import { Image as ImageIcon, ArrowLeft, Wand2 } from 'lucide-react';
import SpriteStudio from './SpriteStudio';
import { CodeGeneratorPanel } from './CodeGeneratorPanel';

export default function Studio() {
  const [mode, setMode] = useState<'selection' | 'sprite' | 'generator'>('selection');

  if (mode === 'selection') {
    return (
      <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col items-center justify-center p-6">
        <div className="max-w-3xl w-full space-y-12 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">
              Bem-vindo ao <span className="text-emerald-500">Studio</span>
            </h1>
            <p className="text-neutral-400 text-lg max-w-xl mx-auto">
              Escolha o modo de trabalho para começar. Você pode trabalhar com sprites 2D ou gerar scripts 3D.
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

            {/* Modo Gerador 3D */}
            <button
              onClick={() => setMode('generator')}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-emerald-500/50 transition-all duration-500 shadow-xl">
                <Wand2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Gerador 3D (IA)</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Gere e personalize scripts C# profissionais para Unity usando Inteligência Artificial.
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
              <Wand2 className="w-4 h-4 text-emerald-500" />
              Gerador de Scripts 3D
            </>
          )}
        </h2>
      </div>

      {/* Studio Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
        {mode === 'sprite' ? (
          <SpriteStudio />
        ) : (
          <div className="h-full p-2 md:p-6">
            <CodeGeneratorPanel />
          </div>
        )}
      </div>
    </div>
  );
}
