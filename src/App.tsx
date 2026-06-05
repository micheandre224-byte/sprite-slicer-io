/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import SpriteSlicer from './components/SpriteSlicer';
import Studio from './components/Studio';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [activeTab, setActiveTab] = useState<'slicer' | 'studio'>('slicer');
  const [isCombatMode, setIsCombatMode] = useState(false);
  const [studioMode, setStudioMode] = useState<'selection' | 'sprite_sub_selection' | 'sprite_movesets' | 'generator'>('selection');

  const handleSetIsCombatMode = (value: boolean) => {
    setIsCombatMode(value);
    if (!value) {
      setStudioMode('sprite_sub_selection');
      setActiveTab('studio');
    }
  };

  const handleNavigationChange = (tab: 'slicer' | 'studio') => {
    setActiveTab(tab);
    // If they manually select Slicer from header, turn off Combat Mode so they see the editor
    if (tab === 'slicer') {
      setIsCombatMode(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-neutral-950 text-neutral-300 font-mono">
        {/* Navigation Bar */}
        <header className="flex-none h-14 border-b border-neutral-800 bg-neutral-900 flex items-center px-6 gap-6 z-50 relative">
          <div className="font-bold text-emerald-500 text-xl tracking-tighter">
            SLICER.IO
          </div>
          <nav className="flex gap-2">
            <button 
              onClick={() => handleNavigationChange('slicer')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'slicer' ? 'bg-emerald-500/20 text-emerald-500 font-black' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
            >
              Slicer
            </button>
            <button 
              onClick={() => handleNavigationChange('studio')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'studio' ? 'bg-emerald-500/20 text-emerald-500 font-black' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
            >
              Studio
            </button>
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          <div className={`flex-1 flex flex-col min-h-0 relative ${activeTab === 'slicer' ? '' : 'hidden'}`}>
            <SpriteSlicer 
              isCombatMode={isCombatMode} 
              setIsCombatMode={handleSetIsCombatMode} 
            />
          </div>
          <div className={`flex-1 flex flex-col min-h-0 relative ${activeTab === 'studio' ? '' : 'hidden'}`}>
            <Studio 
              mode={studioMode} 
              setMode={setStudioMode} 
              onSelectMovesets={() => {
                setIsCombatMode(true);
                setActiveTab('slicer');
              }}
            />
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
