import { Check } from 'lucide-react';

interface OptionButtonProps {
  label: string;
  subLabel?: string;
  isSelected: boolean;
  onClick: () => void;
}

export const OptionButton = ({
  label,
  subLabel,
  isSelected,
  onClick,
}: OptionButtonProps) => (
  <button
    onClick={onClick}
    className={`
      w-full text-left p-5 my-3 rounded-xl border-2 transition-all duration-200
      flex flex-col justify-center
      ${
        isSelected
          ? 'bg-[#1c1c1e] border-green-500'
          : 'bg-[#1c1c1e] border-transparent hover:border-gray-600'
      }
    `}
  >
    <div className="flex justify-between items-center w-full">
      <span className="font-semibold text-lg text-white">{label}</span>
      {isSelected && (
        <div className="bg-green-500 rounded-full p-1">
          <Check className="h-4 w-4 text-black" />
        </div>
      )}
    </div>
    {subLabel && <span className="text-gray-400 text-sm mt-1">{subLabel}</span>}
  </button>
);
