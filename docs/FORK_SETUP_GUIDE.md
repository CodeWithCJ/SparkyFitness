# Fork Setup Guide - Building Your Own Images

This guide walks you through setting up your forked SparkyFitness repository to build and deploy your own Docker images.

## Prerequisites

- Forked SparkyFitness repository on GitHub
- Docker Hub account (or use GitHub Container Registry only)
- Access to your GitHub repository settings

---

## Step 1: Create Docker Hub Account (Optional but Recommended)

### Why Docker Hub?
- Public images (unlimited pulls for public repos)
- Easy to share
- No authentication needed for pulling public images
- Works well with docker-compose

### Alternative: GHCR Only
If you prefer GitHub Container Registry only, you can skip Docker Hub and just use `ghcr.io` images (see Advanced section below).

### Create Docker Hub Account

1. **Sign up**: https://hub.docker.com/signup
2. **Verify email**: Check your inbox and verify your account
3. **Remember your username**: You'll need this later

### Create Access Token

1. Login to Docker Hub
2. Click your **profile icon** → **Account Settings**
3. Navigate to **Security** tab
4. Click **New Access Token**
5. Fill in:
   - **Description**: `github-actions-sparkyfitness`
   - **Access permissions**: **Read, Write, Delete**
6. Click **Generate**
7. **COPY THE TOKEN** immediately (you won't see it again!)

**Example token format:**
```
dckr_pat_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
```

---

## Step 2: Configure GitHub Secrets

### Add secrets to your forked repository:

1. Go to your fork on GitHub:
   ```
   https://github.com/YOUR_USERNAME/SparkyFitness
   ```

2. Click **Settings** (top menu)

3. In left sidebar: **Secrets and variables** → **Actions**

4. Click **New repository secret**

5. Add **TWO** secrets:

#### Secret 1: DOCKER_USERNAME
```
Name: DOCKER_USERNAME
Secret: your-dockerhub-username
```
Example: If your Docker Hub username is `john123`, enter exactly: `john123`

#### Secret 2: DOCKER_PASSWORD
```
Name: DOCKER_PASSWORD
Secret: dckr_pat_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
```
(Paste the access token you copied earlier)

### Verify Secrets Are Set

You should see two secrets listed:
- ✅ DOCKER_USERNAME
- ✅ DOCKER_PASSWORD

**Note:** You won't be able to view the secret values after saving (this is normal security behavior).

---

## Step 3: Update Environment Configuration

The workflow and docker-compose files are now configured to use your Docker Hub username automatically via the `DOCKER_USERNAME` environment variable.

### For Local Deployment

Create or update your `docker/.env` file:

```bash
# Your Docker Hub username
DOCKER_USERNAME=your-dockerhub-username

# Database credentials
SPARKY_FITNESS_DB_NAME=sparkyfitness
SPARKY_FITNESS_DB_USER=sparky
SPARKY_FITNESS_DB_PASSWORD=your-secure-password-here
SPARKY_FITNESS_APP_DB_USER=sparkyapp
SPARKY_FITNESS_APP_DB_PASSWORD=your-app-db-password-here

# Encryption keys (generate new ones!)
SPARKY_FITNESS_API_ENCRYPTION_KEY=your-64-char-hex-key-here
JWT_SECRET=your-64-char-hex-jwt-secret-here

# Frontend URL
SPARKY_FITNESS_FRONTEND_URL=https://your-domain.com

# Optional: Admin email
SPARKY_FITNESS_ADMIN_EMAIL=admin@yourdomain.com
```

### Generate Secure Keys

Use these commands to generate secure encryption keys:

```bash
# Generate API encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 4: Trigger Image Build

You now have **three ways** to build images:

### Option A: Push to Branch (Automatic) ✅ **Recommended**

With the updated workflow, pushing to specific branches automatically triggers builds:

```bash
# Push to your branch (e.g., claude/*)
git push origin claude/authentik-proxy-auth-setup-011CV2EPrXqy243VYrWVG1Mw

# Or push to main/dev
git push origin main
```

**Image tags created:**
- Branch `claude/fix-auth` → Image tag: `claude-fix-auth`
- Branch `main` → Image tags: `main` + `latest`
- Branch `dev` → Image tag: `dev`

**Build time:** ~5-8 minutes

### Option B: Manual Workflow Trigger

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Select **"Publish Docker images"** workflow
4. Click **"Run workflow"** button
5. Select branch (default: main)
6. Click green **"Run workflow"** button

**Image tags created:** `latest`

**Build time:** ~5-8 minutes

### Option C: Create a GitHub Release

1. Go to your repository
2. Click **Releases** → **Draft a new release**
3. Create a new tag (e.g., `v1.0.0`)
4. Fill in release title and description
5. Click **Publish release**

**Image tags created:** `v1.0.0` + `latest`

**Build time:** ~5-8 minutes

---

## Step 5: Monitor Build Progress

### View Workflow Run

1. Go to **Actions** tab in your repository
2. Click on the running workflow (yellow dot = in progress)
3. Click on the job to see detailed logs
4. Wait for green checkmark ✅

### Build Status Indicators

| Icon | Status | Meaning |
|------|--------|---------|
| 🟡 | In Progress | Build is running (~5-8 min) |
| ✅ | Success | Images published successfully |
| ❌ | Failed | Check logs for errors |

### Verify Images Were Published

#### Check Docker Hub
1. Go to: `https://hub.docker.com/u/YOUR_USERNAME`
2. You should see three repositories:
   - `your-username/sparkyfitness` (frontend)
   - `your-username/sparkyfitness_server` (backend)
   - `your-username/sparkyfitness_garmin` (garmin)

#### Check via CLI
```bash
# Check if images exist
docker pull YOUR_USERNAME/sparkyfitness:latest
docker pull YOUR_USERNAME/sparkyfitness_server:latest

# List available tags
curl -s https://hub.docker.com/v2/repositories/YOUR_USERNAME/sparkyfitness/tags | jq -r '.results[].name'
```

---

## Step 6: Deploy Using Your Images

### Using docker-compose.prod.yml

The production compose file now uses the `DOCKER_USERNAME` environment variable:

```bash
# Set your Docker Hub username
export DOCKER_USERNAME=your-dockerhub-username

# Pull latest images
cd docker
docker-compose -f docker-compose.prod.yml pull

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Using docker-compose.branch.yml (for testing branches)

```bash
# Set your username and branch tag
export DOCKER_USERNAME=your-dockerhub-username
export IMAGE_TAG=claude-authentik-proxy-auth-setup-011cv2eprxqy243vyrwvg1mw

# Pull and run
docker-compose -f docker-compose.branch.yml pull
docker-compose -f docker-compose.branch.yml up -d
```

### Alternative: Add to .env File

In `docker/.env`:
```bash
DOCKER_USERNAME=your-dockerhub-username
IMAGE_TAG=latest  # or specific branch tag
```

Then:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

### Issue: "unauthorized: incorrect username or password"

**Cause:** Secrets not set correctly in GitHub

**Solution:**
1. Double-check GitHub Secrets (Settings → Secrets and variables → Actions)
2. Verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` are set
3. Re-create the access token on Docker Hub if needed
4. Update `DOCKER_PASSWORD` secret with new token

### Issue: Workflow fails with "repository not found"

**Cause:** Docker Hub repositories don't exist yet

**Solution:**
Docker Hub automatically creates repositories on first push. The workflow will create them automatically. Just re-run the workflow if it failed the first time.

### Issue: "Error response from daemon: pull access denied"

**Cause:** Trying to pull images that don't exist yet or are private

**Solution:**
1. Verify build completed successfully (check Actions tab)
2. Check image exists on Docker Hub
3. If using private repos, login first:
   ```bash
   docker login -u YOUR_USERNAME
   ```

### Issue: Images are outdated after pushing new code

**Cause:** Using cached images locally

**Solution:**
```bash
# Force pull latest images
docker-compose -f docker-compose.prod.yml pull

# Remove old containers and recreate
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

### Issue: Build takes longer than expected

**Normal:** First builds take 8-12 minutes due to dependency installation

**Subsequent builds:** ~5-8 minutes (Docker layer caching helps)

**If taking 15+ minutes:** Check Actions logs for network issues or large dependency downloads

---

## Advanced Configuration

### Using GitHub Container Registry (GHCR) Only

If you prefer GHCR over Docker Hub:

**Advantages:**
- No pull rate limits
- Integrated with GitHub
- Free unlimited storage for public repos

**Disadvantages:**
- Requires authentication to pull private images
- Slightly more complex setup

**Configuration:**

The workflow already publishes to GHCR automatically. Images are available at:
```
ghcr.io/YOUR_USERNAME/sparkyfitness-frontend:latest
ghcr.io/YOUR_USERNAME/sparkyfitness-server:latest
ghcr.io/YOUR_USERNAME/sparkyfitness-garmin:latest
```

**Update docker-compose files:**

```yaml
services:
  sparkyfitness-frontend:
    image: ghcr.io/YOUR_USERNAME/sparkyfitness-frontend:latest

  sparkyfitness-server:
    image: ghcr.io/YOUR_USERNAME/sparkyfitness-server:latest
```

**Pull images (requires authentication):**

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull images
docker-compose -f docker-compose.prod.yml pull
```

### Multi-Platform Builds

The workflow builds for both architectures automatically:
- `linux/amd64` (x86_64) - Standard servers
- `linux/arm64` (ARM) - Raspberry Pi, AWS Graviton, Apple Silicon

Docker automatically pulls the correct architecture for your system.

### Custom Image Tags

To use specific versions instead of `latest`:

```yaml
# docker-compose.prod.yml
services:
  sparkyfitness-frontend:
    image: ${DOCKER_USERNAME}/sparkyfitness:${IMAGE_TAG:-v1.0.0}
```

Then:
```bash
IMAGE_TAG=v1.0.0 docker-compose -f docker-compose.prod.yml up -d
```

---

## Best Practices

### 1. **Use Specific Tags in Production**

❌ **Don't:**
```yaml
image: myusername/sparkyfitness:latest
```

✅ **Do:**
```yaml
image: myusername/sparkyfitness:v1.2.3
```

### 2. **Test Branch Images Before Merging**

```bash
# Build images for feature branch
git push origin feature/new-feature

# Wait for build to complete (~8 min)

# Test the branch image
IMAGE_TAG=feature-new-feature docker-compose -f docker-compose.branch.yml up -d

# Verify it works, then merge to main
```

### 3. **Keep Secrets Secure**

- Never commit `.env` files with real credentials
- Rotate access tokens periodically (every 6-12 months)
- Use different passwords for dev/staging/production databases

### 4. **Monitor Image Sizes**

```bash
# Check image sizes
docker images | grep sparkyfitness

# If images are too large (>500MB), optimize Dockerfiles
```

### 5. **Clean Up Old Images**

```bash
# Remove old local images
docker image prune -a

# Remove specific old tags from Docker Hub via web UI
```

---

## Complete Example Workflow

Here's a complete example from fork to deployment:

```bash
# 1. Fork repository on GitHub (via web UI)

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/SparkyFitness.git
cd SparkyFitness

# 3. Set up GitHub secrets (via web UI)
#    - DOCKER_USERNAME
#    - DOCKER_PASSWORD

# 4. Create .env file
cd docker
cp .env.example .env
# Edit .env with your settings

# 5. Make your changes
git checkout -b feature/my-fix
# ... make code changes ...
git commit -am "Fix: My awesome fix"

# 6. Push to trigger build
git push origin feature/my-fix

# 7. Wait for build (~8 minutes)
# Check: https://github.com/YOUR_USERNAME/SparkyFitness/actions

# 8. Test your branch image
export DOCKER_USERNAME=your-username
export IMAGE_TAG=feature-my-fix
docker-compose -f docker-compose.branch.yml pull
docker-compose -f docker-compose.branch.yml up -d

# 9. Verify it works
docker-compose -f docker-compose.branch.yml logs -f

# 10. If good, merge to main
git checkout main
git merge feature/my-fix
git push origin main

# 11. Wait for main build, then deploy production
export DOCKER_USERNAME=your-username
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

---

## Summary Checklist

- [ ] Created Docker Hub account
- [ ] Generated Docker Hub access token
- [ ] Set `DOCKER_USERNAME` secret in GitHub
- [ ] Set `DOCKER_PASSWORD` secret in GitHub
- [ ] Updated `docker/.env` with your settings
- [ ] Generated new encryption keys (API + JWT)
- [ ] Triggered first build (push/manual/release)
- [ ] Verified images on Docker Hub
- [ ] Successfully pulled and deployed images
- [ ] Tested authentication fix works

---

## Next Steps

After completing this setup:

1. **Deploy to production** using your images
2. **Test the Authentik session fix** (main reason for this PR)
3. **Update Nginx configuration** (see `docs/AUTHENTIK_NGINX_CONFIG.md`)
4. **Monitor application logs** for any issues

---

## Related Documentation

- [CI/CD Docker Builds Guide](./CI_CD_DOCKER_BUILDS.md)
- [Authentik Nginx Configuration](./AUTHENTIK_NGINX_CONFIG.md)
- [Docker Compose Configuration](../docker/)

---

**Need Help?**

If you run into issues:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review GitHub Actions logs for specific errors
3. Verify all secrets are correctly set
4. Ensure Docker Hub access token has correct permissions

---

Last updated: 2025-11-11
