Pod::Spec.new do |s|
  s.name           = 'AppleHeartZonesModule'
  s.version        = '1.0.0'
  s.summary        = 'Reads the heart rate zones configured in Apple Health.'
  s.author         = 'SparkyFitness'
  s.homepage       = 'https://github.com/CodeWithCJ/SparkyFitness'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.license        = 'MIT'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
