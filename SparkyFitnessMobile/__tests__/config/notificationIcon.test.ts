import fs from 'fs';
import path from 'path';

describe('Android notification icon configuration', () => {
  it('configures expo-notifications with a dedicated icon and accent color', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf8')
    );
    const notificationsPlugin = appJson.expo.plugins.find(
      (entry: unknown) =>
        Array.isArray(entry) && entry[0] === 'expo-notifications'
    );

    expect(notificationsPlugin).toBeDefined();
    const [, options] = notificationsPlugin as [
      string,
      { icon?: string; color?: string },
    ];
    expect(options?.icon).toBeTruthy();
    expect(options?.color).toBe('#5087F7');

    const iconPath = path.resolve(__dirname, '../..', options!.icon!);
    expect(fs.existsSync(iconPath)).toBe(true);
  });
});
