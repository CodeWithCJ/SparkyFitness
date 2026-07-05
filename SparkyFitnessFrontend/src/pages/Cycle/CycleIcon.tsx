// Colorful duotone domain icons for the Cycle hub. Inline SVG keeps them
// self-contained (no asset pipeline) and theme-independent — each icon carries
// its own tinted rounded background so it reads on light and dark surfaces.
// Icons are always paired with a text label in the UI (never icon-only).

interface CycleIconProps {
  id: string;
  size?: number;
  className?: string;
  title?: string;
}

const PATHS: Record<string, React.ReactNode> = {
  'flow-none': (
    <>
      <rect width="28" height="28" rx="8" fill="#F1EEEC" />
      <circle
        cx="14"
        cy="14"
        r="6"
        fill="none"
        stroke="#B8ABA3"
        strokeWidth="1.8"
      />
    </>
  ),
  'flow-spotting': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <circle cx="14" cy="15" r="3.4" fill="#E4796B" />
    </>
  ),
  'flow-light': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <path
        d="M14 7 C14 7 9.5 13 9.5 16.8 a4.5 4.5 0 0 0 9 0 C18.5 13 14 7 14 7 Z"
        fill="#F3A79A"
        stroke="#C9524E"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>
  ),
  'flow-medium': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <path
        d="M10.5 8 C10.5 8 7 12.6 7 15.6 a3.5 3.5 0 0 0 7 0 C14 12.6 10.5 8 10.5 8 Z"
        fill="#E4796B"
        stroke="#C9524E"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 10 C18.5 10 15.5 14 15.5 16.7 a3 3 0 0 0 6 0 C21.5 14 18.5 10 18.5 10 Z"
        fill="#F3A79A"
        stroke="#C9524E"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </>
  ),
  'flow-heavy': (
    <>
      <rect width="28" height="28" rx="8" fill="#FBDDD6" />
      <path
        d="M9 7.5 C9 7.5 6 11.6 6 14.2 a3 3 0 0 0 6 0 C12 11.6 9 7.5 9 7.5 Z"
        fill="#C9524E"
      />
      <path
        d="M19 7.5 C19 7.5 16 11.6 16 14.2 a3 3 0 0 0 6 0 C22 11.6 19 7.5 19 7.5 Z"
        fill="#C9524E"
      />
      <path
        d="M14 13 C14 13 10.5 17.6 10.5 20.4 a3.5 3.5 0 0 0 7 0 C17.5 17.6 14 13 14 13 Z"
        fill="#C9524E"
      />
    </>
  ),
  'symptom-cramps': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDE8E4" />
      <ellipse cx="14" cy="17" rx="8.5" ry="6.5" fill="#F3A79A" />
      <path
        d="M14.5 8 L10.5 14.5 h3 L11.5 20.5 L17.5 13 h-3 L16.5 8 Z"
        fill="#C9524E"
      />
    </>
  ),
  'symptom-headache': (
    <>
      <rect width="28" height="28" rx="8" fill="#EFEAF7" />
      <circle cx="14" cy="15" r="7.5" fill="#B49BD8" />
      <path
        d="M9 8 l1.6 2.6 M14 6.5 l0 3 M19 8 l-1.6 2.6"
        stroke="#6E4FA3"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
  'symptom-fatigue': (
    <>
      <rect width="28" height="28" rx="8" fill="#FFF4DC" />
      <path
        d="M16.5 6.5 a7.5 7.5 0 1 0 5 12.8 a8.6 8.6 0 0 1 -5 -12.8 Z"
        fill="#E8B54A"
      />
    </>
  ),
  'symptom-nausea': (
    <>
      <rect width="28" height="28" rx="8" fill="#E9F3E6" />
      <path
        d="M10 8 C10 6.5 12 6.5 12 8 v2.2 C16.8 10.8 20 14 20 17.2 c0 3.4 -2.8 5.3 -6 5.3 c-3.2 0 -6 -1.9 -6 -5.3 c0 -2.6 0.8 -4.6 2 -6 Z"
        fill="#A8C8A0"
      />
    </>
  ),
  'mood-happy': (
    <>
      <rect width="28" height="28" rx="8" fill="#FFF1D6" />
      <circle cx="14" cy="14" r="8" fill="#FFD37A" />
      <circle cx="11" cy="12.2" r="1.2" fill="#8A5A00" />
      <circle cx="17" cy="12.2" r="1.2" fill="#8A5A00" />
      <path
        d="M10.5 16 q3.5 3.4 7 0"
        stroke="#8A5A00"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  'mood-calm': (
    <>
      <rect width="28" height="28" rx="8" fill="#E6F2EA" />
      <circle cx="14" cy="14" r="8" fill="#A9D3B5" />
      <path
        d="M9.6 12.6 q1.4 1.4 2.8 0 M15.6 12.6 q1.4 1.4 2.8 0"
        stroke="#33684A"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M11.5 16.6 q2.5 1.8 5 0"
        stroke="#33684A"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  'mood-irritable': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDE9DC" />
      <circle cx="14" cy="14" r="8" fill="#F5A26B" />
      <path
        d="M9.5 11 l3 1.4 M18.5 11 l-3 1.4"
        stroke="#96491A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="11.4" cy="13.6" r="1.1" fill="#96491A" />
      <circle cx="16.6" cy="13.6" r="1.1" fill="#96491A" />
      <path
        d="M11 17.6 q3 -1.6 6 0"
        stroke="#96491A"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  'mucus-eggwhite': (
    <>
      <rect width="28" height="28" rx="8" fill="#EAF4F8" />
      <circle cx="9" cy="9.5" r="3.2" fill="#7FB6CE" />
      <circle cx="19" cy="18.5" r="3.2" fill="#7FB6CE" />
      <path
        d="M11.2 11.6 C14 14 14 14 16.8 16.4"
        stroke="#4E8AA8"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  'product-pad': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <rect
        x="8.5"
        y="7"
        width="11"
        height="14"
        rx="5.5"
        fill="#FFFFFF"
        stroke="#C9524E"
        strokeWidth="1.5"
      />
      <rect x="12" y="10" width="4" height="8" rx="2" fill="#F3A79A" />
    </>
  ),
  'product-tampon': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <rect
        x="10.5"
        y="5.5"
        width="7"
        height="12.5"
        rx="3.5"
        fill="#FFFFFF"
        stroke="#C9524E"
        strokeWidth="1.5"
      />
      <path
        d="M12.5 8.5 h3 M12.5 11 h3 M12.5 13.5 h3"
        stroke="#F3A79A"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M14 18 q-1.5 3 0.8 5"
        stroke="#C9524E"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  'product-cup': (
    <>
      <rect width="28" height="28" rx="8" fill="#FDEDE9" />
      <path
        d="M8.5 7.5 h11 C19.5 13 18 17.5 14 17.5 C10 17.5 8.5 13 8.5 7.5 Z"
        fill="#F3A79A"
        stroke="#C9524E"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 17.5 v3"
        stroke="#C9524E"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="14" cy="22" r="1.4" fill="#C9524E" />
    </>
  ),
};

export default function CycleIcon({
  id,
  size = 28,
  className,
  title,
}: CycleIconProps) {
  const content = PATHS[id] ?? PATHS['flow-spotting'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={className}
      role="img"
      aria-label={title ?? id}
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
}
