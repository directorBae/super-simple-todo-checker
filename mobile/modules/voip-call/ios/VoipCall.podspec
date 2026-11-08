Pod::Spec.new do |s|
  s.name           = 'VoipCall'
  s.version        = '1.0.0'
  s.summary        = 'Dives as phone calls: CallKit + PushKit (VoIP push)'
  s.description    = 'Reports an incoming dive to CallKit the moment its VoIP push arrives, and hands answer / decline / mute on to JS.'
  s.author         = 'Work'
  s.homepage       = 'https://github.com/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'CallKit', 'PushKit', 'AVFoundation'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
