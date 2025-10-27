import React from 'react'

const TooltipWarning: React.FC<{warningMsg: string, color?: string}> = ({ warningMsg, color="yellow" }) => {
  return (
    <div className={`bg-${color}-100 border-l-4 border-${color}-500 text-${color}-800 p-3 rounded`}>
        <strong>Note:</strong> {warningMsg}
      </div>
  )
}

export default TooltipWarning