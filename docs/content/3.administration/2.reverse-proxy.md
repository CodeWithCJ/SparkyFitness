# Reverse Proxy

This page will provide details on configuring a reverse proxy for SparkyFitness.

If using a proxy like Nginx Proxy Manager, ensure the following headers are configured:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
add_header X-Content-Type-Options "nosniff";
proxy_set_header X-Forwarded-Ssl on;
```

This sample can be found under [sample](https://github.com/CodeWithCJ/SparkyFitness/wiki/Sample-Setup)

If you want to rely on docker networking instead, choose the scheme ```http```, enter the container name ```sparkyfitness-frontend```
and port ```80```.Note: In order for docker networking to work, the Nginx Proxy Manager network has to be connected to the ```sparkyfitness-frontend``` container. You can find the name of your networks using ```docker network ls```, find the container name using ```docker container ls``` and connect them using ```docker network connect network container```.

## Running behind Cloudflare Tunnel + Cloudflare Access

SparkyFitness has its own login, so Cloudflare Access simply adds an extra authentication layer in front of the app. A few settings keep the two working together smoothly:

1. **Set a generous Access session duration.** In your Cloudflare Access application settings, increase "Session Duration" (e.g. to 1 week or 1 month). In a browser, Access always uses its interactive login redirect the first time and after this duration expires — that's expected and can't be skipped for browser traffic. A longer duration just makes it infrequent.
2. **For the mobile app or any other non-browser client** (scripts, monitoring, backend integrations) that calls the API directly without a browser to complete Access's login redirect, create a Cloudflare Access **service token** and have the client send `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers with the token's values on every request. This does not apply to Chrome or other browsers — service tokens are for clients that can attach fixed headers, which an interactive browser session cannot do.
3. **If your frontend and backend are on different hostnames** (a split-origin setup, not the default single-container deployment), set `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS` on the server to the public frontend hostname so the backend's CORS check accepts it — see [Environment Variables](/install/environment-variables). The frontend's nginx also sends `Access-Control-Allow-Origin` for `manifest.json` and `/locales/*` based on `SPARKY_FITNESS_FRONTEND_URL`.
