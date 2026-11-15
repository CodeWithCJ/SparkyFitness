# SPARKYFITNESS — UNIVERSAL VIDEO-TO-VIDEO EXERCISE TRANSFORMATION

## OBJECTIVE

Transform the supplied original exercise demonstration video into a premium, photorealistic SparkyFitness exercise demonstration video.

This is a VIDEO-TO-VIDEO TRANSFORMATION task, NOT a new exercise generation task.

Preserve the original exercise demonstration exactly while transforming its visual appearance using the supplied SparkyFitness character and gym environment (the gym background already contains the official logo).

The original video is the single source of truth for all exercise biomechanics, posture, and movements.

## 1. INPUT REFERENCES

You will receive:

1. ORIGINAL EXERCISE VIDEO
   - Authoritative source for exercise movements, technique, timing, repetitions, and body positioning.

2. SPARKYFITNESS CHARACTER REFERENCE IMAGES
   - Front, back, left, and right views of the approved character (male or female reference depending on the target pipeline).
   - Use these images to preserve the exact same character identity and anatomical consistency.

3. SPARKYFITNESS GYM BACKGROUND
   - Use the supplied wide gym environment as the visual environment reference.
   - This background already contains the official SparkyFitness logo.

4. OFFICIAL SPARKYFITNESS LOGO (REFERENCE ONLY)
   - Supplied only so you can recognize the logo that is already in the gym background and keep it accurate (design, colors, typography, proportions).
   - Do not place this logo anywhere in the scene. The logo in the gym background is the only logo that appears.

## 2. STRICT VIDEO-TO-VIDEO MOVEMENT PRESERVATION

Preserve the original exercise video as closely as possible.

Do not redesign, reinterpret, improve, or modify the exercise.

Maintain:

- Exact exercise type.
- Original starting position and setup.
- Original body positioning and joint angles.
- Original equipment and equipment placement.
- Original hand grip (overhand, underhand, neutral, hook, false).
- Original foot positioning and stance width.
- Original movement trajectory and path.
- Original full range of motion.
- Original repetitions.
- Original movement speed, cadence, and timing.
- Original pauses, holds, and transitions.
- Original exercise sequence.
- Original posture and technique.

Movement & Physics Integrity:

- The generated character must perform the same movements as the original person, frame by frame.
- Equipment rigidity & physics: Barbells, dumbbells, cables, pulleys, handles, benches, and machines must remain completely rigid and interact with solid physical contact against hands and body without clipping, warping, melting, or dissolving.
- Inpainting behind clothing: Reconstruct the bare anatomy and solid equipment surfaces cleanly where original clothing occluded body contact with equipment, cables, or benches.
- Do not introduce new movements, repetitions, incorrect positions, posture corrections, or additional demonstrations.
- Do not add an introductory mistake or correction sequence.
- Do not change standing exercises into seated exercises, or vice versa.

The original video must remain the movement reference throughout the entire transformation.

## 3. CHARACTER REPLACEMENT

Replace the original demonstrator with the supplied SparkyFitness photorealistic anatomy character (male or female depending on the reference supplied).

Preserve:

- Exact face and facial identity.
- Hairstyle.
- Skin tone.
- Body proportions.
- Athletic, muscular physique.
- Anatomical fidelity and definition.
- Consistent identity across all frames.

Character appearance:

- Shirtless (or athletic sports bra for female reference).
- Plain dark athletic training shorts.
- Realistic human anatomy and natural skin texture.
- Clearly defined muscle separation and topology.
- No unnecessary accessories, wristbands, or jewelry unless present as required lifting equipment (e.g. lifting straps) in the source video.

Match the original demonstrator's body position, movement, and orientation as closely as possible. Do not change the character's facial features or physique between frames.

## 4. MUSCLE ACTIVATION HIGHLIGHTING

Identify the muscles genuinely involved in the exercise and highlight them using universal visual color coding:

- RED / ORANGE: Primary target muscles (prime movers).
- YELLOW: Secondary muscles (synergists / assistance).
- BLUE: Supporting and stabilizing muscles (fixators / core).
- NATURAL SKIN TONE: All other non-targeted muscles.

Overlay & Shader Requirements:

- Internal luminescence style: Highlights must appear as a subtle, translucent internal chromatic luminescence / glow beneath the skin surface, following actual anatomical muscle boundaries and muscle bellies.
- Zero color spill: Highlights must stay strictly confined to targeted muscle tissue — no color bleeding, halos, or chromatic aberration onto neutral skin, joints, shorts, floor, equipment, or background.
- Follow actual anatomical muscle boundaries and insertion points.
- Keep highlights locked to the correct muscles throughout contraction, elongation, and movement.
- Make highlights clearly visible without obscuring underlying muscle definition or skin texture.
- Reflect muscle engagement dynamically throughout the exercise repetition.
- Show bilateral (both sides) activation when appropriate.
- Do not highlight unrelated muscles.
- Do not display muscle names, written anatomical labels, or language-specific text.

The video must communicate muscle activation visually and intuitively for users worldwide.

## 5. SPARKYFITNESS GYM ENVIRONMENT

Replace the original background with the supplied SparkyFitness gym environment.

Maintain:

- Same gym identity throughout the video.
- Dark industrial gym interior.
- Spacious workout environment.
- Professional, modern gym equipment.
- Realistic studio lighting, highlights, and contact shadows.
- Red, blue, and neutral brand accents.
- Natural depth of field and perspective.

Official Logo:

- The official SparkyFitness logo is already part of the supplied gym background. Keep it exactly where it is in the background, unchanged; use the separate logo reference only to keep it accurate.
- Show exactly one SparkyFitness logo in the scene: the one in the background. Do not add a second logo or duplicate it on another wall, pillar, display, equipment, or clothing.
- Do not generate alternative logos, distort the logo, or introduce unrelated branding.
- Ensure the character and shadows interact naturally with the gym environment and flooring.

## 6. CAMERA, FRAMING & ASPECT RATIO ADAPTATION

- Supported Aspect Ratios: Both **9:16 Vertical (`720 × 1280` or `1080 × 1920`)** and **16:9 Horizontal (`1280 × 720` or `720 × 404`)**, as well as **1:1 Square (`1080 × 1080`)**.
- Intelligent Aspect Ratio Selection (Unless a specific ratio is explicitly requested):
  - **Choose 9:16 Vertical (`720 × 1280`) by default for tall, vertical movements:**
    - Exercises with primary vertical travel: Squats, Deadlifts, Overhead / Military Press, Pull-ups, Chin-ups, Standing Bicep Curls, Lunges, Calf Raises, Lat Pulldowns.
    - Captures the complete head-to-toe movement naturally without wasting empty horizontal side space.
  - **Choose 16:9 Horizontal (`1280 × 720`) by default for wide, horizontal, or bench movements:**
    - Exercises with wide equipment or horizontal body orientation: Barbell Bench Press (fits the full 7.2-foot Olympic barbell and weight plates), Incline / Decline Bench, Push-ups, Floor Planks, Ab Wheel Rollouts, Cable Chest Flyes, Rowing Machines.
    - Avoids clipping barbell collars or pulling the camera back so far that the demonstrator's body appears tiny.
  - **Explicit User Request Precedence:** If the user or specification explicitly requests a specific aspect ratio (or requests both vertical and horizontal versions), generate the requested ratio(s).
- Dynamic Reframing & Centering: When adapting from horizontal (16:9) or wide source footage, dynamically reframe and center the subject so the demonstrator's entire body, full range of motion, and complete equipment trajectory (e.g. lockout of an overhead press, bottom of a squat or deadlift) remain fully visible inside the frame with adequate headroom and floor margins.
- Do not crop out limbs, hands, feet, weights, or equipment at the edges of the frame.
- Source Footage Integrity Fallback: Source footage must include the full demonstrator body, equipment, and range-of-motion endpoints. If the source video itself has cropped-out limbs, hands, feet, or weights, do not hallucinate or invent the missing anatomy or equipment; flag the video for re-capture or manual replacement.
- Keep the entire relevant exercise movement centered and visible.
- Avoid unnecessary camera cuts or perspective switching.
- Avoid excessive zooming, shaking, or fast camera panning.
- Use subtle camera adjustments only if necessary to maintain full subject visibility.
- Prioritize exercise clarity and biomechanical visibility over cinematic effects.

## 7. VIDEO OUTPUT & SEAMLESS LOOPING

- Duration: 5 to 15 seconds total.
- Repetition Cycle: 1–2 complete, clean repetitions (shows full controlled movement or alternating sides).
- File Naming:
  - Vertical (9:16): Save as `{{NUMERIC_ID}}_{{SLUG}}_9_16.mp4` (or `{{NUMERIC_ID}}_{{SLUG}}.mp4` if only one orientation is generated).
  - Horizontal (16:9): Save as `{{NUMERIC_ID}}_{{SLUG}}_16_9.mp4`.
  - Square (1:1): Save as `{{NUMERIC_ID}}_{{SLUG}}_1_1.mp4` (or configure explicit `video_path` in `exercise.json` when published alongside other orientations).
- Target File Size: ~0.5 MB to 1.5 MB (max 2.5 MB), encoded with H.264 (libx264).
- Seamless In-App Looping & Continuous Movement Flow:
  - The video must start and end at the exact same neutral setup / resting point of the movement cycle so infinite playback creates the seamless illusion of one ongoing workout set.
  - When the repetition completes, it must flow smoothly and naturally back into the start of the next repetition rather than abruptly cutting off, stopping, or looking like the exercise was aborted and restarted from scratch.
  - Body posture, joint angles, limb positioning, and return momentum at the final frame must align continuously with the initial frame without hitches, jumps, or jarring resets.
- Aspect Ratio: Match the chosen format (9:16 vertical, 16:9 horizontal, or 1:1 square).
- Style: Photorealistic 3D human anatomy.
- Movement: Faithfully reproduced from the original video.
- Motion Pacing: Preserve the natural cadence and tempo of the repetition. Never unnaturally speed up, slow down, or freeze movement to force an arbitrary duration.
- Conflict Precedence Rule: Preserving the original movement technique, repetitions, and natural cadence (Section 2 & Motion Pacing) always takes precedence over arbitrary duration limits. If source footage cannot satisfy both (e.g. slower tempo or longer set), keep the complete original movement intact without speed-warping, and flag the clip for human trimming.
- Character: Consistent SparkyFitness character.
- Environment: Consistent SparkyFitness gym.
- Muscle Highlighting: Anatomically accurate color-coded overlays.
- Text: No language-specific text, overlays, or watermarks.

## 8. AUDIO

- Silent video output (no audio track, or muted via `-an`) to optimize for smooth mobile in-app looping and keep file sizes within the target threshold (~0.5 MB to 1.5 MB, max 2.5 MB).
- No voiceover, music, narration, or sound effects.

## 9. STRICT NEGATIVE INSTRUCTIONS

DO NOT:

- Invent new exercise movements or variations.
- Correct, alter, or modify the original demonstrator's posture or technique.
- Add incorrect-versus-correct demonstration sequences.
- Change equipment, grip width, or foot stance.
- Allow equipment to float, deform, or clip through the body or limbs.
- Produce color bleeding or chromatic halos from muscle overlays onto equipment or background.
- Crop out hands, feet, weights, or range-of-motion endpoints.
- Unnaturally speed up, slow down, or freeze motion phases.
- Abruptly cut, abort, drop weights, or break posture at the end of the clip so it jolts or looks restarted rather than continuing.
- Alter character facial identity or body proportions across frames.
- Generate distorted anatomy, extra limbs, or deformed fingers.
- Add text, subtitles, muscle names, or countdown timers.
- Add a second SparkyFitness logo or duplicate the logo already in the gym background.
- Distort, recolor, or modify the official SparkyFitness logo.
- Add music, narration, or synthetic voiceover.

## FINAL REQUIREMENT

The final video must look like the original exercise demonstration was professionally filmed using the SparkyFitness human anatomy character inside a SparkyFitness-branded gym.

**Change the visual identity, character, environment, and muscle highlighting. Preserve the original exercise movement.**

This is a faithful video-to-video transformation, not an exercise redesign.
