Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Мост к ActivityKit: таймер на экране блокировки'
  s.description    = 'Локальный модуль Prizma. Запускает, обновляет и гасит живую активность.'
  s.author         = 'Prizma'
  s.homepage       = 'https://github.com/asset/prizma'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
