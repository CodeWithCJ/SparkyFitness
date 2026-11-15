# Client Certificates (mTLS)

If you expose SparkyFitness to the internet, you can tell your reverse proxy to accept only devices that hold a certificate you issued. This is called mutual TLS, or mTLS. Anyone without the certificate cannot reach the login page at all.

The mobile app can hold one client certificate and present it to your server. Nothing changes in SparkyFitness itself: your reverse proxy does the checking.

::: warning Experimental
Client certificate support is new and has been tested on a few setups only: an Android phone and emulator, an iPhone, a Mac browser, and a proxy built on nginx (Nginx Proxy Manager). On those, importing the certificate, signing in with a password, SSO and a passkey were checked. Home screen widgets, Siri shortcuts, medication reminder buttons, the Android water tile and the watch apps are not yet tested with a certificate. It may not work with every proxy or phone. If something fails, remove the certificate in the app and report the problem on GitHub.
:::

::: tip Do you need this?
Most people do not. A VPN such as Tailscale or WireGuard, or [proxy headers](/mobile-app/proxy-setup) for Cloudflare Access and similar services, are simpler. Use a client certificate when you want the server reachable from the internet without a VPN, and locked to your own devices.
:::

## Overview

1. Create a certificate authority (CA) and a client certificate, once, on any computer.
2. Tell your reverse proxy to require a certificate signed by that CA.
3. Import the certificate into the mobile app, and into the browser you use for the web app.

## 1. Create the certificate

Run these on a computer with OpenSSL. They create a CA that is valid for ten years and one client certificate that is valid for about two years.

```bash
# The certificate authority. Keep client-ca.key private and backed up.
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout client-ca.key -out client-ca.pem -subj "/CN=SparkyFitness Client CA"

# A key and a signing request for one device.
openssl req -newkey rsa:2048 -nodes \
  -keyout phone.key -out phone.csr -subj "/CN=my-phone"

# Sign it with the CA.
openssl x509 -req -in phone.csr -CA client-ca.pem -CAkey client-ca.key \
  -CAcreateserial -out phone.pem -days 825 -sha256

# Bundle the key and certificate into one password-protected file.
openssl pkcs12 -export -inkey phone.key -in phone.pem -out phone.p12
```

The last command asks for a password. You type it once more when you import the file.

::: tip If an import says the file could not be read
OpenSSL 3 writes `.p12` files in a newer format (AES) by default, and that is the one to try first. A recent Android phone (Android 17) imported it without trouble. Some older phones and computers cannot read it. If an import says "This file could not be read", run the last command again with `-legacy` added and import that file instead:

```bash
openssl pkcs12 -export -legacy -inkey phone.key -in phone.pem -out phone-legacy.p12
```

Either file is fine, so use whichever your devices accept. The older format also imported correctly on the Android phone, the iPhone and the Mac browser used for testing. If your OpenSSL reports `unknown option '-legacy'` (the one built into macOS does), remove the option: that version already writes the older format.
:::

You end up with two files that matter:

- `client-ca.pem` goes to the reverse proxy.
- `phone.p12` goes to your phone and your browser.

You can make one certificate per device (repeat the last three commands with another name) or use the same file on all of them. One per device lets you replace a lost phone's certificate without touching the others.

## 2. Require it at the reverse proxy

Require the certificate for the **whole hostname**, not for some paths only. Per-path rules are unreliable with current TLS versions.

### Caddy

```
fit.example.com {
    tls {
        client_auth {
            mode require_and_verify
            trust_pool file /etc/caddy/client-ca.pem
        }
    }
    reverse_proxy sparkyfitness-frontend:80
}
```

Caddy versions before 2.8 use `trusted_ca_cert_file /etc/caddy/client-ca.pem` in place of the `trust_pool` line.

### Traefik

In the dynamic configuration file:

```yaml
tls:
  options:
    mtls:
      clientAuth:
        caFiles:
          - /certs/client-ca.pem
        clientAuthType: RequireAndVerifyClientCert
```

Then attach the option to the router, for example with the label `traefik.http.routers.sparkyfitness.tls.options=mtls@file`.

### nginx

Inside the `server` block that serves SparkyFitness over HTTPS:

```nginx
ssl_client_certificate /etc/nginx/client-ca.pem;
ssl_verify_client on;
```

### Nginx Proxy Manager

Nginx Proxy Manager has no screen for client certificates, and it runs in a container, so the file has to be mapped into it:

1. Put `client-ca.pem` in a folder on the server, for example `/home/you/nginx-mtls/`. A new folder next to NPM's own is simplest, because NPM's `data` folder is often owned by root.
2. Add the folder to the container's volumes (in your compose file or Portainer stack), then update the stack. This recreates the container, so your proxied sites are offline for a few seconds:

   ```yaml
   volumes:
     - /home/you/nginx-mtls:/mtls:ro
   ```

3. Open the proxy host (**Hosts, Proxy Hosts**, edit), go to its **Advanced** tab, and add the two nginx lines with the path as the container sees it:

   ```nginx
   ssl_client_certificate /mtls/client-ca.pem;
   ssl_verify_client on;
   ```

Your existing Let's Encrypt certificate and the host's other settings are not affected: the first line only says which CA to trust for the *phone's* certificate.

### Cloudflare

When traffic goes through Cloudflare (the proxied "orange cloud" or a Cloudflare Tunnel), Cloudflare ends the connection, so a certificate from your own CA never reaches your server. Create the client certificate in the Cloudflare dashboard instead and add a rule that requires it. See Cloudflare's [client certificates](https://developers.cloudflare.com/ssl/client-certificates/) documentation, then import the `.p12` you make from it as described below.

Cloudflare Access login pages are a different feature. The app passes those with a service token sent as [proxy headers](/mobile-app/proxy-setup). A certificate and proxy headers can be used together.

## 3. Import it into the mobile app

Get `phone.p12` onto the phone (AirDrop, a file sync app, or a USB cable; avoid email).

::: tip iPhone: getting the file into the app
iPhone treats a `.p12` file it receives as a profile to install, so the app's file picker may not be able to reach it. Make a copy with a plain extension and save that one to the Files app:

```bash
cp phone.p12 phone-for-app.bin
```

Send `phone-for-app.bin` to the iPhone (AirDrop works), choose **Save to Files**, and pick it from there in the app. It is the same certificate under another name. The original `phone.p12` is still the one to install as a profile for Safari, as described under [SSO or a passkey](#signing-in-with-sso-or-a-passkey).
:::

1. In the app, open the place where you enter the server address:
   - first launch: the welcome screen, under **Advanced options**;
   - later: **Settings**, your server, **Advanced options**.
2. Tap **Import certificate** and choose the `.p12` file.
3. Type the file's password and tap **Import**.
4. Connect as usual.

The certificate section sits under **Advanced options**, next to Proxy Headers:

![The Client certificate section in the server settings, with the Import certificate button](/mtls-server-settings.png)

The app shows the certificate's name and, where the phone can read it, its expiry date. **Replace certificate** imports a new one; **Remove** deletes it from the app.

![An imported certificate on the first-run screen, showing its name and expiry date with Replace certificate and Remove buttons](/mtls-certificate-imported.png)

Good to know:

- The app keeps one certificate. It is presented only to servers you have saved in the app, never to other sites the app loads images from.
- The private key is stored in the phone's protected key storage (Android Keystore, iOS Keychain). The password is not stored.
- Everything that talks to your server uses it: the app, background sync, the home screen widgets, Siri and Shortcuts actions, medication reminder buttons, the Android water tile, and the watch apps (they relay through the phone).
- Delete `phone.p12` from the phone's Downloads or Files folder after importing.
- The certificate stays on the phone until you tap **Remove**. Signing out or deleting a server does not remove it.

### Signing in with SSO or a passkey

These two sign-in methods open the phone's browser, and the browser cannot see a certificate that is held inside the app. The browser has to hold its own copy, so for SSO and passkeys you import the same `.p12` a second time, into the phone's settings:

- **Android:** Settings, Security & privacy, More security & privacy, Encryption & credentials, **Install a certificate**, then **VPN & app user certificate** (not "CA certificate" and not "Wi-Fi certificate"). Choose the `.p12`, type its password and give it a simple name. Android asks you to set a screen lock first if you have none. When the sign-in page opens, Chrome asks which certificate to use: pick the one you installed.
- **iPhone:** send the `.p12` to the phone (AirDrop works), then open **Settings, General, VPN & Device Management**, tap the downloaded profile, tap **Install** and enter the password. Safari offers the certificate when the sign-in page asks for it. **Use Safari:** other iPhone browsers such as Chrome and Firefox do not offer client certificates, so they show "No required SSL certificate was sent" even when the profile is installed. The app's own SSO and passkey sign-in opens Safari's sign-in sheet, so it works without you doing anything in a browser.

Then sign in as usual. Tap the SSO button or **Sign in with Passkey**; the browser opens, asks which certificate to use (pick the one you installed), and then shows your single sign-on provider or the passkey prompt. When it finishes, the browser returns to the app. To add a passkey for the first time, sign in another way and use **Settings, Passkeys**: that also opens the browser and asks for the certificate.

This second copy is only for the browser step. The app uses its own copy for everything else, so both must be present, and replacing one does not replace the other.

Email and password sign-in and API keys need only the app's copy. On a work-managed or child-supervised phone that does not allow installing certificates, use one of those. Your single sign-on provider's own address is a separate site: only the address you protect with the certificate needs it.

## 4. Import it into your browser

The proxy now asks the web app for the certificate too. Import the same `.p12` into the computer's certificate store (Keychain Access on macOS, the certificate manager on Windows) or into the browser's own certificate settings (Firefox). The browser then offers it when you open your SparkyFitness address.

## Troubleshooting

**The app says it could not reach the server.** A proxy that requires a certificate refuses the connection when none is presented (nginx answers "400 No required SSL certificate was sent"), which the app cannot tell apart from an unreachable server. Check that a certificate is shown under Advanced options, and that the server address in the app has the same hostname the proxy requires the certificate for.

**The server's own certificate is from a private CA.** That is separate from the client certificate. The phone must also trust the CA that signed the *server's* certificate: on Android install that CA under Settings, Security, Encryption & credentials, Install a certificate, CA certificate; on iPhone install it as a profile and then switch it on under Settings, General, About, Certificate Trust Settings. A certificate from a public CA such as Let's Encrypt needs none of this.

**"That password does not open this file."** The password is wrong. Type it again; it is the one you chose in the last command of step 1.

**"This file could not be read."** The file is not a `.p12`/`.pfx`, is damaged, or was made in a format this device cannot read. Make the other format: add `-legacy` if you used the default, or leave it out if you used `-legacy` (see step 1).

**"This file has a certificate but no private key."** Export it again from the key and the certificate together, as in the last command of step 1.

**It worked and then stopped.** The certificate may have expired. Create a new one (the last three commands of step 1) and use **Replace certificate**. You do not need to change the proxy as long as the CA is the same.

**On iPhone, Chrome or Firefox shows "No required SSL certificate was sent", but Safari works.** Only Safari can use the certificate on iPhone. Open the web app in Safari.

**SSO or passkey sign-in fails, everything else works.** See [Signing in with SSO or a passkey](#signing-in-with-sso-or-a-passkey).

**On iPhone, the server still says "no certificate was sent" right after importing.** iPhone keeps secure sessions it opened before the import and can reuse them, so the server keeps its old answer. Fully close the app (swipe it away) and open it again, then connect. The app shows a reminder after importing. The same applies the other way after removing a certificate.

**After removing or replacing the certificate, the app is still connected.** On Android the change applies to the next request. On iPhone an open secure connection can keep working briefly, so close and reopen the app to apply it immediately. Removing the certificate from the app does not remove the copy you installed in the phone's settings for SSO and passkeys; delete that one there.

## Limits

- On iPhone, only Safari can use the certificate. Chrome, Firefox and other iPhone browsers cannot, so open the web app in Safari. (The mobile app is not affected.)
- One certificate for the whole app. Two servers that each require a different certificate cannot both be used.
- The certificate chain must be signed directly by the CA the proxy trusts. Intermediate certificates inside the `.p12` are not sent by the iPhone app.
- A server address with non-English letters in its hostname (an internationalized domain) may not be matched. Enter it in its `xn--` form.
