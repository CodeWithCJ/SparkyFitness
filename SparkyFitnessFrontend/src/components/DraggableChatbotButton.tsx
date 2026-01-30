import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getActiveAiServiceSetting } from '@/services/aiServiceSettingsService';
import { useAuth } from '@/hooks/useAuth';

const BUTTON_SIZE = 56; // 14 * 4 = 56px (w-14)
const MINIMIZED_SIZE = 24;
const EDGE_MARGIN = 16;
const BOTTOM_NAV_HEIGHT = 80; // Height of bottom navigation bar on mobile
const STORAGE_KEY = 'chatbot_button_state';
const MINIMIZE_THRESHOLD = 20; // How close to edge before auto-minimizing on drag

type SnappedEdge = 'left' | 'right';

interface ButtonState {
  y: number;
  edge: SnappedEdge;
  minimized: boolean;
}

const DraggableChatbotButton: React.FC = () => {
  const { toggleChat, isChatOpen } = useChatbotVisibility();
  const { user, loading } = useAuth();
  const [hasAiProvider, setHasAiProvider] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>({
    y: 0,
    edge: 'right',
    minimized: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [hasAppeared, setHasAppeared] = useState(false); // For entrance animation
  const [isRestoring, setIsRestoring] = useState(false); // For restore from minimized animation

  const hasDragged = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Calculate actual position based on state
  const getPosition = useCallback(() => {
    const size = buttonState.minimized ? MINIMIZED_SIZE : BUTTON_SIZE;
    if (isDragging) {
      return dragPosition;
    }
    return {
      x: buttonState.edge === 'right'
        ? window.innerWidth - size - EDGE_MARGIN
        : EDGE_MARGIN,
      y: buttonState.y,
    };
  }, [buttonState, isDragging, dragPosition]);

  // Initialize position from localStorage or default to bottom-right
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ButtonState;
        // Ensure y is within bounds
        const maxY = window.innerHeight - BUTTON_SIZE - EDGE_MARGIN;
        setButtonState({
          ...parsed,
          y: Math.min(Math.max(EDGE_MARGIN, parsed.y), maxY),
        });
      } catch {
        setDefaultPosition();
      }
    } else {
      setDefaultPosition();
    }
  }, []);

  const setDefaultPosition = () => {
    const bottomOffset = isMobile ? BOTTOM_NAV_HEIGHT : 0;
    setButtonState({
      y: window.innerHeight - BUTTON_SIZE - EDGE_MARGIN - bottomOffset,
      edge: 'right',
      minimized: false,
    });
  };

  // Calculate max Y position (respects bottom nav on mobile)
  const getMaxY = useCallback((minimized: boolean) => {
    const size = minimized ? MINIMIZED_SIZE : BUTTON_SIZE;
    const bottomOffset = isMobile ? BOTTOM_NAV_HEIGHT : 0;
    return window.innerHeight - size - EDGE_MARGIN - bottomOffset;
  }, [isMobile]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setButtonState((prev: ButtonState) => {
        const maxY = getMaxY(prev.minimized);
        return {
          ...prev,
          y: Math.min(Math.max(EDGE_MARGIN, prev.y), maxY),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getMaxY]);

  // AI Provider check
  const checkAiProviders = useCallback(async () => {
    if (!loading && user?.id) {
      try {
        const activeService = await getActiveAiServiceSetting();
        const hasActive = activeService !== null &&
          activeService !== undefined &&
          Object.keys(activeService).length > 0;
        setHasAiProvider(hasActive);
      } catch (error) {
        console.error("[DraggableChatbotButton] Failed to fetch AI services:", error);
        setHasAiProvider(false);
      }
    } else if (!loading && !user) {
      setHasAiProvider(false);
    }
  }, [loading, user?.id]);

  useEffect(() => {
    checkAiProviders();
  }, [checkAiProviders]);


  useEffect(() => {
    const interval = setInterval(checkAiProviders, 60000);
    return () => clearInterval(interval);
  }, [checkAiProviders]);

  // Trigger entrance animation after provider check
  useEffect(() => {
    if (hasAiProvider && !hasAppeared) {
      // Small delay to ensure position is set before animating in
      const timer = setTimeout(() => setHasAppeared(true), 100);
      return () => clearTimeout(timer);
    }
  }, [hasAiProvider, hasAppeared]);

  // Snap to nearest edge (auto-minimize if dragged very close to edge on mobile)
  const snapToEdge = useCallback((x: number, y: number) => {
    const centerX = x + BUTTON_SIZE / 2;
    const screenCenterX = window.innerWidth / 2;
    const edge: SnappedEdge = centerX > screenCenterX ? 'right' : 'left';

    // Check if dragged very close to edge - auto-minimize on mobile
    const isNearLeftEdge = x < MINIMIZE_THRESHOLD;
    const isNearRightEdge = x > window.innerWidth - BUTTON_SIZE - MINIMIZE_THRESHOLD;
    const shouldMinimize = isMobile && !buttonState.minimized && (isNearLeftEdge || isNearRightEdge);

    const maxY = getMaxY(shouldMinimize || buttonState.minimized);
    const clampedY = Math.min(Math.max(EDGE_MARGIN, y), maxY);

    const newState: ButtonState = {
      y: clampedY,
      edge,
      minimized: shouldMinimize || buttonState.minimized,
    };

    setButtonState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  }, [buttonState.minimized, getMaxY, isMobile]);

  // Drag handlers
  const updatePosition = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    if (Math.abs(clientX - (dragPosition.x + dragOffset.current.x)) > 5 ||
      Math.abs(clientY - (dragPosition.y + dragOffset.current.y)) > 5) {
      hasDragged.current = true;
    }

    let newX = clientX - dragOffset.current.x;
    let newY = clientY - dragOffset.current.y;

    const size = buttonState.minimized ? MINIMIZED_SIZE : BUTTON_SIZE;
    const maxX = window.innerWidth - size;
    const maxY = getMaxY(buttonState.minimized);

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    setDragPosition({ x: newX, y: newY });
  }, [isDragging, dragPosition, buttonState.minimized, getMaxY]);

  const handleInteractionStart = (clientX: number, clientY: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setIsDragging(true);
      hasDragged.current = false;
      dragOffset.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
      setDragPosition({ x: rect.left, y: rect.top });
    }
  };

  const handleInteractionEnd = () => {
    if (isDragging && hasDragged.current) {
      snapToEdge(dragPosition.x, dragPosition.y);
    }
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handleInteractionStart(e.clientX, e.clientY);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    updatePosition(e.clientX, e.clientY);
  }, [updatePosition]);

  const handleMouseUp = useCallback(() => {
    handleInteractionEnd();
  }, [isDragging, hasDragged, dragPosition, snapToEdge]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      updatePosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [updatePosition]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      handleInteractionEnd();
      if (!hasDragged.current) {
        handleClick();
      }
    }
  }, [isDragging, hasDragged, dragPosition, snapToEdge]);

  const handleClick = () => {
    if (!hasDragged.current) {
      if (buttonState.minimized) {
        // Restore from minimized with animation
        setIsRestoring(true);
        const newState = { ...buttonState, minimized: false };
        setButtonState(newState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
        // Reset restoring state after animation
        setTimeout(() => setIsRestoring(false), 300);
      } else {
        toggleChat();
      }
    }
    hasDragged.current = false;
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = { ...buttonState, minimized: true };
    setButtonState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  };

  // Event listeners - attach both mouse and touch events for cross-device support
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Touch events on the element
    element.addEventListener('touchstart', handleTouchStart, { passive: false });

    // Global touch events for drag tracking
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    // Global mouse events for drag tracking (mouse down is handled via React props)
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!hasAiProvider) {
    return null;
  }

  const position = getPosition();
  const size = buttonState.minimized ? MINIMIZED_SIZE : BUTTON_SIZE;

  // Minimized state - small pill on edge
  if (buttonState.minimized) {
    return (
      <div
        ref={containerRef}
        className={`fixed z-50 bg-gradient-to-r from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600
          transition-all duration-300 cursor-pointer shadow-lg touch-none
          ${buttonState.edge === 'right' ? 'rounded-l-full' : 'rounded-r-full'}
          ${hasAppeared ? 'opacity-100' : 'opacity-0'}`}
        style={{
          left: buttonState.edge === 'right' ? 'auto' : 0,
          right: buttonState.edge === 'right' ? 0 : 'auto',
          top: position.y,
          width: MINIMIZED_SIZE + 8,
          height: MINIMIZED_SIZE,
          padding: '4px',
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        role="button"
        aria-label="Restore AI Chat"
      >
        <div className="w-full h-full flex items-center justify-center pointer-events-none">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  // Full button
  return (
    <div
      ref={containerRef}
      className={`fixed z-50 touch-none transition-all duration-300 ease-out
        ${hasAppeared ? 'opacity-100' : 'opacity-0'}`}
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        transform: isRestoring ? 'scale(1.15)' : (hasAppeared ? 'scale(1)' : 'scale(0.75)'),
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      role="button"
      aria-label="Open AI Chat"
    >
      {/* Minimize button - only on desktop (mobile uses drag-to-edge) */}
      {!isChatOpen && !isMobile && (
        <button
          className={`absolute -top-2 ${buttonState.edge === 'right' ? '-left-2' : '-right-2'}
            w-6 h-6 bg-gray-600 hover:bg-gray-700 rounded-full
            flex items-center justify-center
            opacity-0 hover:opacity-100
            transition-opacity duration-200
            shadow-md z-10`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleMinimize(e);
          }}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="Minimize chat button"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      )}

      <img
        src="/images/chatbot.gif"
        alt="AI Chatbot"
        className={`w-full h-full object-contain drop-shadow-lg pointer-events-none
          ${isDragging ? 'scale-110' : 'hover:scale-110'} transition-transform duration-200`}
        draggable={false}
      />
    </div>
  );
};

export default DraggableChatbotButton;
