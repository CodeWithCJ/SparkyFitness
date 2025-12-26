require "openssl"

def build_ca
  root_key = OpenSSL::PKey::RSA.new 2048 # the CA's public/private key
  root_ca = OpenSSL::X509::Certificate.new
  root_ca.version = 2 # cf. RFC 5280 - to make it a "v3" certificate
  root_ca.serial = 1
  root_ca.subject = OpenSSL::X509::Name.parse "C=JP,O=JIN.GR.JP,OU=RRR,CN=CA"
  root_ca.issuer = root_ca.subject # root CA's are "self-signed"
  root_ca.public_key = root_key.public_key
  root_ca.not_before = Time.now
  root_ca.not_after = root_ca.not_before + 10 * 365 * 24 * 60 * 60 # 10 years validity
  ef = OpenSSL::X509::ExtensionFactory.new
  ef.subject_certificate = root_ca
  ef.issuer_certificate = root_ca
  root_ca.add_extension(ef.create_extension("basicConstraints","CA:TRUE",true))
  root_ca.add_extension(ef.create_extension("keyUsage","keyCertSign, cRLSign", true))
  root_ca.add_extension(ef.create_extension("subjectKeyIdentifier","hash",false))
  root_ca.add_extension(ef.create_extension("authorityKeyIdentifier","keyid:always",false))
  root_ca.sign(root_key, OpenSSL::Digest::SHA256.new)
  [root_key, root_ca]
end

root_key, root_ca = build_ca

File.write("test/ca.cert", root_ca.to_s)
File.write("test/ca.key", root_key.to_s)

def sub_cert(root_key, root_ca, cn, intermediate: false)
  key = OpenSSL::PKey::RSA.new 2048
  cert = OpenSSL::X509::Certificate.new
  cert.version = 2
  cert.serial = 2
  cert.subject = OpenSSL::X509::Name.parse "C=JP,O=JIN.GR.JP,OU=RRR,CN=#{cn}"
  cert.issuer = root_ca.subject # root CA is the issuer
  cert.public_key = key.public_key
  cert.not_before = Time.now
  cert.not_after = cert.not_before + 9 * 365 * 24 * 60 * 60 # 9 years validity
  ef = OpenSSL::X509::ExtensionFactory.new
  ef.subject_certificate = cert
  ef.issuer_certificate = root_ca
  cert.add_extension(ef.create_extension("subjectKeyIdentifier","hash",false))
  if intermediate
    cert.add_extension(ef.create_extension("keyUsage","keyCertSign, cRLSign", true))
    cert.add_extension(ef.create_extension("basicConstraints","CA:TRUE",true))
  else
    cert.add_extension(ef.create_extension("keyUsage","digitalSignature, keyEncipherment", true))
    cert.add_extension(ef.create_extension("extendedKeyUsage", "serverAuth"))
  end
  cert.sign(root_key, OpenSSL::Digest::SHA256.new)
  [key, cert]
end

sub_key, sub_cert = sub_cert(root_key, root_ca, "SubCA", intermediate: true)
File.write("test/subca.cert", sub_cert.to_s)
File.write("test/subca.key", sub_key.to_s)

server_key, server_cert = sub_cert(sub_key, sub_cert, "localhost")
File.write("test/server.cert", server_cert.to_s)
File.write("test/server.key", server_key.to_s)

client_key, client_cert = sub_cert(root_key, root_ca, "localhost")
File.write("test/client.cert", client_cert.to_s)
File.write("test/client.key", client_key.to_s)

system(
  "openssl", "rsa", "-aes256",
  "-in", "test/client.key",
  "-out", "test/client-pass.key",
  "-passout", "pass:pass4key",
)

File.write("test/ca-chain.pem", root_ca.to_s + sub_cert.to_s)

verify_key = OpenSSL::PKey::RSA.new 2048
File.write("test/fixtures/verify.key", verify_key.to_s)

def build_self_signed(key, cn)
  cert = OpenSSL::X509::Certificate.new
  cert.version = 2
  cert.serial = 2
  cert.subject = OpenSSL::X509::Name.parse "C=JP,O=JIN.GR.JP,OU=RRR,CN=#{cn}"
  cert.issuer = cert.subject
  cert.public_key = key.public_key
  cert.not_before = Time.now
  cert.not_after = cert.not_before + 9 * 365 * 24 * 60 * 60 # 9 years validity
  ef = OpenSSL::X509::ExtensionFactory.new
  ef.subject_certificate = cert
  ef.issuer_certificate = cert
  cert.add_extension(ef.create_extension("subjectKeyIdentifier","hash",false))
  cert.add_extension(ef.create_extension("keyUsage","digitalSignature, keyEncipherment", true))
  cert.add_extension(ef.create_extension("extendedKeyUsage", "serverAuth"))
  cert.sign(key, OpenSSL::Digest::SHA256.new)
  cert
end

File.write("test/fixtures/verify.localhost.cert", build_self_signed(verify_key, "localhost").to_s)
File.write("test/fixtures/verify.foo.cert", build_self_signed(verify_key, "foo").to_s)
File.write("test/fixtures/verify.alt.cert", build_self_signed(verify_key, "alt").to_s)
