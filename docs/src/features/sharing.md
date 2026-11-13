# Sharing

SparkyFitness gives you several ways to share your data: with people you trust, with AI assistants and other apps, or as files for your own analysis.

## Share with people

**Family & friends**: invite family members and friends to view or log data on your behalf. Each invitation has its own permission level, from read-only access to full diary management (including managing your symptoms). Set up invitations under **Settings → Family Access**, and see the full permission matrix in [Family & Friends Sharing](/features/family-friends-sharing).

**Public sharing**: individual foods and exercises can be shared with everyone:

- In the [Food Database Manager](/features/food/food-database-manager), open a food's actions and choose **Share with public** (or **Make private**)
- In the [Exercise Database Manager](/features/exercises/exercise-database-manager), the same action is labeled **Share Public** (or **Make Private**)
- Public items show up for everyone in food and exercise search under the **Public** ownership filter, and in meal builders


## Share with apps (API keys)

Generate API keys under **Settings → Developer & Integrations → API Key Management**:

- Press **Generate New Key** and give it a name
- Choose an **Expires In** period: **Never**, **7 Days**, **30 Days**, **90 Days**, or **1 Year**
- Choose the **Access** level:
  - **Full access**: the key can read and write your data
  - **Read-only**: the key can read your data but every write request is rejected (use this for AI assistants and dashboards that only need to look at your data)
- The key is shown once: copy it to a secure place
- Each key in the list shows its scope badge, created date, expiry, and last-used time, and you can disable or delete it at any time

Keys are the credential for the [MCP Server](/features/mcp-server), which lets AI assistants read and act on your data. See that page for how to connect a client.


## Export your data

- **Full data export**: under **Settings → Profile & Account → Data Export**, download everything as CSV (choose comma or semicolon as the separator)
- **Per-table exports**: every table in [Reports](/features/reports) has a **Download (CSV)** button, and the **Prescriber-Ready Data Export** card adds a **Print / Save PDF Report** for a doctor-ready summary
- **Import**: the **Data Import** section in the same area can import a food database or food diary from CSV, so you can bring history from other tools.

## Related pages

- [Family & Friends Sharing](/features/family-friends-sharing)
- [MCP Server](/features/mcp-server)
- [AI Nutrition Assistant](/features/ai-assistant)
- [Reports](/features/reports)
- [User Settings](/features/user-settings)
- [Food Database Manager](/features/food/food-database-manager)
- [Exercise Database Manager](/features/exercises/exercise-database-manager)
