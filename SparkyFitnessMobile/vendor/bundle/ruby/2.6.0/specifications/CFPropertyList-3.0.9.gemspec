# -*- encoding: utf-8 -*-
# stub: CFPropertyList 3.0.9 ruby lib

Gem::Specification.new do |s|
  s.name = "CFPropertyList".freeze
  s.version = "3.0.9"

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.require_paths = ["lib".freeze]
  s.authors = ["Christian Kruse".freeze]
  s.date = "2025-11-18"
  s.description = "This is a module to read, write and manipulate both binary and XML property lists as defined by apple.".freeze
  s.email = "cjk@defunct.ch".freeze
  s.extra_rdoc_files = ["README.rdoc".freeze]
  s.files = ["README.rdoc".freeze]
  s.homepage = "https://github.com/ckruse/CFPropertyList".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new("< 3.2".freeze)
  s.rubygems_version = "3.0.3.1".freeze
  s.summary = "Read, write and manipulate both binary and XML property lists as defined by apple".freeze

  s.installed_by_version = "3.0.3.1" if s.respond_to? :installed_by_version

  if s.respond_to? :specification_version then
    s.specification_version = 4

    if Gem::Version.new(Gem::VERSION) >= Gem::Version.new('1.2.0') then
      s.add_development_dependency(%q<libxml-ruby>.freeze, [">= 0"])
      s.add_development_dependency(%q<minitest>.freeze, [">= 0"])
      s.add_development_dependency(%q<nokogiri>.freeze, [">= 0"])
      s.add_development_dependency(%q<rake>.freeze, [">= 0.7.0"])
    else
      s.add_dependency(%q<libxml-ruby>.freeze, [">= 0"])
      s.add_dependency(%q<minitest>.freeze, [">= 0"])
      s.add_dependency(%q<nokogiri>.freeze, [">= 0"])
      s.add_dependency(%q<rake>.freeze, [">= 0.7.0"])
    end
  else
    s.add_dependency(%q<libxml-ruby>.freeze, [">= 0"])
    s.add_dependency(%q<minitest>.freeze, [">= 0"])
    s.add_dependency(%q<nokogiri>.freeze, [">= 0"])
    s.add_dependency(%q<rake>.freeze, [">= 0.7.0"])
  end
end
