import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { MessageSquare } from 'lucide-react';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getActiveAiServiceSetting } from '@/services/aiServiceSettingsService';
import { useAuth } from '@/hooks/useAuth';

const DraggableChatbotButton: React.FC = () => {
  const { toggleChat } = useChatbotVisibility();
  const { user, loading } = useAuth(); // Destructure user and loading from useAuth
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasAiProvider, setHasAiProvider] = useState(false); // New state for AI provider check
  const hasDragged = useRef(false); // New ref to track if a drag occurred
  const dragOffset = useRef({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const STORAGE_KEY = 'chatbot_button_position';

  useEffect(() => {
    // Force a known visible position for debugging
    setPosition({ x: 50, y: 50 });
    // Commenting out local storage load for debugging
    // const savedPosition = localStorage.getItem(STORAGE_KEY);
    // if (savedPosition) {
    //   setPosition(JSON.parse(savedPosition));
    // } else {
    //   setPosition({ x: window.innerWidth - 100, y: window.innerHeight - 100 });
    // }
  }, []);

  const checkAiProviders = useCallback(async () => {
    if (!loading && user?.id) { // Only fetch if not loading and user is available
      try {
        const activeService = await getActiveAiServiceSetting();
        // Check for null, undefined, or empty object
        const hasActive = activeService !== null &&
                          activeService !== undefined &&
                          Object.keys(activeService).length > 0;
        setHasAiProvider(hasActive);
      } catch (error) {
        console.error("[DraggableChatbotButton] Failed to fetch AI services:", error);
        setHasAiProvider(false);
      }
    } else if (!loading && !user) { // If loading is false and no user, ensure AI provider is false
      setHasAiProvider(false);
    }
  }, [loading, user?.id]);

  useEffect(() => {
    checkAiProviders();
  }, [checkAiProviders]);

  // Re-check when user returns to the tab (after potentially changing settings)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAiProviders();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkAiProviders]);

  // Re-check periodically to catch changes made in other tabs or after navigation
  useEffect(() => {
    const interval = setInterval(checkAiProviders, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [checkAiProviders]);

  const isMobile = useIsMobile();

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    // If mouse moves significantly, it's a drag
    if (Math.abs(clientX - (position.x + dragOffset.current.x)) > 5 ||
        Math.abs(clientY - (position.y + dragOffset.current.y)) > 5) {
      hasDragged.current = true;
    }

    let newX = clientX - dragOffset.current.x;
    let newY = clientY - dragOffset.current.y;

    // Constrain to viewport
    if (buttonRef.current) {
      const maxX = window.innerWidth - buttonRef.current.offsetWidth;
      const maxY = window.innerHeight - buttonRef.current.offsetHeight;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
    }

    setPosition({ x: newX, y: newY });
  }, [isDragging, position]);

  const handleInteractionStart = (clientX: number, clientY: number) => {
    if (buttonRef.current) {
      setIsDragging(true);
      hasDragged.current = false; // Reset drag flag on interaction start
      dragOffset.current = {
        x: clientX - buttonRef.current.getBoundingClientRect().left,
        y: clientY - buttonRef.current.getBoundingClientRect().top,
      };
    }
  };

  const handleInteractionEnd = () => {
    setIsDragging(false);
    // Save position to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handleInteractionStart(e.clientX, e.clientY);
    e.preventDefault(); // Prevent default drag behavior
  };

  const handleMouseMove = (e: MouseEvent) => {
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleInteractionEnd();
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault(); // Prevent scrolling while dragging
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      updatePosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    // Check if a drag was initiated on the button
    if (isDragging) {
      handleInteractionEnd();
      // Manually trigger the click handler.
      // The `onClick` event won't fire on mobile because `e.preventDefault()` is called
      // in `handleTouchStart` to prevent scrolling during a drag.
      // We pass a null event because the event object is not used inside handleClick.
      handleClick(null as any);
    }
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    // Only open chat if no significant drag occurred
    if (!hasDragged.current) {
      toggleChat();
    }
    hasDragged.current = false; // Reset for next interaction
  };

  useEffect(() => {
    const buttonElement = buttonRef.current;
    if (buttonElement) {
      if (isMobile) {
        buttonElement.addEventListener('touchstart', handleTouchStart, { passive: false });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);
      } else {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      }
    }

    return () => {
      if (buttonElement) {
        if (isMobile) {
          buttonElement.removeEventListener('touchstart', handleTouchStart);
          window.removeEventListener('touchmove', handleTouchMove);
          window.removeEventListener('touchend', handleTouchEnd);
        } else {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        }
      }
    };
  }, [isDragging, position, isMobile, updatePosition, handleTouchStart, handleTouchMove, handleTouchEnd]); // Re-run effect if dragging state, position, or mobile state changes

  if (!hasAiProvider) {
    return null; // Do not render the button if no AI provider is set up
  }

  return (
    <>
      <Button
        ref={buttonRef}
        className="fixed z-50 rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-200 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 flex items-center justify-center overflow-hidden"
        style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : (isMobile ? 'grab' : 'grab') }}
        onMouseDown={isMobile ? undefined : handleMouseDown}
        onClick={handleClick}
        size="lg"
      >
        {/* Cute Robot Head SVG */}
        {/* Robot Head SVG - Matching provided image */}
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          {/* Head (Circular shape) */}
          <circle cx="20" cy="20" r="19.8" fill="#E0E0E0"/> {/* Light gray circle, 99% of viewBox */}
          {/* Eyes */}
          <g className="robot-eyes">
            {/* Eye bases (white) */}
            <circle cx="12" cy="18" r="5" fill="white"/>
            <circle cx="28" cy="18" r="5" fill="white"/>
            {/* Pupils (black) - these will blink */}
            <circle cx="12" cy="18" r="3" fill="black" className="robot-pupil-left"/>
            <circle cx="28" cy="18" r="3" fill="black" className="robot-pupil-right"/>
          </g>
        </svg>
      </Button>
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
          100% { transform: translateY(0px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { transform: scaleY(1); }
          49% { transform: scaleY(1); } /* Hold open */
          50% { transform: scaleY(0.1); } /* Close quickly */
          51% { transform: scaleY(1); } /* Open quickly */
        }
        .robot-pupil-left, .robot-pupil-right {
          animation: blink 4s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
    </>
  );
};

export default DraggableChatbotButton;