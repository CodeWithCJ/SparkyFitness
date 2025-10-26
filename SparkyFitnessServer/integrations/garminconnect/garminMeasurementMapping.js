const garminMeasurementMapping = {
    // Check-in Measurements
    'weight': { targetType: 'check_in', field: 'weight' },
    'body_fat_percentage': { targetType: 'check_in', field: 'body_fat' },
    'bmi': { targetType: 'check_in', field: 'bmi' },
    'body_water_percentage': { targetType: 'check_in', field: 'body_water' },
    'bone_mass': { targetType: 'check_in', field: 'bone_mass' },
    'muscle_mass': { targetType: 'check_in', field: 'muscle_mass' },

    // Custom Measurements
    'daily_summary': { targetType: 'custom', name: 'Daily Summary' },
    'heart_rates': { targetType: 'custom', name: 'Heart Rates' },
    'sleep': { targetType: 'custom', name: 'Sleep' },
    'stress': { targetType: 'custom', name: 'Stress Level' },
    'respiration': { targetType: 'custom', name: 'Respiration Rate' },
    'spo2': { targetType: 'custom', name: 'SpO2' },
    'intensity_minutes': { targetType: 'custom', name: 'Intensity Minutes' },
    'training_readiness': { targetType: 'custom', name: 'Training Readiness' },
    'training_status': { targetType: 'custom', name: 'Training Status' },
    'max_metrics': { targetType: 'custom', name: 'Max Metrics' },
    'hrv': { targetType: 'custom', name: 'HRV' },
    'lactate_threshold': { targetType: 'custom', name: 'Lactate Threshold' },
    'endurance_score': { targetType: 'custom', name: 'Endurance Score' },
    'hill_score': { targetType: 'custom', name: 'Hill Score' },
    'race_predictions': { targetType: 'custom', name: 'Race Predictions' },
    'blood_pressure': { targetType: 'custom', name: 'Blood Pressure' },
    'body_battery': { targetType: 'custom', name: 'Body Battery' },
    'menstrual_data': { targetType: 'custom', name: 'Menstrual Data' },
    'menstrual_calendar_data': { targetType: 'custom', name: 'Menstrual Calendar Data' },
    'pregnancy_summary': { targetType: 'custom', name: 'Pregnancy Summary' },
};

module.exports = garminMeasurementMapping;