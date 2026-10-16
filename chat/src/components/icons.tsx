export function Icon({ name, size = 20 }: { name: "plus" | "arrow" | "stop" | "retry" | "chevron" | "spark" | "code" | "pen" | "compass"; size?: number }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m6 11 6-6 6 6M12 5v14" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
    retry: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />,
    pen: <><path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6 6-2Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Mark({ large = false }: { large?: boolean }) {
  return <span className={`mark${large ? " mark-large" : ""}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M7 8h18v5h-7v13h-5V13H7V8Z" fill="currentColor" /></svg></span>;
}
