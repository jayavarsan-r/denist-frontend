/* DentWay icons — 24x24 stroked, currentColor. */
function Icon({ name, size = 24, stroke = 2, color = 'currentColor', fill = 'none', style }) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" {...p}/><path d="M5 9.5V20h14V9.5" {...p}/></>,
    person: <><circle cx="12" cy="8" r="4" {...p}/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" {...p}/></>,
    calendar: <><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" {...p}/><path d="M3.5 9h17M8 2.5v4M16 2.5v4" {...p}/></>,
    chart: <><path d="M4 20V4M4 20h16" {...p}/><path d="M8 16l3.5-4 3 2.5L20 8" {...p}/></>,
    search: <><circle cx="11" cy="11" r="7" {...p}/><path d="m20 20-3.5-3.5" {...p}/></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" {...p}/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...p}/></>,
    plus: <path d="M12 5v14M5 12h14" {...p}/>,
    chevLeft: <path d="M15 5l-7 7 7 7" {...p}/>,
    chevRight: <path d="M9 5l7 7-7 7" {...p}/>,
    chevDown: <path d="M5 9l7 7 7-7" {...p}/>,
    phone: <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 1-2Z" {...p}/>,
    pencil: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" {...p}/><path d="M14 6l4 4" {...p}/></>,
    alert: <><path d="M12 3 2 20h20L12 3Z" {...p}/><path d="M12 9v5M12 17v.5" {...p}/></>,
    check: <path d="M5 12.5l5 5 9-10" {...p}/>,
    checkCircle: <><circle cx="12" cy="12" r="9" {...p}/><path d="M8 12.5l2.5 2.5L16 9.5" {...p}/></>,
    x: <path d="M6 6l12 12M18 6 6 18" {...p}/>,
    tooth: <path d="M7 3c-2.5 0-4 2-4 5 0 2 .8 3 1.2 5.5C4.6 16 5 21 7 21c1.6 0 1.5-4 2.5-5.5.6-.9 1.4-.9 2 0C13 17 12.9 21 14.5 21c2 0 2.4-5 2.8-7.5C17.7 11 18.5 10 18.5 8c0-3-1.5-5-4-5-1.6 0-2.4.8-3.5.8S8.6 3 7 3Z" {...p}/>,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" {...p}/><path d="M7.5 14h9" {...p}/></>,
    rupee: <path d="M7 5h10M7 9h10M7 5c5 0 6 8 0 8h-.5L13 19" {...p}/>,
    whatsapp: <><path d="M4 20l1.3-4A8 8 0 1 1 9 19.5L4 20Z" {...p}/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.6.7-1.1l-1-1.4-1.6.6c-1-.5-1.8-1.3-2.3-2.3l.6-1.6-1.4-1C9.1 7.5 9 8.4 9 9.5Z" fill={color} stroke="none"/></>,
    clock: <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v5l3.5 2" {...p}/></>,
    arrowUp: <path d="M12 19V5M6 11l6-6 6 6" {...p}/>,
    arrowDown: <path d="M12 5v14M6 13l6 6 6-6" {...p}/>,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" {...p}/>,
    pill: <><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)" {...p}/><path d="M8.5 8.5l7 7" {...p}/></>,
    doc: <><path d="M6 3h8l4 4v14H6V3Z" {...p}/><path d="M14 3v4h4M9 12h6M9 16h6" {...p}/></>,
    user2: <><circle cx="12" cy="7" r="3.5" {...p}/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" {...p}/></>,
    drag: <><circle cx="9" cy="6" r="1.3" fill={color} stroke="none"/><circle cx="15" cy="6" r="1.3" fill={color} stroke="none"/><circle cx="9" cy="12" r="1.3" fill={color} stroke="none"/><circle cx="15" cy="12" r="1.3" fill={color} stroke="none"/><circle cx="9" cy="18" r="1.3" fill={color} stroke="none"/><circle cx="15" cy="18" r="1.3" fill={color} stroke="none"/></>,
    stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3M6 3H4m2 0h1m7 0h-1m2 0h2M10 16v1a4 4 0 0 0 8 0v-2" {...p}/><circle cx="18" cy="12" r="2.5" {...p}/></>,
    sparkle: <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" {...p}/>,
    waveform: <path d="M3 12h2l2-6 3 14 3-10 2 5 2-3h4" {...p}/>,
    bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" {...p}/>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" {...p}/>,
    personPlus: <><circle cx="10" cy="8" r="3.6" {...p}/><path d="M4 20c0-3.6 2.8-5.6 6-5.6 1 0 2 .2 2.8.6" {...p}/><path d="M18 14v6M15 17h6" {...p}/></>,
    fileRupee: <><path d="M6 3h8l4 4v14H6V3Z" {...p}/><path d="M14 3v4h4" {...p}/><path d="M10 11h5M10 13.5h5M10 11c3 0 3.6 4.4 0 4.4h-.3l3 3.1" {...p} strokeWidth={1.6}/></>,
    queue: <><path d="M4 6h10M4 12h10M4 18h10" {...p}/><circle cx="19" cy="6" r="1.4" fill={color} stroke="none"/><circle cx="19" cy="12" r="1.4" fill={color} stroke="none"/><circle cx="19" cy="18" r="1.4" fill={color} stroke="none"/></>,
    logout: <><path d="M14 4h5v16h-5" {...p}/><path d="M3 12h11M10 8l-4 4 4 4" {...p}/></>,
    swap: <><path d="M7 4 3 8l4 4M3 8h13" {...p}/><path d="m17 20 4-4-4-4M21 16H8" {...p}/></>,
    printer: <><path d="M7 9V3h10v6" {...p}/><rect x="4" y="9" width="16" height="8" rx="2" {...p}/><path d="M7 14h10v6H7z" {...p}/></>,
    share: <><circle cx="6" cy="12" r="2.6" {...p}/><circle cx="18" cy="6" r="2.6" {...p}/><circle cx="18" cy="18" r="2.6" {...p}/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6" {...p}/></>,
    card: <><rect x="3" y="6" width="18" height="12" rx="2.5" {...p}/><path d="M3 10h18" {...p}/></>,
    image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" {...p}/><circle cx="9" cy="10" r="1.8" {...p}/><path d="m5 18 5-5 4 3 2-2 4 4" {...p}/></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" {...p}/><path d="M10 19a2 2 0 0 0 4 0" {...p}/></>,
    play: <path d="M7 5v14l11-7L7 5Z" {...p} fill={color}/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" {...p} fill={color}/>,
    userCheck: <><circle cx="9" cy="8" r="3.6" {...p}/><path d="M3 20c0-3.6 2.8-5.6 6-5.6 1.2 0 2.3.3 3.2.8" {...p}/><path d="m15 17 2 2 4-4" {...p}/></>,
    layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z" {...p}/><path d="m3 13 9 5 9-5M3 18l9 5 9-5" {...p}/></>,
    dots: <><circle cx="5" cy="12" r="1.6" fill={color} stroke="none"/><circle cx="12" cy="12" r="1.6" fill={color} stroke="none"/><circle cx="19" cy="12" r="1.6" fill={color} stroke="none"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}
Object.assign(window, { Icon });
