# Internationalization (i18n) Setup

This application now supports multiple languages using react-i18next. Currently supported languages:
- English (en) - Default
- Russian (ru)

## How to Use

### For Users
1. Go to Settings page
2. In the Preferences section, find the "Language" dropdown
3. Select your preferred language (English or Russian)
4. The interface will immediately switch to the selected language
5. Your language preference is saved in your user preferences

### For Developers

#### Adding New Translations
1. Edit the translation files in `src/i18n/locales/`:
   - `en.json` - English translations
   - `ru.json` - Russian translations

2. Add new translation keys using nested objects:
```json
{
  "section": {
    "key": "Translation text"
  }
}
```

3. Use translations in components:
```tsx
import { useLanguage } from '@/contexts/LanguageContext';

const MyComponent = () => {
  const { t } = useLanguage();
  
  return <div>{t('section.key')}</div>;
};
```

#### Adding New Languages
1. Create a new locale file in `src/i18n/locales/` (e.g., `fr.json` for French)
2. Add the language to the resources in `src/i18n/config.ts`
3. Add the language option to the language switcher components
4. Update the `LanguageSwitcher` component to include the new language

#### Translation with Variables
Use interpolation for dynamic content:
```json
{
  "welcome": "Welcome {{name}}"
}
```

```tsx
t('welcome', { name: userName })
```

## Implementation Details

### Architecture
- **i18n Configuration**: `src/i18n/config.ts`
- **Language Context**: `src/contexts/LanguageContext.tsx`
- **Integration with Preferences**: Language preference is stored in the user preferences system
- **Persistence**: Language choice is saved in localStorage and user preferences database

### Components
- **LanguageSwitcher**: Dropdown component for language selection (available in header)
- **Settings Integration**: Language setting in the Settings page preferences section

### Synchronization
- Language changes are synchronized between:
  - react-i18next state
  - PreferencesContext
  - localStorage (for guest users)
  - User preferences database (for logged-in users)

## Current Translation Coverage

The following areas have been internationalized:
- Main navigation (Diary, Check-In, Reports, Foods, Exercises, Goals, Settings, Admin)
- Header (welcome message, app name)
- Authentication messages
- Common UI elements (buttons, loading states, error messages)
- Settings page preferences section
- Footer

## Future Enhancements

To complete the internationalization:
1. Add translations for individual page content
2. Add more languages as needed
3. Implement date/time localization
4. Add number formatting localization
5. Consider RTL language support if needed