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