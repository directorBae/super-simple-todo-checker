import ExpoModulesCore
import UIKit

// PushKit must be set up as the app launches — a VoIP push may be the reason it was launched, and the call has to be
// reported to CallKit from that very push.
public class VoipCallAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    CallCenter.shared.start()
    return true
  }
}
