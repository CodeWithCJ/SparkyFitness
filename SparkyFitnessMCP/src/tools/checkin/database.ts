import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";
import { convertUnit } from "../food/utils.js";

/**
 * Health Check-In & Biometrics Database Logic
 */

export const upsertBiometrics = async (args: any) => {
    let { entry_date, weight, weight_unit, steps, height, height_unit, neck, waist, hips, measurements_unit, body_fat } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    // 1. Fetch user unit preferences
    const prefRes = await query("SELECT default_weight_unit, default_measurement_unit FROM user_preferences WHERE user_id = $1", [MOCK_USER_ID]);
    const prefs = prefRes.rows[0] || { default_weight_unit: 'kg', default_measurement_unit: 'cm' };

    // 2. Conversion helper function
    const convertValue = (val: number | undefined, providedUnit: string | undefined, defaultUnit: string, targetUnit: string) => {
        if (val === undefined || val === null) return undefined;
        const unit = providedUnit || defaultUnit;
        if (unit.toLowerCase() === targetUnit.toLowerCase()) return val;
        
        const converted = convertUnit(val, unit, targetUnit);
        return converted !== null ? Math.round(converted * 100) / 100 : val;
    };

    // 3. Convert all metrics to DB standards (kg, cm)
    const finalWeight = convertValue(weight, weight_unit, prefs.default_weight_unit, 'kg');
    const finalHeight = convertValue(height, height_unit, prefs.default_measurement_unit, 'cm');
    const finalNeck = convertValue(neck, measurements_unit, prefs.default_measurement_unit, 'cm');
    const finalWaist = convertValue(waist, measurements_unit, prefs.default_measurement_unit, 'cm');
    const finalHips = convertValue(hips, measurements_unit, prefs.default_measurement_unit, 'cm');

    // 4. Check if an entry already exists for this user and date
    const checkRes = await query(
        "SELECT id FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2",
        [MOCK_USER_ID, date]
    );

    if (checkRes.rows.length > 0) {
        // Update existing entry
        const entryId = checkRes.rows[0].id;
        await query(
            `UPDATE check_in_measurements SET
                weight = COALESCE($1, weight),
                steps = COALESCE($2, steps),
                height = COALESCE($3, height),
                neck = COALESCE($4, neck),
                waist = COALESCE($5, waist),
                hips = COALESCE($6, hips),
                body_fat_percentage = COALESCE($7, body_fat_percentage),
                updated_by_user_id = $8,
                updated_at = now()
            WHERE id = $9`,
            [finalWeight, steps, finalHeight, finalNeck, finalWaist, finalHips, body_fat, MOCK_USER_ID, entryId]
        );
        return { content: [{ type: "text", text: `✅ Updated biometrics for ${date}.` }] };
    } else {
        // Create new entry
        await query(
            `INSERT INTO check_in_measurements (
                user_id, entry_date, weight, steps, height, neck, waist, hips, body_fat_percentage, 
                created_by_user_id, updated_by_user_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $1, $1, now(), now())`,
            [MOCK_USER_ID, date, finalWeight, steps, finalHeight, finalNeck, finalWaist, finalHips, body_fat]
        );
        return { content: [{ type: "text", text: `✅ Logged biometrics for ${date}.` }] };
    }
};

export const manageCustomMetrics = async (args: any) => {
    const { action, category_name, value, unit, notes, entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    if (action === "list_categories") {
        const cats = await query("SELECT * FROM custom_categories WHERE user_id = $1", [MOCK_USER_ID]);
        return { content: [{ type: "text", text: JSON.stringify(cats.rows, null, 2) }] };
    }

    if (action === "create_category") {
        const res = await query(
            `INSERT INTO custom_categories (user_id, name, display_name, measurement_type, frequency, created_by_user_id, updated_by_user_id) 
             VALUES ($1, $2, $2, $3, 'Daily', $1, $1) RETURNING id`,
            [MOCK_USER_ID, category_name, unit || 'unit']
        );
        return { content: [{ type: "text", text: `✅ Created category "${category_name}" with ID ${res.rows[0].id}.` }] };
    }

    if (action === "log_value") {
        const catRes = await query("SELECT id FROM custom_categories WHERE name ILIKE $1 AND user_id = $2 LIMIT 1", [category_name, MOCK_USER_ID]);
        if (catRes.rows.length === 0) return { content: [{ type: "text", text: `Category "${category_name}" not found.` }], isError: true };
        
        await query(
            `INSERT INTO custom_measurements (user_id, category_id, value, entry_date, notes, created_by_user_id, updated_by_user_id, entry_timestamp) 
             VALUES ($1, $2, $3, $4, $5, $1, $1, now())`,
            [MOCK_USER_ID, catRes.rows[0].id, value.toString(), date, notes]
        );
        return { content: [{ type: "text", text: `✅ Logged ${category_name}: ${value} for ${date}.` }] };
    }
};

export const logMood = async (args: any) => {
    const { value, notes, entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    await query(
        `INSERT INTO mood_entries (user_id, mood_value, notes, entry_date, created_by_user_id, updated_by_user_id, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $1, $1, now(), now())
         ON CONFLICT (user_id, entry_date) DO UPDATE SET 
            mood_value = EXCLUDED.mood_value, 
            notes = EXCLUDED.notes, 
            updated_at = now()`,
        [MOCK_USER_ID, value, notes, date]
    );
    return { content: [{ type: "text", text: `✅ Logged mood (${value}/10) for ${date}.` }] };
};

export const logFasting = async (args: any) => {
    const { start_time, end_time, status, type } = args;
    const res = await query(
        `INSERT INTO fasting_logs (user_id, start_time, end_time, status, fasting_type, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, now(), now()) RETURNING id`,
        [MOCK_USER_ID, start_time, end_time, status || 'COMPLETED', type || 'Intermittent']
    );
    return { content: [{ type: "text", text: `✅ Logged fasting entry ${res.rows[0].id}.` }] };
};

export const logSleep = async (args: any) => {
    let { entry_date, duration_seconds, score, bedtime, wake_time, source, notes } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    // 1. Logic: If we have bedtime and wake_time, calculate duration
    if (bedtime && wake_time && !duration_seconds) {
        const start = new Date(bedtime);
        const end = new Date(wake_time);
        duration_seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
        console.log(`[CheckIn] Calculated sleep duration: ${duration_seconds}s`);
    }

    // 2. Logic: If we only have duration, estimate bedtime/wake_time (DB requires them)
    if (duration_seconds && (!bedtime || !wake_time)) {
        console.log(`[CheckIn] Estimating bedtime/wake_time from duration: ${duration_seconds}s`);
        const end = new Date(); // Use now as default wake time
        end.setHours(7, 30, 0, 0); // Standardize to 7:30 AM
        const start = new Date(end.getTime() - (duration_seconds * 1000));
        
        bedtime = start.toISOString();
        wake_time = end.toISOString();
    }

    // 3. Final validation: Ensure we don't send nulls to NOT NULL columns
    if (!bedtime || !wake_time || !duration_seconds) {
        console.error(`[CheckIn] Error: Missing required sleep data. Bedtime: ${bedtime}, Wake: ${wake_time}, Duration: ${duration_seconds}`);
        return { content: [{ type: "text", text: "Error: Please provide either your sleep start/end times OR your total sleep duration." }], isError: true };
    }

    const res = await query(
        `INSERT INTO sleep_entries (
            user_id, entry_date, bedtime, wake_time, duration_in_seconds, sleep_score, source, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $1, $1) RETURNING id`,
        [MOCK_USER_ID, date, bedtime, wake_time, duration_seconds, score || null, source || 'manual']
    );
    return { content: [{ type: "text", text: `✅ Logged sleep for ${date} (Total: ${Math.round(duration_seconds / 3600 * 10) / 10} hours).` }] };
};

export const listHealthDiary = async (args: any) => {
    const { entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    const biometrics = await query("SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2", [MOCK_USER_ID, date]);
    const mood = await query("SELECT * FROM mood_entries WHERE user_id = $1 AND entry_date = $2", [MOCK_USER_ID, date]);
    const sleep = await query("SELECT * FROM sleep_entries WHERE user_id = $1 AND entry_date = $2", [MOCK_USER_ID, date]);
    const custom = await query(
        `SELECT cm.*, cc.display_name, cc.measurement_type as unit 
         FROM custom_measurements cm 
         JOIN custom_categories cc ON cm.category_id = cc.id 
         WHERE cm.user_id = $1 AND cm.entry_date = $2`,
        [MOCK_USER_ID, date]
    );

    const report = {
        date,
        biometrics: biometrics.rows[0] || null,
        mood: mood.rows[0] || null,
        sleep: sleep.rows || [],
        custom_metrics: custom.rows || []
    };

    return { content: [{ type: "text", text: `Health Check-In Diary for ${date}:
` + JSON.stringify(report, null, 2) }] };
};
