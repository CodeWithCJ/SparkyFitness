import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Exercise } from "@/services/exerciseService";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";

interface ExercisePlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
}

const ExercisePlaybackModal: React.FC<ExercisePlaybackModalProps> = ({
  isOpen,
  onClose,
  exercise,
}) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [currentInstructionIndex, setCurrentInstructionIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const imageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevExerciseIdRef = useRef<string | null>(null);

  const instructions = exercise?.instructions || [];
  const images = exercise?.images || [];

  const speakInstruction = useCallback((text: string, index: number) => {
    debug(loggingLevel, `[speakInstruction] Speaking instruction ${index}: "${text}"`);
    if (!("speechSynthesis" in window)) {
      warn(loggingLevel, "Speech Synthesis not supported in this browser.");
      return;
    }
    const synth = window.speechSynthesis;

    // Cancel any ongoing speech before starting a new one
    if (synth && typeof synth.cancel === "function") {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US"; // Default language
    utterance.rate = 1; // Normal speed
    utterance.pitch = 1; // Normal pitch

    if (selectedVoiceURI) {
      const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    
    utterance.onend = () => {
      debug(loggingLevel, `[speakInstruction.onend] Instruction ${index} finished. isPlayingRef.current: ${isPlayingRef.current}`);
      if (isPlayingRef.current) {
        setCurrentInstructionIndex((prevInstructionIndex) => {
          const nextInstructionIndex = prevInstructionIndex + 1;
          if (nextInstructionIndex < instructions.length) {
            return nextInstructionIndex;
          } else {
            info(loggingLevel, "[speakInstruction.onend] All instructions read. Looping back to the first instruction.");
            return 0; // Loop back to the first instruction
          }
        });
      }
    };

    speechRef.current = utterance;
    if (!isMuted) {
      debug(loggingLevel, `[speakInstruction] Attempting to speak instruction ${index}. Muted: ${isMuted}`);
      if (synth && typeof synth.speak === "function") {
        synth.speak(utterance);
      }
    } else {
      info(loggingLevel, `[speakInstruction] Not speaking instruction ${index} because muted.`);
    }
  }, [isMuted, selectedVoiceURI, voices, instructions, loggingLevel]);

  // Ref to keep track of isPlaying state inside callbacks
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const startImageSlideshow = useCallback(() => {
   info(loggingLevel, "[startImageSlideshow] Starting image slideshow.");
    if (imageTimerRef.current) {
      clearInterval(imageTimerRef.current);
    }
    if (images.length > 1) {
      imageTimerRef.current = setInterval(() => {
        setCurrentImageIndex((prev) => (prev + 1) % images.length);
      }, 1000); // 1-second delay
    }
  }, [images.length, loggingLevel]);

  const stopImageSlideshow = useCallback(() => {
   info(loggingLevel, "[stopImageSlideshow] Stopping image slideshow.");
    if (imageTimerRef.current) {
      clearInterval(imageTimerRef.current);
      imageTimerRef.current = null;
    }
  }, [loggingLevel]);

  const startPlayback = useCallback(() => {
   info(loggingLevel, "[startPlayback] Setting isPlaying to true.");
    if (instructions.length > 0) {
      setIsPlaying(true);
      // speakInstruction will be called by the useEffect watching isPlaying and currentInstructionIndex
      startImageSlideshow();
    } else {
     info(loggingLevel, "[startPlayback] No instructions to play.");
    }
  }, [instructions, startImageSlideshow, loggingLevel]); 

  const pausePlayback = useCallback(() => {
   info(loggingLevel, "[pausePlayback] Pausing playback.");
    setIsPlaying(false);
    if ("speechSynthesis" in window && typeof window.speechSynthesis.pause === "function") {
      window.speechSynthesis.pause();
    }
    stopImageSlideshow();
  }, [stopImageSlideshow, loggingLevel]);

  const resumePlayback = useCallback(() => {
   info(loggingLevel, "[resumePlayback] Resuming playback.");
    if ("speechSynthesis" in window && window.speechSynthesis.paused && typeof window.speechSynthesis.resume === "function") {
      setIsPlaying(true);
      window.speechSynthesis.resume();
      startImageSlideshow();
    } else if (instructions.length > 0 && !isPlayingRef.current) {
      info(loggingLevel, "[resumePlayback] Not paused, not playing, setting isPlaying to true.");
      setIsPlaying(true);
      startImageSlideshow();
    } else {
     debug(loggingLevel, "[resumePlayback] No action taken. Speech synthesis not paused or already playing.");
    }
  }, [instructions, startImageSlideshow, loggingLevel]); 

  const togglePlayPause = useCallback(() => {
   debug(loggingLevel, `[togglePlayPause] Current isPlaying state: ${isPlaying}`);
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  }, [isPlaying, pausePlayback, resumePlayback, loggingLevel]);

  const toggleMute = useCallback(() => {
   debug(loggingLevel, `[toggleMute] Toggling mute. Current isMuted: ${isMuted}`);
     setIsMuted((prev) => {
       const newMutedState = !prev;
       if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
         window.speechSynthesis.cancel(); // Always cancel current speech
       }
       debug(loggingLevel, `[toggleMute] Speech cancelled. New muted state: ${newMutedState}. isPlayingRef.current: ${isPlayingRef.current}`);
       if (!newMutedState && isPlayingRef.current) { // If unmuting and currently playing, restart speech
         speakInstruction(instructions[currentInstructionIndex], currentInstructionIndex);
       }
       return newMutedState;
     });
   }, [instructions, currentInstructionIndex, speakInstruction, isMuted, loggingLevel]);

  useEffect(() => {
   debug(loggingLevel, `[useEffect - isOpen/exercise] isOpen: ${isOpen}, exercise: ${exercise?.name}, prevExerciseIdRef.current: ${prevExerciseIdRef.current}`);
     if (isOpen && exercise) {
       if (exercise.id !== prevExerciseIdRef.current) {
         info(loggingLevel, "[useEffect - isOpen/exercise] New exercise or modal re-opened. Resetting and starting playback.");
         setCurrentInstructionIndex(0);
         setCurrentImageIndex(0);
         setIsPlaying(true);
         startImageSlideshow(); // Start slideshow here
       } else if (!isPlaying) {
         info(loggingLevel, "[useEffect - isOpen/exercise] Same exercise, not playing. Resuming playback.");
         setIsPlaying(true);
         startImageSlideshow(); // Start slideshow here
       }
       prevExerciseIdRef.current = exercise.id;
     } else {
       info(loggingLevel, "[useEffect - isOpen/exercise] Modal closed or exercise changed. Stopping all playback.");
       if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
         window.speechSynthesis.cancel();
       }
       stopImageSlideshow();
       setIsPlaying(false);
       setCurrentInstructionIndex(0);
       setCurrentImageIndex(0);
       prevExerciseIdRef.current = null;
     }
     return () => {
       debug(loggingLevel, "[useEffect - isOpen/exercise cleanup] Cleaning up on unmount/dependency change.");
       if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
         window.speechSynthesis.cancel();
       }
       stopImageSlideshow();
       setIsPlaying(false);
     };
   }, [isOpen, exercise, stopImageSlideshow, startImageSlideshow, loggingLevel]); 

  useEffect(() => {
   debug(loggingLevel, `[useEffect - currentInstructionIndex/isPlaying] currentInstructionIndex: ${currentInstructionIndex}, isPlaying: ${isPlaying}, instructions.length: ${instructions.length}`);
     if (isPlaying && instructions.length > 0) {
       speakInstruction(instructions[currentInstructionIndex], currentInstructionIndex);
     } else if (!isPlaying) {
       info(loggingLevel, "[useEffect - currentInstructionIndex/isPlaying] Not playing, cancelling speech.");
       if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
         window.speechSynthesis.cancel();
       }
     }
   }, [currentInstructionIndex, isPlaying, instructions, speakInstruction, loggingLevel]);

  useEffect(() => {
   debug(loggingLevel, "[useEffect - voice loading] Initializing voice loading.");
     const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
     if (!synth) {
       warn(loggingLevel, "Speech Synthesis not supported in this browser.");
       return;
     }
     const loadVoices = () => {
       const availableVoices = synth.getVoices();
       setVoices(availableVoices);
       debug(loggingLevel, `[useEffect - voice loading] Voices loaded: ${availableVoices.length}`);
       // Set a default voice if none is selected, e.g., a female English voice
       if (!selectedVoiceURI && availableVoices.length > 0) {
         const defaultVoice = availableVoices.find(
           (voice) => voice.lang === "en-US" && voice.name.includes("Female")
         ) || availableVoices.find((voice) => voice.lang === "en-US") || availableVoices[0];
         setSelectedVoiceURI(defaultVoice?.voiceURI || null);
         info(loggingLevel, `[useEffect - voice loading] Default voice set: ${defaultVoice?.name}`);
       }
     };

    // Load voices when they are ready
    synth.onvoiceschanged = loadVoices;
    loadVoices(); // Call initially in case voices are already loaded

    return () => {
      synth.onvoiceschanged = null;
    };
  }, [selectedVoiceURI, loggingLevel]);

  const handleNext = useCallback(() => {
   debug(loggingLevel, `[handleNext] Current instruction index: ${currentInstructionIndex}`);
     if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
       window.speechSynthesis.cancel(); // Stop current speech
     }
     const nextIndex = currentInstructionIndex + 1;
     if (nextIndex < instructions.length) {
       setCurrentInstructionIndex(nextIndex);
       setCurrentImageIndex((prev) => (prev + 1) % images.length);
     } else {
       info(loggingLevel, "[handleNext] Reached end of instructions. Stopping playback.");
       setIsPlaying(false); // Stop playback if at the end
     }
   }, [currentInstructionIndex, instructions.length, images.length, loggingLevel]); 

  const handlePrevious = useCallback(() => {
   debug(loggingLevel, `[handlePrevious] Current instruction index: ${currentInstructionIndex}`);
     if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
       window.speechSynthesis.cancel(); // Stop current speech
     }
     const prevIndex = currentInstructionIndex - 1;
     if (prevIndex >= 0) {
       setCurrentInstructionIndex(prevIndex);
       setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
     } else {
      info(loggingLevel, "[handlePrevious] Already at the first instruction.");
     }
   }, [currentInstructionIndex, instructions.length, images.length, loggingLevel]); 

  if (!exercise) return null;

  const currentImageSrc = images.length > 0
    ? (exercise.source ? `/uploads/exercises/${images[currentImageIndex]}` : images[currentImageIndex])
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
     debug(loggingLevel, `[Dialog.onOpenChange] Dialog open state changed to: ${open}`);
     if (!open) { 
       onClose();
     }
    }}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
          <DialogDescription>
            {exercise.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow flex flex-col items-center justify-center p-4 space-y-4">
          {currentImageSrc && (
            <img
              src={currentImageSrc}
              alt={exercise.name}
              className="max-h-[50vh] object-contain rounded-md shadow-lg"
            />
          )}
          <div className="text-lg text-center font-medium">
            {instructions[currentInstructionIndex]}
          </div>
          <div className="flex items-center space-x-4 mt-4">
            <Button onClick={handlePrevious} disabled={currentInstructionIndex === 0}>
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button onClick={togglePlayPause}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <Button onClick={handleNext} disabled={currentInstructionIndex === instructions.length - 1}>
              <SkipForward className="w-5 h-5" />
            </Button>
            <Button onClick={toggleMute}>
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <Label htmlFor="voice-select" className="text-sm">{t("exercise.playbackModal.voiceLabel", "Voice:")}</Label>
            <Select
              value={selectedVoiceURI || ""}
              onValueChange={(value) => {
               info(loggingLevel, `[Select.onValueChange] Voice changed to: ${value}`);
                 setSelectedVoiceURI(value);
                 if ("speechSynthesis" in window && typeof window.speechSynthesis.cancel === "function") {
                   window.speechSynthesis.cancel(); // Cancel current speech to apply new voice
                 }
                 // If playing, restart speech with new voice
                 if (isPlayingRef.current) {
                   speakInstruction(instructions[currentInstructionIndex], currentInstructionIndex);
                 }
               }}
            >
              <SelectTrigger id="voice-select" className="w-[180px]">
                <SelectValue placeholder={t("exercise.playbackModal.selectVoicePlaceholder", "Select a voice")} />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {t("exercise.playbackModal.stepCount", "Step {{currentInstructionIndex}} of {{totalInstructions}}", { currentInstructionIndex: currentInstructionIndex + 1, totalInstructions: instructions.length })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExercisePlaybackModal;