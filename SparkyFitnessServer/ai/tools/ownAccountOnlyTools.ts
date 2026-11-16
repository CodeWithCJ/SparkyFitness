// Tools for things that only work in your own account: run programs and
// fitness tests (their routes refuse a switched user), the Compare report
// (likewise), Sparky's saved food preferences and tasks, which belong to the
// signed-in person, and the profile and settings, which the web hides after a
// switch. In a family member's account they say so, instead of failing on
// row-level security or reporting the data as empty.
export const OWN_ACCOUNT_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'sparky_manage_profile',
  'sparky_manage_run_program',
  'sparky_compare_metrics',
  'sparky_food_assistant_state',
]);
