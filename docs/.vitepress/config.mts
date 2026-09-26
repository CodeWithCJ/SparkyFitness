import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'SparkyFitness',
  description: 'Self-hosted fitness tracking & nutrition platform with AI coaching',
  base: '/SparkyFitness/',
  srcDir: './src',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  vite: {
    build: {
      target: 'esnext',
    },
    esbuild: {
      target: 'esnext',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/SparkyFitness/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'SparkyFitness',

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Install',
        items: [
          { text: 'Interactive .env Generator', link: '/install/env-generator' },
          { text: 'Docker Compose (Quickstart)', link: '/install/docker-compose' },
          { text: 'Portainer', link: '/install/portainer' },
          { text: 'Synology NAS', link: '/install/synology' },
          { text: 'Proxmox', link: '/install/proxmox' },
          { text: 'Kubernetes / Helm', link: '/install/kubernetes' },
          { text: 'Build from Source', link: '/install/build-from-source' },
          { text: 'Environment Variables', link: '/install/environment-variables' },
          { text: 'External Database', link: '/install/external-database' },
          { text: 'Multiple Instances', link: '/install/multiple-instances' },
          { text: 'Postgres Upgrade', link: '/install/postgres-upgrade' },
          { text: 'NixOS', link: '/install/nixos' },
          { text: 'Coolify', link: '/install/coolify' },
          { text: 'TrueNAS', link: '/install/truenas' },
          { text: 'Umbrel', link: '/install/umbrel' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Feature Comparison', link: '/features/comparison' },
          { text: 'Diary & Nutrition', link: '/features/diary/meals' },
          { text: 'Exercise Logging', link: '/features/exercises/exercise-search' },
          { text: 'Food Database', link: '/features/food/food-search' },
          { text: 'AI Nutrition Assistant', link: '/features/ai-assistant' },
          { text: 'Cycle Hub', link: '/features/cycle-hub/' },
          { text: 'Family & Friends Sharing', link: '/features/family-friends-sharing' },
          { text: 'MCP Server', link: '/features/mcp-server' },
          { text: 'Settings & Integrations', link: '/features/settings/preferences' },
        ],
      },
      { text: 'Mobile App', link: '/mobile-app/mobile-app' },
      {
        text: 'Developer',
        items: [
          { text: 'Getting Started', link: '/developer/getting-started' },
          { text: 'Architecture', link: '/developer/architecture' },
          { text: 'Database Schema & Reference', link: '/developer/database' },
          { text: 'Database Security Tiers', link: '/developer/database-security-tiers' },
          { text: 'API Reference', link: '/developer/api-reference' },
          { text: 'Testing Guide', link: '/developer/testing' },
          { text: 'Contributing', link: '/developer/contributing' },
          { text: 'MCP Developer Tools', link: '/developer/mcp/dev' },
        ],
      },
      { text: 'FAQ', link: '/faq' },
    ],

    sidebar: {
      '/install/': [
        {
          text: 'Installation & Setup',
          items: [
            { text: '⚡ Interactive .env Generator', link: '/install/env-generator' },
            { text: 'Docker Compose (Recommended)', link: '/install/docker-compose' },
            { text: 'Portainer', link: '/install/portainer' },
            { text: 'Synology NAS', link: '/install/synology' },
            { text: 'Proxmox', link: '/install/proxmox' },
            { text: 'Kubernetes / Helm', link: '/install/kubernetes' },
            { text: 'Build from Source', link: '/install/build-from-source' },
            { text: 'Environment Variables Reference', link: '/install/environment-variables' },
            { text: 'External Database Setup', link: '/install/external-database' },
            { text: 'Running Multiple Instances', link: '/install/multiple-instances' },
            { text: 'PostgreSQL Major Upgrade', link: '/install/postgres-upgrade' },
            { text: 'NixOS', link: '/install/nixos' },
            { text: 'Coolify', link: '/install/coolify' },
            { text: 'TrueNAS', link: '/install/truenas' },
            { text: 'Umbrel', link: '/install/umbrel' },
          ],
        },
      ],
      '/features/': [
        {
          text: 'Features Overview',
          items: [
            { text: 'Feature Comparison', link: '/features/comparison' },
            { text: 'Features Index', link: '/features/' },
            { text: 'Check-in', link: '/features/check-in' },
            { text: 'Reports', link: '/features/reports' },
            { text: 'Goals', link: '/features/goals' },
            { text: 'Family & Friends Sharing', link: '/features/family-friends-sharing' },
            { text: 'Searching', link: '/features/searching' },
            { text: 'Sharing', link: '/features/sharing' },
            { text: 'User Settings', link: '/features/user-settings' },
            { text: 'AI Nutrition Assistant', link: '/features/ai-assistant' },
            { text: 'Measurements', link: '/features/measurements' },
            { text: 'MCP Server', link: '/features/mcp-server' },
          ],
        },
        {
          text: 'Daily Diary',
          collapsed: false,
          items: [
            { text: 'Daily Calorie Goal', link: '/features/diary/daily-calorie-goal' },
            { text: 'Nutrition Summary', link: '/features/diary/nutrition-summary' },
            { text: 'Water Intake', link: '/features/diary/water-intake' },
            { text: 'Meals & Logging', link: '/features/diary/meals' },
            { text: 'Exercise Diary', link: '/features/diary/exercise' },
          ],
        },
        {
          text: 'Food & Nutrition',
          collapsed: false,
          items: [
            { text: 'Food Database Manager', link: '/features/food/food-database-manager' },
            { text: 'Custom Food Form', link: '/features/food/custom-food-form' },
            { text: 'Food Search', link: '/features/food/food-search' },
          ],
        },
        {
          text: 'Exercises & Workouts',
          collapsed: false,
          items: [
            { text: 'Exercise Database Manager', link: '/features/exercises/exercise-database-manager' },
            { text: 'Exercise Search', link: '/features/exercises/exercise-search' },
            { text: 'Interval & WOD Workouts', link: '/features/exercises/interval-wod-workouts' },
            { text: 'Guided Workouts', link: '/features/exercises/guided-workouts' },
            { text: 'Progression & Per-Set Ramp', link: '/features/exercises/progression-and-per-set-ramp' },
          ],
        },
        {
          text: 'Settings & Integrations',
          collapsed: true,
          items: [
            { text: 'Preferences', link: '/features/settings/preferences' },
            { text: 'Calculation Settings', link: '/features/settings/calculation-settings' },
            { text: 'External Providers', link: '/features/settings/external-providers' },
            { text: 'Liftosaur', link: '/features/settings/liftosaur' },
            { text: 'Nutrient Display', link: '/features/settings/nutrient-display-settings' },
            { text: 'Login Management', link: '/features/settings/login-management' },
            { text: 'Google Health Connect', link: '/features/settings/google-health' },
            { text: 'Polar', link: '/features/settings/polar' },
          ],
        },
        {
          text: 'Cycle Hub',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/features/cycle-hub/' },
            { text: 'Trying to Conceive', link: '/features/cycle-hub/trying-to-conceive' },
            { text: 'Pregnancy Mode', link: '/features/cycle-hub/pregnancy' },
            { text: 'Insights', link: '/features/cycle-hub/insights' },
            { text: 'Modes Comparison', link: '/features/cycle-hub/modes-comparison' },
          ],
        },
      ],
      '/administration/': [
        {
          text: 'Administration',
          items: [
            { text: 'OAuth Authentication', link: '/administration/oauth-authentication' },
            { text: 'Reverse Proxy Setup', link: '/administration/reverse-proxy' },
            { text: 'Manual Backup & Restore', link: '/administration/manual_backup_restore' },
            { text: 'Homepage Widget', link: '/administration/homepage-widget' },
          ],
        },
      ],
      '/mobile-app/': [
        {
          text: 'Mobile Application',
          items: [
            { text: 'Mobile App Guide', link: '/mobile-app/mobile-app' },
            { text: 'Proxy Setup', link: '/mobile-app/proxy-setup' },
            { text: 'Troubleshooting', link: '/mobile-app/troubleshooting' },
          ],
        },
      ],
      '/developer/': [
        {
          text: 'Developer Guide',
          items: [
            { text: 'Getting Started', link: '/developer/getting-started' },
            { text: 'Architecture Overview', link: '/developer/architecture' },
            { text: 'Contributing Guidelines', link: '/developer/contributing' },
            { text: 'Database Schema & Tables', link: '/developer/database' },
            { text: 'API Reference', link: '/developer/api-reference' },
            { text: 'Troubleshooting', link: '/developer/troubleshooting' },
            { text: 'Testing Guide', link: '/developer/testing' },
            { text: 'Translations Guide', link: '/developer/translations' },
            { text: 'Database Security Tiers', link: '/developer/database-security-tiers' },
            { text: 'Food Provider Images', link: '/developer/food-provider-images' },
            { text: 'Maintainer Image Tools', link: '/developer/maintainer-image-tools' },
          ],
        },
        {
          text: 'Advanced Architecture',
          collapsed: true,
          items: [
            { text: 'AI Command Patterns', link: '/developer/advanced/ai-command-patterns' },
            { text: 'Chatbot Workflow', link: '/developer/advanced/chatbot-workflow' },
            { text: 'Rate Limiting', link: '/developer/advanced/rate-limiting' },
            { text: 'Translations Architecture', link: '/developer/advanced/translations' },
            { text: 'Wger Integration Plan', link: '/developer/advanced/wger-integration-plan' },
          ],
        },
        {
          text: 'MCP Tools',
          collapsed: false,
          items: [
            { text: 'Dev MCP', link: '/developer/mcp/dev' },
            { text: 'Food MCP', link: '/developer/mcp/food' },
            { text: 'Exercise MCP', link: '/developer/mcp/exercise' },
            { text: 'Check-in MCP', link: '/developer/mcp/checkin' },
            { text: 'Coach MCP', link: '/developer/mcp/coach' },
            { text: 'Engagement MCP', link: '/developer/mcp/engagement' },
            { text: 'Vision MCP', link: '/developer/mcp/vision' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CodeWithCJ/SparkyFitness' },
      { icon: 'discord', link: 'https://discord.gg/vcnMT5cPEA' },
    ],

    footer: {
      message: 'Released under the GPL-3.0 License.',
      copyright: 'Copyright © SparkyFitness Contributors',
    },
  },
});
