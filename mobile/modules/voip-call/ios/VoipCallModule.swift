import ExpoModulesCore

// JS side of CallCenter: the VoIP address and the call under way, answer / hang up, the device log, and the events
// (onVoipToken, onIncomingCall, onAnswerCall, onEndCall, onMute, onAudioSession).
public class VoipCallModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoipCall")

    Events("onVoipToken", "onIncomingCall", "onAnswerCall", "onEndCall", "onMute", "onAudioSession")

    // PushKit is normally started by the app delegate subscriber at launch; this is the belt to those braces.
    OnCreate {
      DispatchQueue.main.async {
        CallCenter.shared.start()
      }
    }

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

    Function("log") { () -> [String] in
      return CallCenter.shared.log()
    }

    Function("clearLog") {
      CallCenter.shared.clearLog()
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
