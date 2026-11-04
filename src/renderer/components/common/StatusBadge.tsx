import React from 'react';
import type { DeviceStatus } from '../../types';

interface StatusBadgeProps {
  status: DeviceStatus | 'active' | 'idle' | 'ready' | 'unavailable' | 'installed' | 'missing' | 'error';
  label?: string;
  text?: string;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const statusConfig: Record<string, { color: string; bg: string; dot: string }> = {
  connected: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  installed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  active: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  ready: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400' },
  connecting: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  missing: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  disconnected: { color: 'text-surface-400', bg: 'bg-surface-500/10 border-surface-500/20', dot: 'bg-surface-500' },
  idle: { color: 'text-surface-400', bg: 'bg-surface-500/10 border-surface-500/20', dot: 'bg-surface-500' },
  unauthorized: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400' },
  error: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
  unavailable: { color: 'text-surface-500', bg: 'bg-surface-500/10 border-surface-600/20', dot: 'bg-surface-600' },
};

export default function StatusBadge({ status, label, text, size = 'sm', pulse = false }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.disconnected;
  const displayLabel = label || text || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 border rounded-full font-medium
        ${config.bg} ${config.color}
        ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}
      `}
    >
      <span className={`relative flex h-1.5 w-1.5`}>
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dot}`} />
      </span>
      {displayLabel}
    </span>
  );
}

