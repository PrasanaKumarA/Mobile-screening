import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
  onClick?: () => void;
}

export default function Card({
  children,
  className = '',
  hover = false,
  padding = true,
  onClick,
}: CardProps) {
  return (
    <div
      className={`
        ${hover ? 'glass-card-hover cursor-pointer' : 'glass-card'}
        ${padding ? 'p-5' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

