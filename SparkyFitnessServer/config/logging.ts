import util from 'util';

// Define logging levels
export const LOG_LEVELS: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

// Get desired log level from environment variable, default to INFO
const envLogLevel = process.env.SPARKY_FITNESS_LOG_LEVEL?.trim().toUpperCase() || 'INFO';
const currentLogLevel = LOG_LEVELS[envLogLevel] !== undefined ? LOG_LEVELS[envLogLevel] : LOG_LEVELS.INFO;

// Helper to truncate long strings in objects
const truncateStrings = (obj: any, maxLength: number = 1000): any => {
  if (typeof obj === 'string') {
    return obj.length > maxLength ? obj.substring(0, maxLength) + '... [truncated]' : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => truncateStrings(item, maxLength));
  }
  if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = truncateStrings(obj[key], maxLength);
      }
    }
    return newObj;
  }
  return obj;
};

// Custom logger function
export function log(level: string, message: string, ...args: any[]): void {
  const upperLevel = level.toUpperCase();
  if (LOG_LEVELS[upperLevel] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    
    // Process args to avoid logging massive circular objects or huge strings
    const processedArgs = args.map(arg => {
      try {
        if (arg instanceof Error) {
          // Log Error nicely: message + stack (if stack is available)
          return {
            message: arg.message,
            stack: arg.stack ? (arg.stack.split('\n').slice(0, 5).join('\n') + '\n    ...') : undefined,
            //@ts-ignore
            code: arg.code,
            //@ts-ignore
            status: arg.status || arg.response?.status,
            //@ts-ignore
            responseData: arg.response?.data ? truncateStrings(arg.response.data, 500) : undefined
          };
        }
        if (typeof arg === 'object' && arg !== null) {
          // Deep inspection with limited depth for other objects
          // Also truncate strings to avoid base64 floods
          const sanitized = truncateStrings(arg, 200);
          return util.inspect(sanitized, { depth: 1, colors: false, compact: true, breakLength: Infinity });
        }
        if (typeof arg === 'string') {
          return arg.length > 2000 ? arg.substring(0, 2000) + '... [truncated]' : arg;
        }
        return arg;
      } catch (err) {
        return '[Serialization Error]';
      }
    });

    switch (upperLevel) {
      case 'DEBUG':
        console.debug(`[${timestamp}] [DEBUG] ${message}`, ...processedArgs);
        break;
      case 'INFO':
        console.info(`[${timestamp}] [INFO] ${message}`, ...processedArgs);
        break;
      case 'WARN':
        console.warn(`[${timestamp}] [WARN] ${message}`, ...processedArgs);
        break;
      case 'ERROR':
        console.error(`[${timestamp}] [ERROR] ${message}`, ...processedArgs);
        break;
      default:
        console.log(`[${timestamp}] [${upperLevel}] ${message}`, ...processedArgs);
    }
  }
}
