import XCTest
@testable import WatchRoute

final class RestRuleTests: XCTestCase {
    private func step(
        _ entry: String, set: Int, own: Int?, before: Int = 0, run: Int? = nil, drop: Bool = false
    ) -> RestStepFacts {
        RestStepFacts(
            exerciseEntryId: entry, supersetRun: run, setNumber: set, isDrop: drop,
            ownRestSeconds: own, restBeforeSeconds: before
        )
    }

    func testPlainSetUsesItsOwnRest() {
        let done = step("a", set: 1, own: 90, before: 90)
        let next = step("a", set: 2, own: 120, before: 90)
        XCTAssertEqual(RestRule.restAfter(completed: done, next: next), 90)
    }

    func testLastSetOfExerciseUsesItsOwnRestNotTheNextExercises() {
        // Dips (90 s) then Side Lateral Raise (60 s).
        let dips = step("dips", set: 3, own: 90, before: 90)
        let raise = step("raise", set: 1, own: 60, before: 60)
        XCTAssertEqual(RestRule.restAfter(completed: dips, next: raise), 90)
    }

    func testWarmupUsesItsOwnRest() {
        let warmup = step("a", set: 1, own: 45, before: 45)
        let working = step("a", set: 2, own: 120, before: 45)
        XCTAssertEqual(RestRule.restAfter(completed: warmup, next: working), 45)
    }

    func testSupersetMemberInSameRoundHasNoRest() {
        let a = step("a", set: 1, own: 120, before: 120, run: 0)
        let b = step("b", set: 1, own: 120, before: 0, run: 0)
        XCTAssertEqual(RestRule.restAfter(completed: a, next: b), 0)
    }

    func testEndOfSupersetRoundUsesCompletedSetsRest() {
        let b1 = step("b", set: 1, own: 100, before: 0, run: 0)
        let a2 = step("a", set: 2, own: 120, before: 100, run: 0)
        XCTAssertEqual(RestRule.restAfter(completed: b1, next: a2), 100)
    }

    func testLeavingASupersetUsesCompletedSetsRest() {
        let b = step("b", set: 2, own: 100, before: 0, run: 0)
        let solo = step("c", set: 1, own: 60, before: 100)
        XCTAssertEqual(RestRule.restAfter(completed: b, next: solo), 100)
    }

    func testDifferentRunsAreNotBackToBack() {
        let a = step("a", set: 1, own: 80, run: 0)
        let b = step("b", set: 1, own: 80, run: 1)
        XCTAssertEqual(RestRule.restAfter(completed: a, next: b), 80)
    }

    func testNextDropSetHasNoRest() {
        let done = step("a", set: 1, own: 90)
        let drop = step("a", set: 2, own: 0, drop: true)
        XCTAssertEqual(RestRule.restAfter(completed: done, next: drop), 0)
    }

    func testOlderPhoneFallsBackToRestBeforeNextSet() {
        let done = step("a", set: 1, own: nil)
        let next = step("b", set: 1, own: nil, before: 60)
        XCTAssertEqual(RestRule.restAfter(completed: done, next: next), 60)
    }
}
