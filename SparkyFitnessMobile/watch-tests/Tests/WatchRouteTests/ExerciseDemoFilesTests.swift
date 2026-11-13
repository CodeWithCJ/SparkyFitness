import XCTest
@testable import WatchRoute

final class ExerciseDemoFilesTests: XCTestCase {
    func testFileNamesAreSafeAndBounded() {
        XCTAssertEqual(ExerciseDemoFiles.fileName(key: "abc-123", index: 0), "abc-123-0.jpg")
        XCTAssertEqual(ExerciseDemoFiles.fileName(key: "../x y", index: 1), "___x_y-1.jpg")
        XCTAssertNil(ExerciseDemoFiles.fileName(key: "abc", index: 2))
        XCTAssertNil(ExerciseDemoFiles.fileName(key: "", index: 0))
        XCTAssertNil(ExerciseDemoFiles.fileName(key: String(repeating: "a", count: 81), index: 0))
    }

    func testKeyOfFileName() {
        XCTAssertEqual(ExerciseDemoFiles.key(ofFileName: "abc-123-1.jpg"), "abc-123")
        XCTAssertNil(ExerciseDemoFiles.key(ofFileName: "junk.txt"))
    }

    func testPrunesOldestBeyondLimitButNeverThePlansKeys() {
        let base = Date(timeIntervalSince1970: 1000)
        let files = (0..<6).map { (name: "k\($0)-0.jpg", modified: base.addingTimeInterval(Double($0))) }
        XCTAssertEqual(ExerciseDemoFiles.filesToDelete(files, keeping: [], limit: 4), ["k0-0.jpg", "k1-0.jpg"])
        XCTAssertEqual(ExerciseDemoFiles.filesToDelete(files, keeping: ["k0"], limit: 4), ["k1-0.jpg", "k2-0.jpg"])
        XCTAssertEqual(ExerciseDemoFiles.filesToDelete(files, keeping: [], limit: 6), [])
    }
}
