import type React from 'react';

const colorClasses: Record<string, string> = {
  yellow: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded',
  red: 'bg-red-100 border-l-4 border-red-500 text-red-800 p-3 rounded',
  green: 'bg-green-100 border-l-4 border-green-500 text-green-800 p-3 rounded',
  blue: 'bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-3 rounded',
};

const TooltipWarning: React.FC<{ warningMsg: string; color?: string }> = ({
  warningMsg,
  color = 'yellow',
}) => {
  return (
    <div className={colorClasses[color] ?? colorClasses.yellow}>
      <strong>Note:</strong> {warningMsg}
    </div>
  );
};

export default TooltipWarning;
