const { execFileSync } = require("child_process");

const SHARED_SCHEMA_FILE =
  "/Users/andrew/Documents/js/SparkyFitness/shared/src/schemas/api/ExerciseEntries.api.zod.ts";

function runSchema(schemaName, payload) {
  const script = `
    import schemaModule from '${SHARED_SCHEMA_FILE}';
    const schema = schemaModule.${schemaName};
    const result = schema.safeParse(${JSON.stringify(payload)});
    const output = result.success
      ? { success: true, data: result.data }
      : { success: false, issues: result.error.issues.map((issue) => issue.message) };
    console.log(JSON.stringify(output));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      encoding: "utf8",
      cwd: __dirname,
    }).trim(),
  );
}

describe("Exercise entry API schemas", () => {
  const exerciseId = "11111111-1111-4111-8111-111111111111";

  it("accepts preset-based create payloads", () => {
    const result = runSchema("createPresetSessionRequestSchema", {
      workout_preset_id: 42,
      entry_date: "2026-03-12",
      notes: null,
    });

    expect(result).toEqual({
      success: true,
      data: {
        workout_preset_id: 42,
        entry_date: "2026-03-12",
        notes: null,
        source: "manual",
      },
    });
  });

  it("accepts freeform inline create payloads", () => {
    const result = runSchema("createPresetSessionRequestSchema", {
      name: "Morning Workout",
      entry_date: "2026-03-12",
      description: null,
      notes: null,
      source: "sparky",
      exercises: [
        {
          exercise_id: exerciseId,
          sort_order: 0,
          duration_minutes: 0,
          notes: null,
          sets: [
            {
              set_number: 1,
              set_type: "working",
              reps: 10,
              weight: 60,
              notes: null,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Morning Workout");
    expect(result.data.exercises).toHaveLength(1);
  });

  it("rejects create payloads that provide both workout sources", () => {
    const result = runSchema("createPresetSessionRequestSchema", {
      workout_preset_id: 42,
      name: "Morning Workout",
      entry_date: "2026-03-12",
      exercises: [
        {
          exercise_id: exerciseId,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects create payloads that provide neither workout source", () => {
    const result = runSchema("createPresetSessionRequestSchema", {
      entry_date: "2026-03-12",
      name: "Morning Workout",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty exercise arrays", () => {
    const result = runSchema("createPresetSessionRequestSchema", {
      name: "Morning Workout",
      entry_date: "2026-03-12",
      exercises: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts nullable fields in update payloads", () => {
    const result = runSchema("updatePresetSessionRequestSchema", {
      description: null,
      notes: null,
    });

    expect(result).toEqual({
      success: true,
      data: {
        description: null,
        notes: null,
      },
    });
  });

  it("rejects empty update payloads", () => {
    const result = runSchema("updatePresetSessionRequestSchema", {});
    expect(result.success).toBe(false);
  });
});
