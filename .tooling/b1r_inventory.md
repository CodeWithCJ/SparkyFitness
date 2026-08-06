# B1-R Inventory (working doc — not committed)

## API contract (shared + server + web)
- GET /api/measurements/custom-categories -> [{id,name,display_name,frequency,measurement_type,data_type}]
  - NO ORDER BY, NO hidden/is_active flag, NO sort_order column
- GET /api/measurements/custom-entries/:date -> entries + nested custom_categories
- POST /api/measurements/custom-entries {category_id,value(number|string|boolean),entry_date,entry_hour?,entry_timestamp?,notes?,source?}
  - Daily: upsert by (category,date,source), hour->0
  - Hourly: upsert by (category,date,hour,source)
  - All/Unlimited: always INSERT
- DELETE /api/measurements/custom-entries/:id
- data_type in practice: numeric|text (web UI), boolean (mobile+server); server loose
- frequency in practice: Daily|Hourly|All (web UI) + Unlimited (mobile/server, = All)

## Mobile support matrix
| data_type | component | parse | payload | existing value | clear |
| numeric/null | FormInput decimal-pad | parseDecimalInput | number | String(value) | empty->delete if exists |
| boolean | CustomBooleanControl tri-state | 'true'/'false'/'' | string 'true'/'false' | prefilled | Clear->''->delete if exists |
| text/other | FormInput default | trimmed | string | String(value) | empty->delete if exists |

| frequency | UI | save | existing rows |
| Daily | single row | POST upsert | editable; clear->DELETE |
| Hourly | multi rows+hour stepper | POST per row w/ entry_hour | editable; same-hour+source conflict blocked |
| All/Unlimited | multi rows | POST INSERT | read-only; delete->DELETE; add new |

## Gaps found
1. rowValue() uses Number() not parseDecimalInput -> "1,5" (PL) invalid for custom numeric. FIX.
2. MeasurementsAddScreen custom header uses screenCopy.dashboardSettings.customTitle ("Custom Nutrient Display") -> wrong text. FIX: measurements.customTitle.
3. Text data_type FormInput placeholder "0" misleading. FIX: empty placeholder for non-numeric.
4. CustomBooleanControl missing accessibilityRole/State. FIX.
5. No screen-level tests for custom section (render/prefill/save/clear/freq/errors/locale). ADD.

## Verified non-issues
- notes undefined -> pg 8.20 prepareValue maps undefined->null (no contract bug)
- boolean 'false' string payload valid (API union includes string)
- zero: rowValue('0')->0, not ''; buildCustomOps keeps it
- hidden categories: no such API concept -> N/A
- sort: API order (stable per DB), web same -> no client sort added
- standard units: kg/lbs/cm/in via preferences (unchanged)
