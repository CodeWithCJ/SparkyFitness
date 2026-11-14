# SPARKYFITNESS — UNIVERSAL IMAGE-TO-VIDEO EXERCISE ANIMATION

## OBJECTIVE

Animate the supplied exercise reference image(s) into a premium, photorealistic SparkyFitness exercise demonstration video.

This is an IMAGE-TO-VIDEO ANIMATION task, NOT a free-form exercise generation task.

The supplied exercise image(s) define the exercise, its setup, and its key positions. The exercise specification below defines how the body moves between those positions. Animate only the movement those two sources describe, using the supplied SparkyFitness character and gym environment (the gym background already contains the official logo).

Unlike a video-to-video transformation, there is no source motion to copy. The motion must be generated, so it must be biomechanically correct, physically plausible, and limited strictly to the specified exercise.

## 1. INPUT REFERENCES

You will receive:

1. EXERCISE REFERENCE IMAGE(S)
   - One or more still images of the exercise, ideally the START (setup / resting) position and the END (peak contraction / turnaround) position.
   - Authoritative source for exercise type, equipment, equipment placement, grip, stance, body orientation, and joint angles at each key position.
   - When only one image is supplied, treat it as the START position and derive the END position from the exercise specification.

2. EXERCISE SPECIFICATION (filled in per exercise)
   - Exercise name: `{{EXERCISE_NAME}}`
   - Equipment: `{{EQUIPMENT}}`
   - Movement instructions: `{{INSTRUCTIONS}}`
   - Primary muscles: `{{PRIMARY_MUSCLES}}`
   - Secondary muscles: `{{SECONDARY_MUSCLES}}`
   - Stabilizing muscles: `{{STABILIZER_MUSCLES}}`
   - Laterality: `{{BILATERAL | UNILATERAL_LEFT | UNILATERAL_RIGHT | ALTERNATING}}`
   - Tempo: `{{TEMPO}}` (for example 2-0-2-0: seconds lowering, pause, lifting, pause; default to a controlled 2-0-2-0 when unspecified)

3. SPARKYFITNESS CHARACTER REFERENCE IMAGES
   - Front, back, left, and right views of the approved character (male or female reference depending on the target pipeline).
   - Use these images to preserve the exact same character identity and anatomical consistency.

4. SPARKYFITNESS GYM BACKGROUND
   - Use the supplied wide gym environment as the visual environment reference.
   - This background already contains the official SparkyFitness logo.

5. OFFICIAL SPARKYFITNESS LOGO (REFERENCE ONLY)
   - Supplied only so you can recognize the logo that is already in the gym background and keep it accurate (design, colors, typography, proportions).
   - Do not place this logo anywhere in the scene. The logo in the gym background is the only logo that appears.

## 2. KEYFRAME FIDELITY & MOVEMENT GENERATION

The reference image(s) are fixed keyframes. The video must pass through them exactly.

Match from the reference image(s):

- Exact exercise type.
- Starting position and setup.
- End (peak) position.
- Body positioning and joint angles at each key position.
- Equipment type, size, and placement.
- Hand grip (overhand, underhand, neutral, hook, false) and grip width.
- Foot positioning and stance width.
- Body orientation (standing, seated, lying, kneeling, incline, decline).
- Bench, seat, or machine settings visible in the image.

Generate the motion between keyframes so that it is:

- The single, standard, textbook form of the named exercise, following the movement instructions.
- A smooth, continuous path between START and END with no extra intermediate poses.
- Moving only the joints the exercise moves; all other joints stay stable and braced.
- Full range of motion as shown by the keyframes, without stopping short or overshooting.
- At the specified tempo, controlled in both the lifting and lowering phases, with no bouncing or momentum swings unless the exercise is explicitly ballistic (for example kettlebell swings, jumps, cleans).
- Correct for laterality: bilateral limbs move in sync, unilateral moves only the specified side, alternating switches sides once per repetition.

Movement & Physics Integrity:

- Equipment rigidity & physics: Barbells, dumbbells, kettlebells, cables, pulleys, handles, benches, and machines must remain completely rigid and interact with solid physical contact against hands and body without clipping, warping, melting, or dissolving.
- Weights follow a physically plausible path under gravity. Cables stay taut and attached to their pulleys and handles. Machine parts move only along their mechanical axis.
- Feet stay planted and hands stay locked to equipment unless the exercise requires them to move.
- Body mass and balance stay realistic: no floating, sliding, or weightless movement.
- Do not invent movements, variations, or extra steps that the reference image(s) and specification do not show.
- Do not add a setup walk-in, re-rack, introductory mistake, or correction sequence.
- Do not change standing exercises into seated exercises, or vice versa.

The reference image(s) and exercise specification must remain the movement reference throughout the entire animation.

## 3. CHARACTER

Render the demonstrator as the supplied SparkyFitness photorealistic anatomy character (male or female depending on the reference supplied), posed to match the reference image(s).

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
- No unnecessary accessories, wristbands, or jewelry unless shown as required lifting equipment (for example lifting straps) in the reference image(s).

If the reference image shows an illustration, a different person, or a stylized figure, use it only for pose, equipment, and position. Never copy its face, body, clothing, or art style.

## 4. MUSCLE ACTIVATION HIGHLIGHTING

Highlight the muscles listed in the exercise specification using universal visual color coding:

- RED / ORANGE: Primary target muscles (prime movers).
- YELLOW: Secondary muscles (synergists / assistance).
- BLUE: Supporting and stabilizing muscles (fixators / core).
- NATURAL SKIN TONE: All other non-targeted muscles.

When the specification omits a muscle group, infer it from standard exercise anatomy for the named exercise; never highlight a muscle that the exercise does not meaningfully work.

Overlay & Shader Requirements:

- Internal luminescence style: Highlights must appear as a subtle, translucent internal chromatic luminescence / glow beneath the skin surface, following actual anatomical muscle boundaries and muscle bellies.
- Zero color spill: Highlights must stay strictly confined to targeted muscle tissue, with no color bleeding, halos, or chromatic aberration onto neutral skin, joints, shorts, floor, equipment, or background.
- Follow actual anatomical muscle boundaries and insertion points.
- Keep highlights locked to the correct muscles throughout contraction, elongation, and movement.
- Make highlights clearly visible without obscuring underlying muscle definition or skin texture.
- Intensify primary highlights during the concentric (lifting) phase and at peak contraction; ease them slightly during the eccentric (lowering) phase.
- Show bilateral activation for bilateral exercises, and only the working side for unilateral exercises.
- Do not display muscle names, written anatomical labels, or language-specific text.

The video must communicate muscle activation visually and intuitively for users worldwide.

## 5. SPARKYFITNESS GYM ENVIRONMENT

Place the character in the supplied SparkyFitness gym environment, replacing any background in the reference image(s).

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
- Show exactly one SparkyFitness logo in the scene: the one in the background. Do not add a second logo, duplicate it on another wall, pillar, display, equipment, or clothing.
- Do not generate alternative logos, distort the logo, or introduce unrelated branding.
- Ensure the character and shadows interact naturally with the gym environment and flooring.

## 6. CAMERA, FRAMING & ASPECT RATIO

- Output Aspect Ratio: 1:1 square (1080 × 1080) for the embedded guided in-app workout player, or 9:16 vertical (1080 × 1920) for full-screen view.
- Camera Angle: Use the viewing angle of the reference image(s). If the image angle hides the working joints (for example a straight-on view of a lateral raise is fine, but a straight-on view of a squat hides hip and knee travel), use a three-quarter angle (about 45°) that shows them clearly.
- Static Camera: Lock the camera. No cuts, pans, orbits, zooms, or shake.
- Framing: Keep the character's entire body, full range of motion, and complete equipment path (for example lockout of an overhead press, bottom of a squat or deadlift) inside the frame at every point, with adequate headroom and floor margins.
- Do not crop out limbs, hands, feet, weights, or equipment at the edges of the frame.
- Source Image Integrity Fallback: If the reference image(s) crop out limbs, hands, feet, or equipment, or the exercise cannot be identified with confidence from the images and specification, do not guess or invent the missing anatomy, equipment, or movement; flag the exercise for manual review.
- Prioritize exercise clarity and biomechanical visibility over cinematic effects.

## 7. VIDEO OUTPUT & SEAMLESS LOOPING

- Repetition Cycle: 2 complete, clean repetitions (typically 6–10 seconds, up to 15 seconds maximum).
- Seamless In-App Looping: The first and last frames must both be the START keyframe, matching exactly, so playback loops infinitely without jumps or hitches.
- Aspect Ratio: 1:1 square (1080 × 1080) or 9:16 vertical (1080 × 1920) where supported.
- Style: Photorealistic 3D human anatomy.
- Motion Pacing: Use the specified tempo. Never unnaturally speed up, slow down, or freeze movement to force an arbitrary duration.
- Conflict Precedence Rule: Correct technique, keyframe fidelity, and the specified tempo (Section 2) always take precedence over duration limits. If they cannot fit, reduce to 1 complete repetition rather than speed-warping, and flag the clip for review.
- Character: Consistent SparkyFitness character.
- Environment: Consistent SparkyFitness gym.
- Muscle Highlighting: Anatomically accurate color-coded overlays.
- Text: No language-specific text, overlays, or watermarks.

## 8. AUDIO

- No voiceover.
- No narration.
- No background music.
- No artificial sound effects.
- Only subtle natural breathing, gym ambiance, and mechanical equipment sounds where appropriate.

## 9. STRICT NEGATIVE INSTRUCTIONS

DO NOT:

- Invent new exercise movements, variations, or extra steps.
- Deviate from the start or end position shown in the reference image(s).
- Use poor form: rounded back under load, knees caving, locked-out joints slamming, hips shooting up, or momentum swinging (unless the exercise is explicitly ballistic).
- Add incorrect-versus-correct demonstration sequences.
- Change equipment, grip width, or foot stance.
- Allow equipment to float, deform, bend, or clip through the body or limbs.
- Let hands slip off equipment or feet slide unless the exercise requires it.
- Produce color bleeding or chromatic halos from muscle overlays onto equipment or background.
- Crop out hands, feet, weights, or range-of-motion endpoints.
- Move the camera or cut between angles.
- Unnaturally speed up, slow down, or freeze motion phases.
- Copy the face, body, clothing, or art style of the person or figure in the reference image(s).
- Alter character facial identity or body proportions across frames.
- Generate distorted anatomy, extra limbs, or deformed fingers.
- Add text, subtitles, muscle names, or countdown timers.
- Add a second SparkyFitness logo or duplicate the logo already in the gym background.
- Distort, recolor, or modify the official SparkyFitness logo.
- Add music, narration, or synthetic voiceover.

## FINAL REQUIREMENT

The final video must look like the exercise shown in the reference image(s) was professionally filmed with correct, controlled technique, using the SparkyFitness human anatomy character inside a SparkyFitness-branded gym.

**Generate the movement from the reference images and exercise specification. Keep the character, environment, and muscle highlighting consistent. Never invent a different exercise.**

This is a faithful image-to-video animation, not an exercise redesign.
