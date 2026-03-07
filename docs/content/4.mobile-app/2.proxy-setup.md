# Proxy Tunnel Setup

If you use a proxy tunnel such as Cloudflare or Pangolin, you will need to configure the app to send a special header.

## Pangolin

1. Open your Pangolin dashboard click "Links" in the sidebar
2. Click Create Share Link
3. Choose your resource, enter a title, and an expiration date. Click Create Link
4. Underneath the QR code, click "Usage Examples" to see how your token will be sent as a header. Copy this down.

![Copy This](/pangolincopythis.png)

5. In the Sparky Fitness app, navigate to the settings screen
6. Click on your server to edit it or add a new server.
7. Enter in the header information that you copied from the Pangolin dashboard. You may need to click the + button to add another field.

![Pangolin Header](/pangolinproxy.png)