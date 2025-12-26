# -*- encoding: utf-8 -*-
# stub: cocoapods-try 1.2.0 ruby lib

Gem::Specification.new do |s|
  s.name = "cocoapods-try".freeze
  s.version = "1.2.0"

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.require_paths = ["lib".freeze]
  s.authors = ["Fabio Pelosin".freeze]
  s.date = "2020-04-20"
  s.homepage = "https://github.com/cocoapods/cocoapods-try".freeze
  s.licenses = ["MIT".freeze]
  s.rubygems_version = "3.0.3.1".freeze
  s.summary = "CocoaPods plugin which allows to quickly try the demo project of a Pod.".freeze

  s.installed_by_version = "3.0.3.1" if s.respond_to? :installed_by_version

  if s.respond_to? :specification_version then
    s.specification_version = 4

    if Gem::Version.new(Gem::VERSION) >= Gem::Version.new('1.2.0') then
      s.add_development_dependency(%q<bundler>.freeze, ["~> 1.3"])
      s.add_development_dependency(%q<rake>.freeze, ["~> 10.0"])
    else
      s.add_dependency(%q<bundler>.freeze, ["~> 1.3"])
      s.add_dependency(%q<rake>.freeze, ["~> 10.0"])
    end
  else
    s.add_dependency(%q<bundler>.freeze, ["~> 1.3"])
    s.add_dependency(%q<rake>.freeze, ["~> 10.0"])
  end
end
