import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder in jsdom
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// needed for useisMobile hook
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Polyfill ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// Polyfill PointerEvent
if (!global.PointerEvent) {
  class PointerEvent extends MouseEvent {
    public height: number;
    public isPrimary: boolean;
    public pointerId: number;
    public pointerType: string;
    public pressure: number;
    public tangentialPressure: number;
    public tiltX: number;
    public tiltY: number;
    public twist: number;
    public width: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId || 0;
      this.width = params.width || 0;
      this.height = params.height || 0;
      this.pressure = params.pressure || 0;
      this.tangentialPressure = params.tangentialPressure || 0;
      this.tiltX = params.tiltX || 0;
      this.tiltY = params.tiltY || 0;
      this.pointerType = params.pointerType || 'mouse';
      this.isPrimary = params.isPrimary || false;
      this.twist = params.twist || 0;
    }
  }

  global.PointerEvent = PointerEvent as any;
}

// Mock pointer capture methods

(HTMLElement.prototype as any).setPointerCapture = jest.fn();

(HTMLElement.prototype as any).releasePointerCapture = jest.fn();

(HTMLElement.prototype as any).hasPointerCapture = jest
  .fn()
  .mockReturnValue(false);

// Mock scrollIntoView
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = jest.fn();
}
