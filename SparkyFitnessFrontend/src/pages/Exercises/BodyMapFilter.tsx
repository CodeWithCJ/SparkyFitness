import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';
import './BodyMapFilter.css';

interface BodyMapFilterProps {
  selectedMuscles: string[];
  onMuscleToggle: (muscle: string) => void;
  availableMuscleGroups: string[];
}

const BodyMapFilter: React.FC<BodyMapFilterProps> = ({ selectedMuscles, onMuscleToggle, availableMuscleGroups }) => {
  const { loggingLevel } = usePreferences();
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/images/muscle-male.svg')
      .then(response => response.text())
      .then(setSvgContent)
      .catch(err => {
        error(loggingLevel, "BodyMapFilter: Error fetching SVG:", err);
      });
  }, [loggingLevel]);

  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;

    const container = svgContainerRef.current;
    container.innerHTML = svgContent; // Always re-render SVG content to ensure fresh event listeners

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const paths = svgElement.querySelectorAll('path[class]');
    const cleanupFunctions: (() => void)[] = [];

    const svgClassToSchemaName: { [key: string]: string } = {
      'abdominal': 'abdominals',
      'lowerback': 'lower back',
      'quads': 'quadriceps',
      'obliques': 'abdominals', // Map obliques to abdominals
      // Add other mappings if necessary, e.g., 'lats' if it appears in SVG
    };

    paths.forEach(path => {
      const svgClassName = path.getAttribute('class');
      if (svgClassName) {
        const muscleName = svgClassToSchemaName[svgClassName] || svgClassName; // Map to schema name or use as is

        // Apply initial classes
        if (availableMuscleGroups.includes(muscleName)) {
          path.classList.add('enabled');
          path.classList.remove('disabled');
        } else {
          path.classList.add('disabled');
          path.classList.remove('enabled');
        }

        if (selectedMuscles.includes(muscleName)) {
          path.classList.add('active');
        } else {
          path.classList.remove('active');
        }

        const handleMouseOver = () => {
          if (availableMuscleGroups.includes(muscleName)) {
            svgElement.querySelectorAll(`path[class="${svgClassName}"]`).forEach(el => el.classList.add('hover'));
          }
        };
        const handleMouseOut = () => {
          if (availableMuscleGroups.includes(muscleName)) {
            svgElement.querySelectorAll(`path[class="${svgClassName}"]`).forEach(el => el.classList.remove('hover'));
          }
        };
        const handleClick = () => {
          if (availableMuscleGroups.includes(muscleName)) {
            onMuscleToggle(muscleName);
          }
        };

        path.addEventListener('mouseover', handleMouseOver);
        path.addEventListener('mouseout', handleMouseOut);
        path.addEventListener('click', handleClick);

        cleanupFunctions.push(() => {
          path.removeEventListener('mouseover', handleMouseOver);
          path.removeEventListener('mouseout', handleMouseOut);
          path.removeEventListener('click', handleClick);
        });
      }
    });

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [svgContent, selectedMuscles, onMuscleToggle, availableMuscleGroups, loggingLevel]);

  return (
    <div id="body-map-container" ref={svgContainerRef} className="w-full h-auto">
      {!svgContent && <div>Loading body map...</div>}
    </div>
  );
};

export default BodyMapFilter;
