# -*- encoding: utf-8 -*-
# stub: typhoeus 1.5.0 ruby lib

Gem::Specification.new do |s|
  s.name = "typhoeus".freeze
  s.version = "1.5.0"

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "bug_tracker_uri" => "https://github.com/typhoeus/typhoeus/issues", "changelog_uri" => "https://github.com/typhoeus/typhoeus/blob/v1.5.0/CHANGELOG.md", "documentation_uri" => "https://www.rubydoc.info/gems/typhoeus/1.5.0", "rubygems_mfa_required" => "true", "source_code_uri" => "https://github.com/typhoeus/typhoeus/tree/v1.5.0" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["David Balatero".freeze, "Paul Dix".freeze, "Hans Hasselberg".freeze]
  s.date = "1980-01-02"
  s.description = "Like a modern code version of the mythical beast with 100 serpent heads, Typhoeus runs HTTP requests in parallel while cleanly encapsulating handling logic.".freeze
  s.email = ["hans.hasselberg@gmail.com".freeze]
  s.homepage = "https://github.com/typhoeus/typhoeus".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 2.6".freeze)
  s.rubygems_version = "3.0.3.1".freeze
  s.summary = "Parallel HTTP library on top of libcurl multi.".freeze

  s.installed_by_version = "3.0.3.1" if s.respond_to? :installed_by_version

  if s.respond_to? :specification_version then
    s.specification_version = 4

    if Gem::Version.new(Gem::VERSION) >= Gem::Version.new('1.2.0') then
      s.add_runtime_dependency(%q<ethon>.freeze, [">= 0.9.0", "< 0.16.0"])
    else
      s.add_dependency(%q<ethon>.freeze, [">= 0.9.0", "< 0.16.0"])
    end
  else
    s.add_dependency(%q<ethon>.freeze, [">= 0.9.0", "< 0.16.0"])
  end
end
