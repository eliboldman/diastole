import Foundation

/// Little-endian reader for Bluetooth characteristic values. Every read is bounds-checked and
/// returns nil past the end, so a short or malformed packet never crashes the app.
struct ByteReader {
  private let bytes: [UInt8]
  private(set) var offset = 0

  init(_ data: Data) { bytes = [UInt8](data) }
  init(_ bytes: [UInt8]) { self.bytes = bytes }

  var remaining: Int { bytes.count - offset }

  mutating func u8() -> UInt8? {
    guard remaining >= 1 else { return nil }
    defer { offset += 1 }
    return bytes[offset]
  }

  mutating func u16() -> UInt16? {
    guard remaining >= 2 else { return nil }
    defer { offset += 2 }
    return UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
  }

  mutating func s16() -> Int16? { u16().map { Int16(bitPattern: $0) } }

  mutating func u24() -> UInt32? {
    guard remaining >= 3 else { return nil }
    defer { offset += 3 }
    return UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16
  }

  mutating func u32() -> UInt32? {
    guard remaining >= 4 else { return nil }
    defer { offset += 4 }
    return UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16
      | UInt32(bytes[offset + 3]) << 24
  }

  mutating func skip(_ n: Int) -> Bool {
    guard remaining >= n else { return false }
    offset += n
    return true
  }
}

extension Array where Element == UInt8 {
  mutating func appendLE(_ v: UInt16) { append(UInt8(v & 0xFF)); append(UInt8(v >> 8)) }
  mutating func appendLE(_ v: Int16) { appendLE(UInt16(bitPattern: v)) }
}
