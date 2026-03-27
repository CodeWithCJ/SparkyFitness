import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OnboardingScreen from '../../src/screens/OnboardingScreen';
import { login, verifyTotp } from '../../src/services/api/authService';
import { saveServerConfig } from '../../src/services/storage';

// Mock navigation
const mockReplace = jest.fn();
const mockNavigation = { replace: mockReplace } as any;
const mockRoute = { key: 'onboarding', name: 'Onboarding' as const, params: undefined };

// Mock modules
jest.mock('../../src/services/api/authService', () => ({
  login: jest.fn(),
  LoginError: class LoginError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  clearAuthCookies: jest.fn().mockResolvedValue(undefined),
  fetchMfaFactors: jest.fn(),
  verifyTotp: jest.fn(),
  sendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  saveServerConfig: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  queryClient: { invalidateQueries: jest.fn() },
  serverConnectionQueryKey: ['serverConnection'],
}));

// Mock global fetch for reachability checks
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLogin = login as jest.MockedFunction<typeof login>;
const mockSaveServerConfig = saveServerConfig as jest.MockedFunction<typeof saveServerConfig>;
const mockVerifyTotp = verifyTotp as jest.MockedFunction<typeof verifyTotp>;

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <OnboardingScreen navigation={mockNavigation} route={mockRoute} />
      </SafeAreaProvider>,
    );

  // --- Page 1 tests ---

  describe('Page 1: Welcome', () => {
    test('renders welcome content and URL input', () => {
      const { getByText, getByPlaceholderText } = renderScreen();

      expect(getByText('SparkyFitness')).toBeTruthy();
      expect(getByText('Your self-hosted fitness tracker')).toBeTruthy();
      expect(getByPlaceholderText('https://your-sparky-app.com')).toBeTruthy();
      expect(getByText('Next')).toBeTruthy();
      expect(getByText('Later')).toBeTruthy();
    });

    test('learn more section toggles on press', () => {
      const { getByText, queryByText } = renderScreen();

      expect(
        queryByText(/SparkyFitness helps you track/),
      ).toBeNull();

      fireEvent.press(getByText('Learn more about SparkyFitness'));

      expect(
        getByText(/SparkyFitness helps you track/),
      ).toBeTruthy();
    });

    test('Next shows error when URL is empty', async () => {
      const { getByText } = renderScreen();

      await act(async () => {
        fireEvent.press(getByText('Next'));
      });

      expect(getByText(/Enter a valid SparkyFitness URL/)).toBeTruthy();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('Next shows error when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { getByText, getByPlaceholderText } = renderScreen();

      fireEvent.changeText(
        getByPlaceholderText('https://your-sparky-app.com'),
        'https://example.com',
      );

      await act(async () => {
        fireEvent.press(getByText('Next'));
      });

      await waitFor(() => {
        expect(
          getByText('Could not reach server. Check the URL and try again.'),
        ).toBeTruthy();
      });
    });

    test('Next advances to page 2 when server is reachable', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { getByText, getByPlaceholderText } = renderScreen();

      fireEvent.changeText(
        getByPlaceholderText('https://your-sparky-app.com'),
        'https://example.com',
      );

      await act(async () => {
        fireEvent.press(getByText('Next'));
      });

      await waitFor(() => {
        expect(getByText('Connect to SparkyFitness')).toBeTruthy();
        expect(getByText('https://example.com')).toBeTruthy();
      });
    });

    test('Later navigates to Settings', async () => {
      const { getByText } = renderScreen();

      await act(async () => {
        fireEvent.press(getByText('Later'));
      });

      expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
    });
  });

  // --- Page 2 tests ---

  describe('Page 2: Auth', () => {
    const goToPage2 = async (result: ReturnType<typeof renderScreen>) => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-sparky-app.com'),
        'https://example.com',
      );

      await act(async () => {
        fireEvent.press(result.getByText('Next'));
      });

      await waitFor(() => {
        expect(result.getByText('Connect to SparkyFitness')).toBeTruthy();
      });
    };

    test('renders auth form with segmented control', async () => {
      const result = renderScreen();
      await goToPage2(result);

      expect(result.getByText('Sign In')).toBeTruthy();
      expect(result.getByText('API Key')).toBeTruthy();
      expect(result.getByText('Connect')).toBeTruthy();
      expect(result.getByText('Back')).toBeTruthy();
    });

    test('Back returns to page 1 with URL preserved', async () => {
      const result = renderScreen();
      await goToPage2(result);

      await act(async () => {
        fireEvent.press(result.getByText('Back'));
      });

      // Should be back on page 1 with URL preserved
      expect(
        result.getByPlaceholderText('https://your-sparky-app.com').props.value,
      ).toBe('https://example.com');
    });

    test('Later on page 2 navigates to Settings', async () => {
      const result = renderScreen();
      await goToPage2(result);

      await act(async () => {
        fireEvent.press(result.getByText('Later'));
      });

      expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
    });

    test('Connect with API key saves config and finishes', async () => {
      // Mock the API key verification fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      const result = renderScreen();
      await goToPage2(result);

      // Switch to API Key tab
      fireEvent.press(result.getByText('API Key'));

      // Enter API key
      fireEvent.changeText(
        result.getByPlaceholderText('Uds3d8i...'),
        'my-api-key',
      );

      // Reset fetch mock for the API key verification call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await act(async () => {
        fireEvent.press(result.getByText('Connect'));
      });

      await waitFor(() => {
        expect(mockSaveServerConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com',
            apiKey: 'my-api-key',
            authType: 'apiKey',
          }),
        );
        expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Dashboard' });
      });
    });

    test('Connect with Sign In handles successful login', async () => {
      mockLogin.mockResolvedValueOnce({
        type: 'success',
        sessionToken: 'tok-123',
        user: { email: 'user@example.com' },
      });

      const result = renderScreen();
      await goToPage2(result);

      // Fill in sign in fields
      fireEvent.changeText(
        result.getByPlaceholderText('email@example.com'),
        'user@example.com',
      );
      fireEvent.changeText(
        result.getByPlaceholderText('Password'),
        'password123',
      );

      await act(async () => {
        fireEvent.press(result.getByText('Connect'));
      });

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          'https://example.com',
          'user@example.com',
          'password123',
        );
        expect(mockSaveServerConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com',
            authType: 'session',
            sessionToken: 'tok-123',
          }),
        );
        expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Dashboard' });
      });
    });

    test('Connect with Sign In shows error on failure', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Connection refused'));

      const result = renderScreen();
      await goToPage2(result);

      fireEvent.changeText(
        result.getByPlaceholderText('email@example.com'),
        'user@example.com',
      );
      fireEvent.changeText(
        result.getByPlaceholderText('Password'),
        'wrong-password',
      );

      await act(async () => {
        fireEvent.press(result.getByText('Connect'));
      });

      await waitFor(() => {
        expect(
          result.getByText(
            'Could not connect to server. Check the URL and try again.',
          ),
        ).toBeTruthy();
      });

      // Should not have navigated
      expect(mockReplace).not.toHaveBeenCalled();
    });

    test('Sign In shows empty field errors', async () => {
      const result = renderScreen();
      await goToPage2(result);

      // Try connecting with empty fields
      await act(async () => {
        fireEvent.press(result.getByText('Connect'));
      });

      expect(result.getByText('Please enter your email.')).toBeTruthy();
    });
  });
});
