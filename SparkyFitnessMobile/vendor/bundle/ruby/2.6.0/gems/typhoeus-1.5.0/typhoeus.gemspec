# encoding: utf-8
lib = File.expand_path('../lib/', __FILE__)
$:.unshift lib unless $:.include?(lib)

require 'typhoeus/version'

Gem::Specification.new do |s|
  s.name         = "typhoeus"
  s.version      = Typhoeus::VERSION
  s.platform     = Gem::Platform::RUBY
  s.authors      = ["David Balatero", "Paul Dix", "Hans Hasselberg"]
  s.email        = ["hans.hasselberg@gmail.com"]
  s.homepage     = "https://github.com/typhoeus/typhoeus"
  s.summary      = "Parallel HTTP library on top of libcurl multi."
  s.description  = %q{Like a modern code version of the mythical beast with 100 serpent heads, Typhoeus runs HTTP requests in parallel while cleanly encapsulating handling logic.}

  s.required_ruby_version = ">= 2.6"
  s.license = 'MIT'
  s.metadata = {
    'bug_tracker_uri'       => 'https://github.com/typhoeus/typhoeus/issues',
    'changelog_uri'         => "https://github.com/typhoeus/typhoeus/blob/v#{s.version}/CHANGELOG.md",
    'documentation_uri'     => "https://www.rubydoc.info/gems/typhoeus/#{s.version}",
    'rubygems_mfa_required' => 'true',
    'source_code_uri'       => "https://github.com/typhoeus/typhoeus/tree/v#{s.version}"
  }

  s.add_dependency('ethon', [">= 0.9.0", "< 0.16.0"])

  s.files = Dir.chdir(__dir__) do
    `git ls-files -z`.split("\x0").reject do |file|
      file.start_with?(*%w[. Gemfile Guardfile Rakefile perf spec])
    end
  end
  s.require_path = 'lib'
end
