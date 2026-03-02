const { calculateAdaptiveTdee } = require("../services/AdaptiveTdeeService");
const userRepository = require("../models/userRepository");
const preferenceRepository = require("../models/preferenceRepository");
const measurementRepository = require("../models/measurementRepository");
const reportRepository = require("../models/reportRepository");
const bmrService = require("../services/bmrService");
const { subDays, format, startOfDay } = require("date-fns");

jest.mock("../models/userRepository");
jest.mock("../models/preferenceRepository");
jest.mock("../models/measurementRepository");
jest.mock("../models/reportRepository");
jest.mock("../services/bmrService");
jest.mock("../config/logging");

describe("AdaptiveTdeeService", () => {
  const userId = "test-user-123";
  const calculationDate = startOfDay(new Date());
  const calculationDateStr = format(calculationDate, "yyyy-MM-dd");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should calculate TDEE correctly without ReferenceError", async () => {
    // Mock data
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: "1990-01-01",
      gender: "male",
    });
    preferenceRepository.getUserPreferences.mockResolvedValue({
      bmr_algorithm: "Mifflin-St Jeor",
      activity_level: "moderate",
    });

    // Mock weight entries spanning 35 days
    const weightEntries = [];
    for (let i = 0; i < 35; i += 7) {
      weightEntries.push({
        entry_date: format(subDays(calculationDate, 35 - i), "yyyy-MM-dd"),
        weight: 80 - i / 7, // Slight weight loss
      });
    }
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue(
      weightEntries,
    );
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
      height: 180,
    });

    // Mock nutrition data for last 35 days
    const nutritionData = [];
    for (let i = 0; i < 35; i++) {
      nutritionData.push({
        date: format(subDays(calculationDate, i), "yyyy-MM-dd"),
        calories: 2500,
      });
    }
    reportRepository.getNutritionData.mockResolvedValue(nutritionData);
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    const result = await calculateAdaptiveTdee(userId, calculationDateStr);

    expect(result).toBeDefined();
    expect(result.tdee).toBeGreaterThan(0);
    expect(result.isFallback).toBe(false);
    expect(result.daysOfData).toBeGreaterThanOrEqual(28);
  });

  test("should return fallback if insufficient weight data", async () => {
    const fallbackUserId = "test-user-fallback";
    userRepository.getUserProfile.mockResolvedValue({});
    preferenceRepository.getUserPreferences.mockResolvedValue({});
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue([
      { entry_date: calculationDateStr, weight: 80 },
    ]);
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
    });
    reportRepository.getNutritionData.mockResolvedValue([]);
    bmrService.calculateBmr.mockReturnValue(1800);

    const result = await calculateAdaptiveTdee(
      fallbackUserId,
      calculationDateStr,
    );

    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toContain("Insufficient weight entries");
  });
});
