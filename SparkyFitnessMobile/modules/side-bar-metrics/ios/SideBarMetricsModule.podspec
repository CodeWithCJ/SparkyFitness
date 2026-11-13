Pod::Spec.new do |s|
  s.name           = 'SideBarMetricsModule'
  s.version        = '1.0.0'
  s.summary        = 'Measures the iPhone Duo side bar column against the Add button.'
  s.author         = 'SparkyFitness'
  s.homepage       = 'https://github.com/CodeWithCJ/SparkyFitness'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.license        = 'MIT'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
