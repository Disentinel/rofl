// swift window.swift TEXT: the id of the first window whose title holds TEXT, for `screencapture -l`, which takes that window alone, covered or not.
import CoreGraphics
import Foundation
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
if let w = list.first(where: { ($0[kCGWindowName as String] as? String ?? "").contains(CommandLine.arguments[1]) }) { print(w[kCGWindowNumber as String] ?? "") }
