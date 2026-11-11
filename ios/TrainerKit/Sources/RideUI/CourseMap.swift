import MapKit
import SwiftUI
import TrainerKit

/// The real course on a map: the route, what you've ridden in green, and a dot where you are.
/// Shows the whole course (no panning while riding); only courses with a stored route have one.
struct CourseMap: View {
  let course: RideCourse
  var position: Double? = nil

  private var coords: [CLLocationCoordinate2D] {
    (course.track ?? []).map { CLLocationCoordinate2D(latitude: $0[1], longitude: $0[2]) }
  }

  var body: some View {
    let all = coords
    let split = position.map { min(all.count - 1, course.trackIndex(at: $0) + 1) } ?? 0
    let here = position.flatMap { course.position(at: $0) }.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
    Map(initialPosition: .automatic, interactionModes: []) {
      MapPolyline(coordinates: all).stroke(Color.white.opacity(0.85), style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
      if split > 0, let here {
        MapPolyline(coordinates: Array(all.prefix(split)) + [here]).stroke(RidePalette.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
      }
      if let first = all.first {
        Annotation("Start", coordinate: first, anchor: .center) {
          Circle().fill(Color.white).frame(width: 10, height: 10).overlay(Circle().stroke(Color.black.opacity(0.6), lineWidth: 2))
        }
        .annotationTitles(.hidden)
      }
      if let here {
        Annotation("You", coordinate: here, anchor: .center) {
          Circle().fill(RidePalette.accent).frame(width: 18, height: 18)
            .overlay(Circle().stroke(Color.black, lineWidth: 3))
            .shadow(color: RidePalette.accent.opacity(0.6), radius: 6)
        }
        .annotationTitles(.hidden)
      }
    }
    .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
    .environment(\.colorScheme, .dark)
    .clipShape(RoundedRectangle(cornerRadius: 18))
    .accessibilityLabel("Course map")
  }
}
