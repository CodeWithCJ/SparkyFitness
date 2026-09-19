# Troubleshooting & Debugging

This comprehensive guide provides solutions to common issues and debugging techniques for SparkyFitness developers.

## Common Issues and Solutions

### Port Conflicts

If you encounter errors indicating that a port is already in use, another application is likely using one of the ports required by SparkyFitness (e.g., 8080 for frontend, 3010 for backend, 5432 for PostgreSQL).

**Solution:**
1. **Identify the conflicting process**:
   - On Linux/macOS: `lsof -i :<port_number>` (e.g., `lsof -i :8080`)
   - On Windows: `netstat -ano | findstr :<port_number>` followed by `taskkill /PID <PID> /F`
2. **Stop the conflicting service** or **change the port** in your `.env` file.

### Database Connection Issues

Problems connecting to the PostgreSQL database can arise from incorrect credentials, the database not running, or network issues.

**Solution:**
1. **Check database logs**:
   ```bash
   ./docker/docker-helper.sh dev logs sparkyfitness-db
   ```
2. **Verify `.env` settings**: Ensure `SPARKY_FITNESS_DB_NAME`, `SPARKY_FITNESS_DB_USER`, and `SPARKY_FITNESS_DB_PASSWORD` are correct.
3. **Reset database (Development only!)**: If data integrity is not critical, you can perform a destructive reset.
   ```bash
   ./docker/docker-helper.sh dev down
   ./docker/docker-helper.sh dev clean
   ./docker/docker-helper.sh dev up
   ```

### Build Failures

Issues during the build process (e.g., `npm install` or Docker image builds) can be caused by corrupted caches or dependency problems.

**Solution:**
1. **Clean rebuild**:
   ```bash
   ./docker/docker-helper.sh dev build --no-cache
   ```
2. **Full reset**:
   ```bash
   ./docker/docker-helper.sh dev clean
   ./docker/docker-helper.sh dev up
   ```

### Permission Issues (Linux/WSL)

On Linux or Windows Subsystem for Linux (WSL), you might encounter permission errors related to Docker volumes, especially for the PostgreSQL data directory.

**Solution:**
1. **Fix volume permissions**:
   ```bash
   sudo chown -R $USER:$USER ./postgresql
   ```

### "Invalid key length" error

This error typically indicates that your `SPARKY_FITNESS_API_ENCRYPTION_KEY` in your `.env` file is not correctly configured. Ensure it is a 64-character hexadecimal string.

**Solution:**
Generate a valid key using:
```bash
openssl rand -hex 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rate Limiting Issues

SparkyFitness implements rate limiting at the Nginx reverse proxy layer to prevent brute-force attacks and DoS attempts.

**Common Rate Limiting Errors:**
- `429 Too Many Requests` on login/signup endpoints
- Connection refused during high traffic

**Solution:**
1. **Check rate limit configuration** in `docker/nginx.conf.template`:
   ```nginx
   limit_req_zone $binary_remote_addr zone=login_signup_zone:10m rate=5r/s;
   ```
2. **Temporary bypass for development**:
   ```bash
   # Edit nginx.conf.template and increase rate limits
   # Then restart containers
   ./docker/docker-helper.sh dev restart
   ```
3. **Production tuning**: Adjust rate limits based on actual usage patterns

### Authentication & JWT Issues

**Common symptoms:**
- `401 Unauthorized` errors
- Token expired messages
- Login session not persisting

**Solution:**
1. **Check JWT secret configuration**:
   ```bash
   # Ensure JWT_SECRET is properly set in .env
   grep JWT_SECRET .env
   ```
2. **Clear browser storage**:
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   ```
3. **Verify token expiration settings** in backend configuration

## Debugging Techniques

### Application Logs

**View all service logs:**
```bash
./docker/docker-helper.sh dev logs
```

**Follow specific service logs:**
```bash
./docker/docker-helper.sh dev logs -f sparkyfitness-frontend
./docker/docker-helper.sh dev logs -f sparkyfitness-server
./docker/docker-helper.sh dev logs -f sparkyfitness-db
```

**Backend debugging logs:**
```bash
# Enable debug logging in .env
LOG_LEVEL=debug

# View structured logs
docker exec -it sparkyfitness-server-1 tail -f /app/logs/app.log
```

### Container Inspection

**List running containers:**
```bash
./docker/docker-helper.sh dev ps
```

**Execute commands in containers:**
```bash
# Frontend container
docker exec -it sparkyfitness-frontend-1 sh

# Backend container
docker exec -it sparkyfitness-server-1 sh

# Database container
docker exec -it sparkyfitness-db-1 psql -U sparky -d sparkyfitness_db
```

**Inspect container resources:**
```bash
# Check resource usage
docker stats

# Inspect container configuration
docker inspect sparkyfitness-server-1
```

### Database Debugging

**Connect to PostgreSQL:**
```bash
docker exec -it sparkyfitness-db-1 psql -U sparky -d sparkyfitness_db
```

**Common database queries:**
```sql
-- Check table structure
\dt

-- View recent logs
SELECT * FROM logs ORDER BY created_at DESC LIMIT 10;

-- Check user data
SELECT id, email, created_at FROM users LIMIT 5;

-- Monitor active connections
SELECT * FROM pg_stat_activity;
```

**Database migration issues:**
```bash
# Check migration status
docker exec -it sparkyfitness-server-1 npm run migrate:status

# Force migration reset (DANGEROUS)
docker exec -it sparkyfitness-server-1 npm run migrate:reset
```

### Network Debugging

**Check container networking:**
```bash
# List Docker networks
docker network ls

# Inspect network configuration
docker network inspect <network_name>

# Test connectivity between containers
docker exec -it sparkyfitness-frontend-1 ping sparkyfitness-server
```

**API endpoint testing:**
```bash
# Test backend health endpoint
curl http://localhost:3010/api/health

# Test with authentication
curl -H "Authorization: Bearer <token>" http://localhost:3010/api/users/profile
```

### Performance Debugging

**Monitor resource usage:**
```bash
# Real-time resource monitoring
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# System resource usage
htop  # or top on basic systems
```

**Database performance:**
```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check locks
SELECT * FROM pg_locks WHERE NOT GRANTED;
```

## Development Environment Issues

### Hot Reload Not Working

**Frontend hot reload issues:**
```bash
# Check Vite configuration
cat vite.config.ts

# Restart with clean cache
./docker/docker-helper.sh dev down
./docker/docker-helper.sh dev up --build
```

### Environment Variable Issues

**Debug environment variables:**
```bash
# Check .env file is loaded
docker exec -it sparkyfitness-server-1 env | grep SPARKY

# Verify frontend environment variables
docker exec -it sparkyfitness-frontend-1 env | grep VITE
```

### TypeScript Compilation Issues

**Common TypeScript errors:**
```bash
# Check TypeScript configuration
cat tsconfig.json

# Run type checking manually
docker exec -it sparkyfitness-frontend-1 npm run type-check

# Clear TypeScript cache
rm -rf node_modules/.cache
```

## Advanced Debugging

### Memory Leaks

**Identify memory leaks:**
```bash
# Monitor memory usage over time
watch -n 1 'docker stats --no-stream'

# Use Node.js heap dumps
docker exec -it sparkyfitness-server-1 node --inspect=0.0.0.0:9229 server.js
```

### Performance Profiling

**Backend profiling:**
```javascript
// Add to backend code for profiling
const profiler = require('v8-profiler-next');

// Start profiling
profiler.startProfiling('API_PROFILE');

// End profiling and save
const profile = profiler.stopProfiling('API_PROFILE');
profile.export().pipe(fs.createWriteStream('profile.cpuprofile'));
```

### Security Debugging

**Check for security vulnerabilities:**
```bash
# NPM audit
npm audit

# Docker security scanning
docker scan sparkyfitness-server:latest
```

## Getting Help

When troubleshooting fails, reach out to the community:

- **Discord Community**: https://discord.gg/vcnMT5cPEA
- **GitHub Discussions**: Post detailed questions with logs
- **Documentation**: Search this comprehensive documentation site
- **Issue Templates**: Use provided GitHub issue templates for bug reports

### Creating Effective Bug Reports

Include the following information:
1. **Environment details**: OS, Docker version, Node.js version
2. **Steps to reproduce**: Clear, numbered steps
3. **Expected vs. actual behavior**: What should happen vs. what happens
4. **Logs**: Relevant log excerpts (use code blocks)
5. **Configuration**: Relevant parts of .env or config files (sanitized)
6. **Screenshots**: For UI issues

**Log collection command:**
```bash
# Collect all relevant logs
./docker/docker-helper.sh dev logs > debug-logs-$(date +%Y%m%d-%H%M%S).txt
```
