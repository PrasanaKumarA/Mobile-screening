import React from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

export default function TitleBar() {
  const isElectron = !!window.electronAPI;

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <div className="drag-region flex items-center justify-end h-8 bg-surface-950/80 border-b border-surface-800/50 px-2 select-none">
      {isElectron && (
        <div className="no-drag flex items-center gap-0.5">
          <button
            onClick={handleMinimize}
            className="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            title="Maximize"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-red-600 text-surface-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

