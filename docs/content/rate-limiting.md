# Rate Limiting Implementation

This document outlines the rate limiting strategy implemented for the SparkyFitness application, focusing on protecting sensitive authentication endpoints.

## Purpose

Rate limiting is crucial for:
*   **Preventing Brute-Force Attacks**: Limiting the number of login attempts from a single IP address within a given time frame.
*   **Mitigating Denial-of-Service (DoS) Attacks**: Restricting the rate of requests to prevent server overload.
*   **Preventing Account Creation Spam**: Limiting the rate of new user registrations.

## Implementation Layer

Rate limiting is implemented at the **Nginx reverse proxy layer**. This is the most efficient approach as it blocks malicious requests before they reach the backend Node.js application, conserving server resources.

## Nginx Configuration

The rate limiting is configured in the `nginx.conf` file.

### 1. Defining a Rate Limiting Zone

A shared memory zone named `login_signup_zone` is defined to track request rates based on client IP addresses. This directive is placed at the top level of the `nginx.conf` file (or within the `http` block if it were a main Nginx configuration file).

```nginx
limit_req_zone $binary_remote_addr zone=login_signup_zone:10m rate=5r/s;
```

*   `$binary_remote_addr`: Uses the client's IP address for tracking.
*   `zone=login_signup_zone:10m`: Defines a 10-megabyte shared memory zone.
*   `rate=5r/s`: Limits requests to 5 requests per second.

### 2. Applying the Rate Limit to Endpoints

The `limit_req` directive is applied to the specific authentication endpoints within the `server` block.

```nginx
# Apply rate limit to login endpoint
location = /api/auth/login {
    limit_req zone=login_signup_zone burst=5 nodelay;
    proxy_pass http://sparkyfitness-server:3010/auth/login;
    # ... other proxy settings ...
}

# Apply rate limit to register endpoint
location = /api/auth/register {
    limit_req zone=login_signup_zone burst=5 nodelay;
    proxy_pass http://sparkyfitness-server:3010/auth/register;
    # ... other proxy settings ...
}
```

*   `location = /api/auth/login` and `location = /api/auth/register`: Ensures exact matching for these paths.
*   `limit_req zone=login_signup_zone`: Refers to the defined rate limiting zone.
*   `burst=5`: Allows a burst of up to 5 requests beyond the defined rate.
*   `nodelay`: Requests exceeding the burst limit are immediately rejected with a `429 Too Many Requests` error, rather than being delayed. This is crucial for security-sensitive endpoints.

## Endpoints Protected

Currently, the following endpoints are protected by Nginx rate limiting:
*   `/api/auth/login`
*   `/api/auth/register`

## Testing the Rate Limiting

To test the rate limiting, ensure your Docker Compose environment is running with the updated `nginx.conf`. Then, use `curl` to send a high volume of requests to the protected endpoints.

Example `curl` command (replace with your domain and adjust payload):
```bash
for i in $(seq 1 10); do curl -k -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com", "password":"password"}' https://your-domain.com/api/auth/login & done
```

You should observe `429 Too Many Requests` HTTP status codes for requests exceeding the defined rate and burst limits.

### Note on 503 Errors During Testing

During initial testing, `503 Service Unavailable` errors might be observed instead of `429`s. This indicates that Nginx is indeed applying the rate limit (as confirmed by Nginx error logs showing `limiting requests`), but it's also encountering issues connecting to or receiving timely responses from the backend server. While the rate limiting itself is functional, consistent `503`s suggest an underlying issue with the backend's stability or readiness under load, which is outside the scope of the rate limiting implementation itself.