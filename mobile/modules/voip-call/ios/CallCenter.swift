import AVFoundation
import CallKit
import Foundation
import PushKit
import UIKit
import UserNotifications

// 다이브를 전화처럼. A dive that picked this phone rings like a phone call: a VoIP push (PushKit) wakes the app — closed
// or not — and the call is reported to CallKit right here, before anything else (iOS ends the app otherwise). The
// system call screen rings with the dive's ringtone — full screen on the lock screen, a banner while the phone is in
// use. Answer / decline / mute come back here and go on to JS, which joins (or leaves) the LiveKit room.
// Every step is written to a small log (설정 → 알림 → 전화 기록) — the only window into what happened while the app
// was closed. When CallKit will not take the call (a Focus mode, a block list), a time-sensitive notification goes
// out instead, so the dive is not lost.
final class CallCenter: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  static let shared = CallCenter()
  // Rings this long at most; then it is a missed call.
  static let ringSeconds = 60.0
  private static let logKey = "VoipCall.log", logMax = 40

  struct Call {
    let uuid: UUID
    let dive: String
    let test: Bool
    var answered: Bool
  }

  private let provider: CXProvider
  private let controller = CXCallController()
  private var registry: PKPushRegistry?
  private(set) var voipToken: String?
  private var current: Call?
  private var timeout: DispatchWorkItem?
  private var ringback: AVAudioPlayer?
  // Events for JS — kept until JS listens (the push may have just woken the app).
  private var sink: ((String, [String: Any?]) -> Void)?
  private var pending: [(String, [String: Any?])] = []

  private override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    config.ringtoneSound = "dive-ring.wav"
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  // At launch: PushKit. The VoIP address comes to didUpdate (and again whenever it changes).
  func start() {
    guard registry == nil else { return }
    let r = PKPushRegistry(queue: .main)
    r.delegate = self
    r.desiredPushTypes = [.voIP]
    registry = r
    note("PushKit 시작")
  }

  // MARK: - PushKit

  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = credentials.token.map { String(format: "%02hhx", $0) }.joined()
    voipToken = token
    note("VoIP 주소 받음 \(token.prefix(8))…")
    emit("onVoipToken", ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    voipToken = nil
    note("VoIP 주소 무효화됨")
    emit("onVoipToken", ["token": ""])
  }

  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else {
      completion()
      return
    }
    let p = payload.dictionaryPayload
    let dive = p["dive"] as? String ?? ""
    let uuid = UUID(uuidString: p["uuid"] as? String ?? dive) ?? UUID()
    let caller = p["caller"] as? String ?? "팀원"
    note("VoIP 푸시 받음 — \(caller), 방 \(dive.prefix(8))")
    report(
      uuid: uuid,
      dive: dive,
      caller: caller,
      agenda: p["agenda"] as? String ?? "",
      team: p["team"] as? String ?? "",
      test: p["test"] as? Bool ?? false,
      completion: completion
    )
  }

  // The call screen. One call at a time: a newer dive takes over from one still ringing.
  func report(uuid: UUID, dive: String, caller: String, agenda: String, team: String, test: Bool, completion: @escaping () -> Void) {
    if let c = current, !c.answered {
      provider.reportCall(with: c.uuid, endedAt: nil, reason: .remoteEnded)
    }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: caller)
    update.localizedCallerName = agenda.isEmpty ? caller : "\(caller) · \(agenda)"
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    current = Call(uuid: uuid, dive: dive, test: test, answered: false)
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      guard let self = self else {
        completion()
        return
      }
      if let error = error {
        self.note("CallKit 거절: \(CallCenter.describe(error))")
        if self.current?.uuid == uuid {
          self.current = nil
        }
        if !test {
          self.fallbackNotification(dive: dive, team: team, caller: caller, agenda: agenda)
        }
      } else {
        self.note("전화 화면 울림")
      }
      completion()
    }
    emit("onIncomingCall", ["uuid": uuid.uuidString, "dive": dive, "team": team, "caller": caller, "agenda": agenda, "test": test])
    timeout?.cancel()
    let t = DispatchWorkItem { [weak self] in
      self?.note("60초 — 부재중")
      self?.end(uuid: uuid, reason: "unanswered")
    }
    timeout = t
    DispatchQueue.main.asyncAfter(deadline: .now() + CallCenter.ringSeconds, execute: t)
  }

  // CallKit would not take the call: a time-sensitive notification with the ringtone (it gets through a Focus mode),
  // so the person still knows. Tapping it opens the app on the dive.
  private func fallbackNotification(dive: String, team: String, caller: String, agenda: String) {
    let content = UNMutableNotificationContent()
    content.title = "🌊 \(caller)님이 다이브를 요청했어요"
    content.body = agenda
    content.sound = UNNotificationSound(named: UNNotificationSoundName("dive-ring.wav"))
    content.interruptionLevel = .timeSensitive
    let data: [String: Any] = ["kind": "dive", "dive": dive, "team": team, "picked": true]
    content.userInfo = ["body": data, "kind": "dive", "dive": dive, "team": team, "picked": true]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "dive-" + dive, content: content, trigger: nil)) { [weak self] error in
      self?.note(error == nil ? "대신 알림으로 보냄" : "알림도 실패: \(error!.localizedDescription)")
    }
  }

  private static func describe(_ error: Error) -> String {
    let e = error as NSError
    let words: [Int: String] = [1: "알 수 없음", 2: "권한 없음(unentitled)", 3: "같은 통화가 이미 있음", 4: "집중 모드(방해금지)가 걸러냄", 5: "차단 목록이 걸러냄", 6: "통화 그룹 가득 참"]
    return (words[e.code] ?? e.localizedDescription) + " [\(e.domain) \(e.code)]"
  }

  // MARK: - 연결음 (the caller, while nobody has come into the room): a looped soft tone through the call's own
  // audio route; the session itself is left to the call.

  func playRingback() {
    guard ringback == nil, let url = Bundle.main.url(forResource: "dive-ringback", withExtension: "wav") else { return }
    do {
      let p = try AVAudioPlayer(contentsOf: url)
      p.numberOfLoops = -1
      p.volume = 0.7
      p.prepareToPlay()
      p.play()
      ringback = p
    } catch {
      note("연결음 실패: \(error.localizedDescription)")
    }
  }

  func stopRingback() {
    ringback?.stop()
    ringback = nil
  }

  // MARK: - from JS

  // The person joined from inside the app while the call screen was still ringing: answer it there too, so the
  // system knows the call is on (the answer comes back through the delegate like a tap on the screen).
  func answer(uuid: UUID) {
    guard let c = current, c.uuid == uuid, !c.answered else { return }
    controller.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { _ in }
  }

  // local: the person hung up in the app (a proper end action, so the system call UI goes too) · unanswered ·
  // elsewhere: answered on another device · anything else: the dive is over.
  func end(uuid: UUID, reason: String) {
    guard let c = current, c.uuid == uuid else { return }
    timeout?.cancel()
    if reason == "local" {
      controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { _ in }
      return
    }
    let why: CXCallEndedReason = reason == "unanswered" ? .unanswered : reason == "elsewhere" ? .answeredElsewhere : .remoteEnded
    provider.reportCall(with: uuid, endedAt: nil, reason: why)
    current = nil
    note("끝 (\(reason))")
    emit("onEndCall", ["uuid": uuid.uuidString, "dive": c.dive, "test": c.test, "answered": c.answered, "reason": reason])
  }

  func state() -> [String: Any] {
    var s: [String: Any] = ["token": voipToken ?? NSNull(), "answered": false, "uuid": NSNull(), "dive": NSNull(), "test": false]
    if let c = current {
      s["uuid"] = c.uuid.uuidString
      s["dive"] = c.dive
      s["answered"] = c.answered
      s["test"] = c.test
    }
    return s
  }

  // MARK: - CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    timeout?.cancel()
    current = nil
    note("CallKit 초기화됨")
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard var c = current, c.uuid == action.callUUID else {
      action.fail()
      return
    }
    timeout?.cancel()
    c.answered = true
    current = c
    note("받음")
    emit("onAnswerCall", ["uuid": c.uuid.uuidString, "dive": c.dive, "test": c.test])
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    timeout?.cancel()
    if let c = current, c.uuid == action.callUUID {
      current = nil
      note(c.answered ? "끊음" : "거절")
      emit("onEndCall", ["uuid": c.uuid.uuidString, "dive": c.dive, "test": c.test, "answered": c.answered, "reason": c.answered ? "hangup" : "declined"])
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    emit("onMute", ["muted": action.isMuted])
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    emit("onAudioSession", ["active": true])
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    emit("onAudioSession", ["active": false])
  }

  // MARK: - events

  private func emit(_ name: String, _ body: [String: Any?]) {
    if let sink = sink {
      sink(name, body)
    } else {
      pending.append((name, body))
    }
  }

  func attach(_ sink: @escaping (String, [String: Any?]) -> Void) {
    self.sink = sink
    let queued = pending
    pending = []
    for (name, body) in queued {
      sink(name, body)
    }
  }

  func detach() {
    sink = nil
  }

  // MARK: - the log (kept on the device, newest last)

  private func note(_ text: String) {
    let f = DateFormatter()
    f.dateFormat = "MM-dd HH:mm:ss"
    var state = "?"
    if Thread.isMainThread {
      switch UIApplication.shared.applicationState {
      case .active: state = "앞"
      case .inactive: state = "전환"
      case .background: state = "뒤"
      @unknown default: state = "?"
      }
    }
    let line = "\(f.string(from: Date())) [\(state)] \(text)"
    let d = UserDefaults.standard
    var lines = d.stringArray(forKey: CallCenter.logKey) ?? []
    lines.append(line)
    if lines.count > CallCenter.logMax {
      lines.removeFirst(lines.count - CallCenter.logMax)
    }
    d.set(lines, forKey: CallCenter.logKey)
  }

  // JS writes its own lines (why a call was dropped, an audio error) into the same log.
  func noteFromJS(_ text: String) {
    note("JS: " + text)
  }

  func log() -> [String] {
    return UserDefaults.standard.stringArray(forKey: CallCenter.logKey) ?? []
  }

  func clearLog() {
    UserDefaults.standard.removeObject(forKey: CallCenter.logKey)
  }
}
