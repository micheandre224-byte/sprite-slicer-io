import React, { useState } from 'react';
import { Image as ImageIcon, ArrowLeft, Wand2, Zap, Film } from 'lucide-react';
import SpriteStudio from './SpriteStudio';
import SpriteSlicer from './SpriteSlicer';
import { CodeGeneratorPanel } from './CodeGeneratorPanel';

interface StudioProps {
  mode: 'selection' | 'sprite_sub_selection' | 'sprite_movesets' | 'generator';
  setMode: (mode: 'selection' | 'sprite_sub_selection' | 'sprite_movesets' | 'generator') => void;
  onSelectMovesets?: () => void;
}

export default function Studio({ mode, setMode, onSelectMovesets }: StudioProps) {

  if (mode === 'selection') {
    return (
      <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/60 via-neutral-950 to-neutral-950">
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
              onClick={() => setMode('sprite_sub_selection')}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-emerald-500/50 transition-all duration-500 shadow-xl">
                <ImageIcon className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Modo Sprite 2D</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Suíte de ferramentas 2D para edição, animação em loops e testes de combate/moveset.
              </p>
            </button>

            {/* Modo Gerador 3D */}
            <button
              onClick={() => setMode('generator')}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden shadow-xl"
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

  if (mode === 'sprite_sub_selection') {
    return (
      <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col p-6 overflow-y-auto bg-[gradient-to-b_from-neutral-900/20_to-neutral-950]">
        <div className="max-w-4xl w-full mx-auto space-y-10 my-auto animate-in fade-in zoom-in-95 duration-350">
          
          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-4">
            <button
              onClick={() => setMode('selection')}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-850 px-3 py-1.5 rounded-lg border border-neutral-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Menu Principal
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tighter">
              Suíte de <span className="text-emerald-500">Sprites 2D</span>
            </h1>
            <p className="text-neutral-400 text-sm md:text-base max-w-xl mx-auto">
              Selecione a ferramenta 2D ideal para o seu fluxo de desenvolvimento atual.
            </p>
          </div>

          {/* Arena de Movesets (Centralizado agora que o Animador foi removido) */}
          <div className="flex justify-center w-full">
            <button
              onClick={() => {
                if (onSelectMovesets) {
                  onSelectMovesets();
                } else {
                  setMode('sprite_movesets');
                }
              }}
              className="group relative flex flex-col items-center text-center p-10 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-amber-500/50 hover:bg-neutral-850/60 transition-all duration-300 overflow-hidden shadow-xl max-w-md w-full"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-115 group-hover:border-amber-500/50 transition-all duration-500 shadow-md">
                <Zap className="w-10 h-10 text-amber-500 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Arena de Movesets</h2>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-xs">
                Mapeie golpes, configure loops de ignição e teste mecânicas de luta em tempo real com HUD de HP.
              </p>
              <div className="mt-8 px-6 py-3 bg-amber-500 text-neutral-950 rounded-xl text-sm font-black group-hover:bg-amber-400 transition-all duration-300 flex items-center gap-2 font-mono uppercase tracking-widest shadow-lg shadow-amber-500/20">
                Iniciar Arena
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-neutral-950 text-neutral-300 font-mono flex flex-col">
      {/* Studio Topbar */}
      <div className="h-14 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 gap-4 flex-none">
        <button
          onClick={() => {
            if (mode === 'sprite_movesets') {
              setMode('sprite_sub_selection');
            } else {
              setMode('selection');
            }
          }}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-bold">Voltar</span>
        </button>
        <div className="w-px h-6 bg-neutral-800" />
        <h2 className="text-white font-bold flex items-center gap-2 text-sm sm:text-base">
          {mode === 'sprite_movesets' && (
            <>
              <Zap className="w-4 h-4 text-amber-500 animate-bounce" />
              Modo Movesets: Arena de Combate
            </>
          )}
          {mode === 'generator' && (
            <>
              <Wand2 className="w-4 h-4 text-emerald-400" />
              Gerador de Scripts 3D
            </>
          )}
        </h2>
      </div>

      {/* Studio Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
        {mode === 'sprite_movesets' && (
          <SpriteSlicer isCombatMode={true} />
        )}
        {mode === 'generator' && (
          <div className="h-full p-2 md:p-6 overflow-y-auto">
            <CodeGeneratorPanel />
          </div>
        )}
      </div>
    </div>
  );
}
