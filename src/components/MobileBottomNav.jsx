import { platform } from '../platform';

const ITEMS = [
  {
    id: 'self',
    label: 'Self',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="7" r="3" />
        <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
      </svg>
    ),
  },
  {
    id: 'path',
    label: 'Path',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="18" cy="12" r="2.2" />
        <circle cx="8" cy="19" r="2.2" />
        <path d="M8 7.5c3 1 6 1.2 8 3.2" />
        <path d="M16.5 13.8c-2.2 1.4-5.2 3.2-7 4.4" />
      </svg>
    ),
  },
  {
    id: 'lifeline',
    label: 'Lifeline',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 17V9" />
        <path d="M12 17V7" />
        <path d="M16 17v-4" />
      </svg>
    ),
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    id: 'brand',
    label: 'Brand',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="3" />
        <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
        <path d="M19 4l1.5 1.5L19 7" />
      </svg>
    ),
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
];

export function MobileBottomNav({
  activeView,
  isLifeline = false,
  onNavigate,
  onOpenLifeline,
  hidden = false,
}) {
  if (!platform.isMobile || hidden) return null;

  const isItemActive = (item) => {
    if (item.id === 'lifeline') return isLifeline && activeView === 'roadmap';
    if (item.id === 'roadmap') return !isLifeline && activeView === 'roadmap';
    return item.id === activeView;
  };

  const handleClick = (item) => {
    if (item.id === 'lifeline') {
      onOpenLifeline?.();
      return;
    }
    onNavigate?.(item.id);
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      {ITEMS.map((item) => {
        const isActive = isItemActive(item);
        return (
          <button
            key={item.id}
            type="button"
            className={`mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`}
            onClick={() => handleClick(item)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="mobile-bottom-nav__icon">{item.icon}</span>
            <span className="mobile-bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
