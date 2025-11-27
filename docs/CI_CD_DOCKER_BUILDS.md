# Automated Docker Image Builds with GitHub Actions

This document explains how to use the automated Docker image builds configured in the SparkyFitness CI/CD pipeline.

## Overview

The GitHub Actions workflow (`.github/workflows/docker-deploy.yml`) automatically builds and publishes Docker images for:
- **Frontend** (React + Nginx)
- **Backend/Server** (Node.js)
- **Garmin Microservice** (Python FastAPI)

Images are published to both **Docker Hub** and **GitHub Container Registry (GHCR)**.

## Triggers

The workflow builds images automatically when:

### 1. **Pushing to Specific Branches**
- `main` - Tagged as `main` and `latest`
- `dev` - Tagged as `dev`
- `claude/**` - Tagged with sanitized branch name (e.g., `claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw`)

### 2. **Publishing a GitHub Release**
- Tagged with the release version (e.g., `v1.2.3`) and `latest`

### 3. **Manual Trigger**
- Via GitHub Actions UI (workflow_dispatch)
- Tagged as `latest`

## Published Images

### Docker Hub (Public)
```
codewithcj/sparkyfitness:<tag>              # Frontend
codewithcj/sparkyfitness_server:<tag>       # Backend
codewithcj/sparkyfitness_garmin:<tag>       # Garmin Microservice
```

### GitHub Container Registry
```
ghcr.io/kraleo d/sparkyfitness-frontend:<tag>
ghcr.io/kraleod/sparkyfitness-server:<tag>
ghcr.io/kraleod/sparkyfitness-garmin:<tag>
```

## Image Tagging Strategy

| Trigger | Image Tag | Example |
|---------|-----------|---------|
| Push to `main` | `main`, `latest` | `codewithcj/sparkyfitness:main` |
| Push to `dev` | `dev` | `codewithcj/sparkyfitness:dev` |
| Push to `claude/fix-auth` | `claude-fix-auth` | `codewithcj/sparkyfitness:claude-fix-auth` |
| Release `v1.2.3` | `v1.2.3`, `latest` | `codewithcj/sparkyfitness:v1.2.3` |
| Manual workflow | `latest` | `codewithcj/sparkyfitness:latest` |

**Note**: Branch names are sanitized for Docker tags:
- Slashes (`/`) → hyphens (`-`)
- Special characters → hyphens
- Uppercase → lowercase

Example: `claude/authentik-proxy-auth-setup-011CV2EPrXqy243VYrWVG1Mw` → `claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw`

## Using Branch-Specific Images

### Method 1: Using `docker-compose.branch.yml`

This is the recommended approach for testing branch builds:

```bash
# 1. Set the image tag in your environment
export IMAGE_TAG=claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw

# 2. Pull and run the images
cd docker
docker-compose -f docker-compose.branch.yml pull
docker-compose -f docker-compose.branch.yml up -d

# 3. Check logs
docker-compose -f docker-compose.branch.yml logs -f
```

Or add to your `.env` file:
```env
IMAGE_TAG=claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw
```

Then run:
```bash
docker-compose -f docker/docker-compose.branch.yml up -d
```

### Method 2: Inline Override

For quick testing:

```bash
IMAGE_TAG=dev docker-compose -f docker/docker-compose.branch.yml up -d
```

### Method 3: Manual Docker Run

Pull specific images directly:

```bash
# Pull the images
docker pull codewithcj/sparkyfitness:claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw
docker pull codewithcj/sparkyfitness_server:claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw

# Tag them for easier use
docker tag codewithcj/sparkyfitness:claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw sparkyfitness:test
docker tag codewithcj/sparkyfitness_server:claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw sparkyfitness-server:test
```

## Workflow Details

### Build Process

1. **Checkout Code**: Pulls the repository at the specific commit/branch
2. **Determine Tags**: Calculates image tags based on trigger type
3. **Login to Registries**: Authenticates with Docker Hub and GHCR
4. **Setup Buildx**: Enables multi-platform builds (amd64, arm64)
5. **Build & Push**: Builds all 3 images in parallel and pushes to registries
6. **Attestations**: Generates provenance attestations for security

### Multi-Platform Support

All images are built for:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM 64-bit)

This enables running on various platforms including Raspberry Pi, AWS Graviton, etc.

### Build Optimizations

- **Paths Ignored**: Builds skip when only docs or markdown files change
- **Layer Caching**: Docker BuildKit caching speeds up subsequent builds
- **Parallel Builds**: All three images build simultaneously

## Monitoring Builds

### View Build Status

1. Go to your GitHub repository
2. Click **Actions** tab
3. Find the **Publish Docker images** workflow
4. Click on a specific run to see details

### Build Time

Typical build times:
- Frontend: ~3-5 minutes
- Backend: ~2-4 minutes
- Garmin: ~2-3 minutes
- **Total**: ~5-8 minutes (parallel)

### Notifications

Failed builds will:
- Show as ❌ in the Actions tab
- Send email notifications (if enabled in GitHub settings)
- Show in PR status checks (if applicable)

## Local Development vs CI/CD Images

### Development (Build Locally)

Use `docker-compose.dev.yml` to build from source:

```bash
docker-compose -f docker/docker-compose.dev.yml up --build
```

**Pros:**
- Immediate feedback
- No waiting for CI/CD
- Easier debugging

**Cons:**
- Slower builds on local machine
- Uses local resources

### Testing (Use CI/CD Images)

Use `docker-compose.branch.yml` to pull pre-built images:

```bash
IMAGE_TAG=claude-feature-branch docker-compose -f docker/docker-compose.branch.yml up -d
```

**Pros:**
- No local build time
- Multi-platform tested
- Mirrors production setup

**Cons:**
- Must wait for CI/CD to complete
- Requires pushing code first

### Production (Use Release Images)

Use `docker-compose.prod.yml` with tagged releases:

```bash
# Pull latest stable release
docker-compose -f docker/docker-compose.prod.yml pull
docker-compose -f docker/docker-compose.prod.yml up -d
```

## Troubleshooting

### Build Fails on GitHub Actions

**Check:**
1. **Workflow logs** in Actions tab for specific errors
2. **Dockerfile syntax** - ensure no breaking changes
3. **Dependencies** - check if npm/pip packages are available
4. **Secrets** - verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` are set

### Image Not Found After Push

**Possible causes:**
1. **Build still running** - Check Actions tab
2. **Branch name mismatch** - Remember sanitization rules
3. **Paths ignored** - Only changed docs/markdown files (build skipped)

**Solution:**
```bash
# Check if image exists
docker pull codewithcj/sparkyfitness:<your-tag>

# If not found, check Actions tab for build status
```

### Wrong Image Tag Used

**Verify your tag:**
```bash
# List all available tags on Docker Hub
curl -s https://hub.docker.com/v2/repositories/codewithcj/sparkyfitness/tags | jq -r '.results[].name'

# Or check on Docker Hub web UI
# https://hub.docker.com/r/codewithcj/sparkyfitness/tags
```

### Pull Rate Limiting (Docker Hub)

If you hit Docker Hub rate limits:

**Option 1**: Use GitHub Container Registry instead
```yaml
# In your compose file, change:
image: codewithcj/sparkyfitness:tag
# To:
image: ghcr.io/kraleod/sparkyfitness-frontend:tag
```

**Option 2**: Login to Docker Hub
```bash
docker login
# Enter your Docker Hub credentials
```

## Best Practices

### 1. **Use Specific Tags in Production**
```yaml
# ❌ Don't use 'latest' in production
image: codewithcj/sparkyfitness:latest

# ✅ Use specific version tags
image: codewithcj/sparkyfitness:v1.2.3
```

### 2. **Test Before Merging**
```bash
# Test your branch image before merging to main
IMAGE_TAG=claude-my-feature docker-compose -f docker/docker-compose.branch.yml up -d

# Verify it works, then merge
```

### 3. **Pin Dependencies**
- Lock npm/pip dependency versions in package files
- This ensures reproducible builds

### 4. **Monitor Build Size**
```bash
# Check image sizes
docker images | grep sparkyfitness

# Optimize Dockerfiles if images are too large
```

### 5. **Clean Up Old Images**
```bash
# Remove old local images
docker image prune -a --filter "until=720h"  # Older than 30 days

# Or manually remove specific tags
docker rmi codewithcj/sparkyfitness:old-branch-tag
```

## Example Workflow

### Scenario: Testing Authentication Fix

1. **Create feature branch and push**:
   ```bash
   git checkout -b claude/fix-auth
   # Make your changes
   git commit -am "Fix: Properly handle Authentik session expiration"
   git push -u origin claude/fix-auth
   ```

2. **Wait for CI/CD** (~5-8 minutes):
   - Watch GitHub Actions tab
   - Image will be tagged as `claude-fix-auth`

3. **Pull and test the image**:
   ```bash
   # On your server/testing environment
   export IMAGE_TAG=claude-fix-auth
   docker-compose -f docker/docker-compose.branch.yml pull
   docker-compose -f docker/docker-compose.branch.yml up -d
   ```

4. **Verify the fix works**:
   ```bash
   # Check logs
   docker-compose -f docker/docker-compose.branch.yml logs -f sparkyfitness-frontend

   # Test in browser
   # Navigate to your app and test the authentication flow
   ```

5. **If good, merge to main**:
   ```bash
   git checkout main
   git merge claude/fix-auth
   git push origin main
   ```

6. **Main branch builds automatically**:
   - New images tagged as `main` and `latest`
   - Deploy to production with `latest` tag

## GitHub Actions Secrets Required

For the workflow to work, these secrets must be set in your GitHub repository:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `DOCKER_USERNAME` | Docker Hub username | Your Docker Hub account username |
| `DOCKER_PASSWORD` | Docker Hub access token | Generate at hub.docker.com → Account Settings → Security → New Access Token |
| `GITHUB_TOKEN` | GitHub token | Automatically provided by GitHub Actions |

### Setting Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click **New repository secret**
4. Add `DOCKER_USERNAME` and `DOCKER_PASSWORD`

## Advanced: Using GHCR Instead of Docker Hub

GitHub Container Registry has no pull rate limits for public images:

```yaml
# In docker-compose.branch.yml, change:
services:
  sparkyfitness-frontend:
    image: ghcr.io/kraleod/sparkyfitness-frontend:${IMAGE_TAG:-latest}

  sparkyfitness-server:
    image: ghcr.io/kraleod/sparkyfitness-server:${IMAGE_TAG:-latest}
```

**Note**: GHCR requires authentication for private repos:
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

## Related Documentation

- [Authentik Nginx Configuration](./AUTHENTIK_NGINX_CONFIG.md)
- [Docker Deployment Guide](../docker/README.md) (if exists)
- [GitHub Actions Workflows](../.github/workflows/)

---

Last updated: 2025-11-11
