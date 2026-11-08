import ExpoModulesCore

// JS side of CallCenter: the VoIP address and the call under way, answer / hang up, and the events
// (onVoipToken, onIncomingCall, onAnswerCall, onEndCall, onMute, onAudioSession).
public class VoipCallModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoipCall")

    Events("onVoipToken", "onIncomingCall", "onAnswerCall", "onEndCall", "onMute", "onAudioSession")

    OnStartObserving {
      CallCenter.shared.attach { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnStopObserving {
      CallCenter.shared.detach()
    }

    Function("state") { () -> [String: Any] in
      return CallCenter.shared.state()
    }

    AsyncFunction("answerCall") { (uuid: String) in
      if let u = UUID(uuidString: uuid) {
        CallCenter.shared.answer(uuid: u)
      }
    }.runOnQueue(.main)

    AsyncFunction("endCall") { (uuid: String, reason: String) in
      if let u = UUID(uuidString: uuid) {
        CallCenter.shared.end(uuid: u, reason: reason)
      }
    }.runOnQueue(.main)
  }
}
