jest.mock("../db/poolManager", () => ({
  getClient: jest.fn(),
  getSystemClient: jest.fn(),
}));

jest.mock("../models/exerciseRepository", () => ({}));
jest.mock("../models/exercise", () => ({
  getExerciseById: jest.fn(),
}));
jest.mock("../models/exerciseEntry", () => ({
  _createExerciseEntryWithClient: jest.fn(),
  deleteExerciseEntriesByPresetEntryIdWithClient: jest.fn(),
  updateExerciseEntriesDateByPresetEntryIdWithClient: jest.fn(),
}));
jest.mock("../models/activityDetailsRepository", () => ({}));
jest.mock("../models/exercisePresetEntryRepository", () => ({
  createExercisePresetEntryWithClient: jest.fn(),
  updateExercisePresetEntryWithClient: jest.fn(),
  getExercisePresetEntryById: jest.fn(),
}));
jest.mock("../models/userRepository", () => ({}));
jest.mock("../models/preferenceRepository", () => ({}));
jest.mock("../models/workoutPresetRepository", () => ({
  getWorkoutPresetById: jest.fn(),
}));
jest.mock("../config/logging", () => ({
  log: jest.fn(),
}));
jest.mock("../integrations/wger/wgerService", () => ({}));
jest.mock("../integrations/nutritionix/nutritionixService", () => ({}));
jest.mock("../integrations/freeexercisedb/FreeExerciseDBService", () => ({}));
jest.mock("../models/measurementRepository", () => ({}));
jest.mock("../utils/imageDownloader", () => ({
  downloadImage: jest.fn(),
}));
jest.mock("../services/CalorieCalculationService", () => ({
  estimateCaloriesBurnedPerHour: jest.fn(),
}));
jest.mock("../utils/uuidUtils", () => ({
  isValidUuid: jest.fn(),
  resolveExerciseIdToUuid: jest.fn(),
}));
jest.mock("../models/familyAccessRepository", () => ({
  checkFamilyAccessPermission: jest.fn(),
}));
jest.mock("../services/exerciseEntryHistoryService", () => ({
  getGroupedExerciseSessionById: jest.fn(),
  getGroupedExerciseSessionByIdWithClient: jest.fn(),
}));

const { getClient } = require("../db/poolManager");
const exerciseDb = require("../models/exercise");
const exerciseEntryDb = require("../models/exerciseEntry");
const exercisePresetEntryRepository = require("../models/exercisePresetEntryRepository");
const workoutPresetRepository = require("../models/workoutPresetRepository");
const calorieCalculationService = require("../services/CalorieCalculationService");
const { resolveExerciseIdToUuid } = require("../utils/uuidUtils");
const {
  getGroupedExerciseSessionByIdWithClient,
} = require("../services/exerciseEntryHistoryService");
const exerciseService = require("../services/exerciseService");

describe("exerciseService grouped workouts", () => {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getClient.mockResolvedValue(client);
    client.query.mockResolvedValue({});
  });

  it("rolls back grouped workout creation when a child insert fails", async () => {
    workoutPresetRepository.getWorkoutPresetById.mockResolvedValue({
      id: 42,
      name: "Push Day",
      description: "Preset",
      exercises: [
        {
          exercise_id: "exercise-1",
          sort_order: 0,
          sets: [],
        },
      ],
    });
    exercisePresetEntryRepository.createExercisePresetEntryWithClient.mockResolvedValue(
      { id: "preset-entry-1" },
    );
    resolveExerciseIdToUuid.mockResolvedValue(
      "11111111-1111-4111-8111-111111111111",
    );
    exerciseDb.getExerciseById.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Bench Press",
      calories_per_hour: 300,
    });
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      300,
    );
    exerciseEntryDb._createExerciseEntryWithClient.mockRejectedValue(
      new Error("child insert failed"),
    );

    await expect(
      exerciseService.createGroupedWorkoutSession(
        "user-1",
        "actor-1",
        {
          workout_preset_id: 42,
          entry_date: "2026-03-12",
          source: "manual",
        },
      ),
    ).rejects.toThrow("child insert failed");

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("propagates entry_date changes to existing child entries on header-only updates", async () => {
    getGroupedExerciseSessionByIdWithClient
      .mockResolvedValueOnce({
        type: "preset",
        id: "preset-entry-1",
        entry_date: "2026-03-12",
        workout_preset_id: null,
        name: "Morning Workout",
        description: null,
        notes: null,
        source: "manual",
        total_duration_minutes: 0,
        exercises: [],
        activity_details: [],
      })
      .mockResolvedValueOnce({
        type: "preset",
        id: "preset-entry-1",
        entry_date: "2026-03-13",
        workout_preset_id: null,
        name: "Morning Workout",
        description: null,
        notes: null,
        source: "manual",
        total_duration_minutes: 0,
        exercises: [],
        activity_details: [],
      });

    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: "preset-entry-1" },
    );

    const result = await exerciseService.updateGroupedWorkoutSession(
      "user-1",
      "actor-1",
      "preset-entry-1",
      { entry_date: "2026-03-13" },
    );

    expect(
      exerciseEntryDb.updateExerciseEntriesDateByPresetEntryIdWithClient,
    ).toHaveBeenCalledWith(
      client,
      "user-1",
      "preset-entry-1",
      "2026-03-13",
      "actor-1",
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(result.entry_date).toBe("2026-03-13");
  });

  it("rejects nested child edits for synced grouped workouts and rolls back", async () => {
    getGroupedExerciseSessionByIdWithClient.mockResolvedValue({
      type: "preset",
      id: "preset-entry-1",
      entry_date: "2026-03-12",
      workout_preset_id: null,
      name: "Imported Workout",
      description: null,
      notes: null,
      source: "garmin",
      total_duration_minutes: 0,
      exercises: [],
      activity_details: [],
    });
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: "preset-entry-1" },
    );

    await expect(
      exerciseService.updateGroupedWorkoutSession(
        "user-1",
        "actor-1",
        "preset-entry-1",
        {
          exercises: [
            {
              exercise_id: "11111111-1111-4111-8111-111111111111",
              sort_order: 0,
              duration_minutes: 0,
              sets: [],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Nested exercise editing is only supported for manual or sparky workouts.",
    });

    expect(
      exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient,
    ).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
