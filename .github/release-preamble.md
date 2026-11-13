### 💙 Support SparkyFitness

If SparkyFitness has been useful to you & your family, please consider [sponsoring on GitHub](https://github.com/sponsors/CodeWithCJ) or supporting via [Ko-fi](https://ko-fi.com/sparkyapps). Your support helps cover recurring costs such as AI coding tools, development infrastructure, and Apple & Google Developer memberships to keep the project actively maintained.

---

> [!IMPORTANT]
> 💾 **Upgrade Notice:** Always remember to back up your database and environment before upgrading to a new version.
>
> 👍 **Community Prioritization:** Want to see a specific feature or fix in the next release? Add a 👍 reaction to open [Issues](https://github.com/CodeWithCJ/SparkyFitness/issues) to help us prioritize what to build next!

---

## 🚀 Key Highlights

<!-- Add key release highlights here -->

- **Adaptive calorie budgets:** Dynamic Goal and Percentage Earn-Back no longer add activity calories or optional BMR credit to an Adaptive target a second time. Remaining calories may be lower after upgrading because these duplicate credits are removed. Recorded activity remains visible, and Manual targets retain their existing earn-back behavior.
- **Adaptive estimate upgrade:** The revised estimator rebuilds TDEE from saved food and weight logs without carrying over the old estimate. Short or sparse history can immediately produce a formula fallback or a partly blended estimate, changing existing adaptive calorie targets in either direction. The 36 kcal/day TDEE stability limit applies within this estimator version, not to the one-time change between versions.
