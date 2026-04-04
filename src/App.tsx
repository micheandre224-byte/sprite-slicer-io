/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import SpriteSlicer from './components/SpriteSlicer';
import Studio from './components/Studio';
import { CodeGeneratorPanel } from './components/CodeGeneratorPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [activeTab, setActiveTab] = useState<'slicer' | 'studio' | 'generator'>('slicer');

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
              onClick={() => setActiveTab('slicer')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'slicer' ? 'bg-emerald-500/20 text-emerald-500' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
            >
              Slicer
            </button>
            <button 
              onClick={() => setActiveTab('studio')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'studio' ? 'bg-emerald-500/20 text-emerald-500' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
            >
              Studio
            </button>
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative custom-scrollbar">
          {activeTab === 'slicer' && <SpriteSlicer />}
          {activeTab === 'studio' && <Studio />}
        </main>
      </div>
    </ErrorBoundary>
  );
}
