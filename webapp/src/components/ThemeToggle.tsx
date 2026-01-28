import React, { useState, useRef, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react';
import type { Theme } from '../store/theme';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeToggle({ showLabel = false, size = 'md' }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  const themes: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const buttonSizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  if (showLabel) {
    return (
      <div className="flex items-center space-x-1 rounded-lg p-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {themes.map(({ value, label, icon: Icon }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`
                flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }
              `}
              title={`Switch to ${label.toLowerCase()} mode`}
            >
              <Icon className={sizeClasses[size]} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown toggle button
  const currentTheme = themes.find(t => t.value === theme) || themes[0];
  const Icon = currentTheme.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`
          ${buttonSizeClasses[size]} rounded-lg transition-all duration-200
          bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
          text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100
          border border-gray-200 dark:border-gray-700
          flex items-center gap-1
        `}
        title={`Current: ${currentTheme.label} mode. Click to change theme.`}
      >
        <Icon className={sizeClasses[size]} />
        <ChevronDown className={`${sizeClasses[size]} transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {dropdownOpen && (
        <div className="absolute right-0 mt-1 min-w-40 rounded-md shadow-lg z-10 border overflow-hidden" 
             style={{ 
               backgroundColor: 'var(--bg-primary)', 
               borderColor: 'var(--border-primary)' 
             }}>
          {themes.map(({ value, label, icon: ThemeIcon }) => {
            const isActive = theme === value;
            return (
              <button
                key={value}
                onClick={() => {
                  setTheme(value);
                  setDropdownOpen(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                style={{ 
                  color: 'var(--text-primary)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <ThemeIcon className={`${sizeClasses[size]} mr-2 flex-shrink-0`} />
                <span>{label}</span>
                {isActive && (
                  <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

