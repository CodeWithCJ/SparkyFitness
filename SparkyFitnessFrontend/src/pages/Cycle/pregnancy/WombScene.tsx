// The "in mummy's tummy" illustration. Three hand-drawn womb scenes (embryo,
// curled fetus, head-down baby) map to the nearest committed style. The belly
// outline subtly grows with the week. Self-contained inline SVG, theme-neutral.

interface WombSceneProps {
  scene: 8 | 20 | 36;
  week: number;
  size?: number;
  className?: string;
}

function Embryo() {
  return (
    <>
      <path
        d="M120 62 C158 62 178 92 174 124 C170 158 150 182 120 186 C90 182 70 158 66 124 C62 92 82 62 120 62 Z"
        fill="#F9E0D8"
        stroke="#EFC0B0"
        strokeWidth="4"
      />
      <ellipse cx="120" cy="124" rx="40" ry="46" fill="#FBEAE4" />
      <path
        d="M112 118 c-6 -10 2 -22 14 -20 c10 2 14 12 10 20 c-3 7 -1 10 3 14 c-8 6 -20 4 -25 -4 c-3 -4 -2 -7 -2 -10 Z"
        fill="#E08A70"
      />
      <circle cx="124" cy="106" r="9" fill="#E08A70" />
      <circle cx="121" cy="104" r="1.6" fill="#FDF2EC" />
      <circle cx="103" cy="135" r="5" fill="#F3C8BC" />
      <path
        d="M108 132 q7 3 11 1"
        stroke="#D97F6C"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function Fetus() {
  return (
    <>
      <path
        d="M120 52 C164 52 188 88 184 126 C180 166 154 192 120 196 C86 192 60 166 56 126 C52 88 76 52 120 52 Z"
        fill="#F9E0D8"
        stroke="#EFC0B0"
        strokeWidth="4"
      />
      <ellipse cx="120" cy="126" rx="52" ry="58" fill="#FBEAE4" />
      <circle cx="103" cy="106" r="20" fill="#E08A70" />
      <path
        d="M100 124 C84 140 96 164 118 162 C138 160 146 142 138 128 C132 118 118 116 100 124 Z"
        fill="#E08A70"
      />
      <path
        d="M112 132 q10 2 12 10"
        stroke="#D97F6C"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M124 158 q14 -2 16 -14"
        stroke="#E08A70"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M94 106 q3 2.5 6 0"
        stroke="#FDF2EC"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M136 140 q10 6 14 0 q4 -7 -3 -9"
        stroke="#D97F6C"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function BabyLate() {
  return (
    <>
      <path
        d="M120 42 C172 42 198 84 194 130 C190 176 158 202 120 206 C82 202 50 176 46 130 C42 84 68 42 120 42 Z"
        fill="#F9E0D8"
        stroke="#EFC0B0"
        strokeWidth="4"
      />
      <ellipse cx="120" cy="126" rx="62" ry="70" fill="#FBEAE4" />
      <path
        d="M96 150 C88 118 104 84 136 82 C160 82 170 104 162 126 C156 142 146 152 134 158 C126 150 108 144 96 150 Z"
        fill="#E08A70"
      />
      <circle cx="112" cy="164" r="26" fill="#E08A70" />
      <path
        d="M150 120 q4 -18 -12 -24"
        stroke="#D97F6C"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M142 132 q8 -12 -2 -22"
        stroke="#E08A70"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M104 150 q-7 6 -3 13"
        stroke="#D97F6C"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M101 164 q3.5 3 7 0"
        stroke="#FDF2EC"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

export default function WombScene({
  scene,
  week,
  size = 240,
  className,
}: WombSceneProps) {
  // Belly grows subtly with gestation (weeks 4..40 → curve height).
  const bellyDrop = 150 + Math.min(40, Math.max(0, (week - 8) * 1.4));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label={`Baby at week ${week} inside the womb`}
    >
      <circle cx="120" cy="120" r="112" fill="#FDF2EC" />
      <path
        d={`M22 ${bellyDrop} Q120 ${bellyDrop - 70} 218 ${bellyDrop}`}
        fill="none"
        stroke="#E8B4A0"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.45"
      />
      {scene === 8 ? <Embryo /> : scene === 20 ? <Fetus /> : <BabyLate />}
    </svg>
  );
}
