const ICONS = {
  // Playback
  play: (
    <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" />
  ),
  pause: (
    <>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    </>
  ),
  skipBack: (
    <>
      <path d="M18.5 4.5v15l-11-7.5 11-7.5z" fill="currentColor" />
      <rect x="4.5" y="4.5" width="2.2" height="15" rx="1" fill="currentColor" />
    </>
  ),
  skipForward: (
    <>
      <path d="M5.5 4.5v15l11-7.5-11-7.5z" fill="currentColor" />
      <rect x="17.3" y="4.5" width="2.2" height="15" rx="1" fill="currentColor" />
    </>
  ),
  shuffle: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5h3.5L15 17.5h6" />
      <path d="M17.5 4.5 21 8l-3.5 3.5" />
      <path d="M3 17.5h3.5l2.7-3.4" />
      <path d="M13 8.9 15 6.5" />
      <path d="M17.5 20.5 21 17l-3.5-3.5" />
    </g>
  ),

  // Favorites / ratings
  heartFilled: (
    <path
      d="M12 20.5s-7.5-4.6-9.8-9.2C.6 8 2.2 4.5 5.6 4a5 5 0 0 1 6.4 2.6A5 5 0 0 1 18.4 4c3.4.5 5 4 3.4 7.3-2.3 4.6-9.8 9.2-9.8 9.2z"
      fill="currentColor"
    />
  ),
  heartOutline: (
    <path
      d="M12 20.5s-7.5-4.6-9.8-9.2C.6 8 2.2 4.5 5.6 4a5 5 0 0 1 6.4 2.6A5 5 0 0 1 18.4 4c3.4.5 5 4 3.4 7.3-2.3 4.6-9.8 9.2-9.8 9.2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  starFilled: (
    <path
      d="M12 2.5l2.9 6.3 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.5 1.5-6.7-5.1-4.6 6.8-.7L12 2.5z"
      fill="currentColor"
    />
  ),
  starOutline: (
    <path
      d="M12 2.5l2.9 6.3 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.5 1.5-6.7-5.1-4.6 6.8-.7L12 2.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),

  // Folders / files
  folder: (
    <path
      d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.6l1.8 2h8.6A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  trash: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
      <path d="M10.3 11v6" />
      <path d="M13.7 11v6" />
    </g>
  ),
  video: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="7" width="13" height="11" rx="1.3" />
      <path d="M16 10.5l5-2.7v9.4l-5-2.7" strokeLinecap="round" />
    </g>
  ),

  // Status / feedback
  warning: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 21.5 20h-19L12 3.5z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ),
  check: (
    <path
      d="M4.5 12.5l5 5 10-11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  undo: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 5.5v5.5H10" />
      <path d="M5.2 15.5A8 8 0 1 0 6.8 7.2L4.5 11" />
    </g>
  ),

  // Music / library
  musicNote: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17.5V5.5l10-2v12" />
      <circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="15.5" r="2.5" fill="currentColor" stroke="none" />
    </g>
  ),
  diamond: (
    <path
      d="M12 3l6.5 9-6.5 9-6.5-9L12 3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  search: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19.5 19.5l-4.8-4.8" />
    </g>
  ),

  // Arrows / carets
  arrowUp: (
    <path
      d="M12 19V5M5.5 11 12 4.5 18.5 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  arrowDown: (
    <path
      d="M12 5v14M5.5 13 12 19.5 18.5 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  arrowLeft: (
    <path
      d="M19 12H5M11 5.5 4.5 12 11 18.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  arrowRight: (
    <path
      d="M5 12h14M13 5.5 19.5 12 13 18.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  caretDown: (
    <path
      d="M6 9.5 12 15.5 18 9.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  chevronRight: (
    <path
      d="M9 5.5 15.5 12 9 18.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),

  // Title bar / chrome
  windowGrid: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1" />
    </g>
  ),
  panels: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="16" rx="1.3" />
      <path d="M9.5 4v16" />
      <path d="M9.5 10.5H20.5" />
    </g>
  ),
  command: (
    <path
      d="M8.2 4.5a2.7 2.7 0 1 0 2.7 2.7v9.6a2.7 2.7 0 1 0 2.7-2.7H6.4a2.7 2.7 0 1 0 2.7 2.7V7.2a2.7 2.7 0 1 0-2.7 2.7h11.2a2.7 2.7 0 1 0-2.7-2.7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  ),
  keyboard: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <rect x="2.5" y="6" width="19" height="12" rx="1.6" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01" />
      <path d="M6 13.5h12" />
    </g>
  ),
  stethoscope: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v6a4.5 4.5 0 0 0 9 0V4" />
      <path d="M6 4H4.3M15 4h1.7" />
      <path d="M15 10v2.5a5.5 5.5 0 0 1-11 0V10" />
      <circle cx="18.5" cy="16" r="2.3" />
    </g>
  ),
  gear: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </g>
  ),
  compact: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 13 11" />
      <path d="M10 19.5H4.5V14" />
      <path d="M4.5 19.5 11 13" />
    </g>
  ),
  lockClosed: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9.5" rx="1.6" />
      <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" strokeLinecap="round" />
    </g>
  ),
  lockOpen: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9.5" rx="1.6" />
      <path d="M7.5 11V7.5a4.5 4.5 0 0 1 8.6-1.8" strokeLinecap="round" />
    </g>
  ),
  windowRestore: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="7" y="4.5" width="12.5" height="12.5" rx="1" />
      <path d="M16.5 7.5H4.5v12.5H17V17.5" />
    </g>
  ),
  windowMaximize: <rect x="4.5" y="4.5" width="15" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  windowMinimize: (
    <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  ),
  close: (
    <path
      d="M6 6l12 12M18 6L6 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  ),

  // Misc
  newGroup: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.2" />
      <path d="M12 8v8M8 12h8" />
    </g>
  ),
  sortAlpha: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h6M4 10.5h9M4 15h12" />
      <path d="M17.5 4v14M14.5 15l3 3 3-3" />
    </g>
  ),
  section: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M4 12h11" />
      <path d="M4 17h16" />
    </g>
  ),
  divider: (
    <path
      d="M4 12h16M4 12v2.5M20 12v2.5M4 12V9.5M20 12V9.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  ),
  profile: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" />
    </g>
  ),
  rename: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
    </g>
  ),
  convert: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5a7 7 0 0 1 12.5-4.3M20 5v5h-5" />
      <path d="M20 14.5a7 7 0 0 1-12.5 4.3M4 19v-5h5" />
    </g>
  ),
  gripDots: (
    <g fill="currentColor">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </g>
  ),
  info: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ),
  volumeMute: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 9.5h3.3L11 5.8v12.4l-4.2-3.7H3.5z" fill="currentColor" stroke="none" />
      <path d="M15.5 9.5 20 14M20 9.5l-4.5 4.5" />
    </g>
  ),
  volumeLow: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 9.5h3.3L11 5.8v12.4l-4.2-3.7H3.5z" fill="currentColor" stroke="none" />
      <path d="M15.5 9.8a4 4 0 0 1 0 4.4" />
    </g>
  ),
  volumeHigh: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 9.5h3.3L11 5.8v12.4l-4.2-3.7H3.5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.3a6 6 0 0 1 0 7.4" />
      <path d="M18.2 6a9.5 9.5 0 0 1 0 12" />
    </g>
  ),
};

export default function Icon({ name, size = 16, className, style, title }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      className={className}
      style={{ flexShrink: 0, ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {glyph}
    </svg>
  );
}
