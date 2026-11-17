Pod::Spec.new do |s|
  s.name           = 'BackgroundWaterModule'
  s.version        = '1.0.0'
  s.summary        = 'Keeps the copy of the login the Log water shortcut uses.'
  s.author         = 'SparkyFitness'
  s.homepage       = 'https://github.com/CodeWithCJ/SparkyFitness'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.license        = 'MIT'

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
