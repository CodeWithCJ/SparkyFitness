import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ScreenErrorBoundary, { withErrorBoundary, SectionErrorBoundary } from '../../src/components/ScreenErrorBoundary';
import { addLog } from '../../src/services/LogService';
import { queryClient } from '../../src/hooks/queryClient';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { resetQueries: jest.fn() },
}));

const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockResetQueries = queryClient.resetQueries as jest.Mock;

function GoodChild() {
  return <Text>All good</Text>;
}

function BadChild(): React.ReactElement {
  throw new Error('Render kaboom');
}

// Suppress React error boundary console noise
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockAddLog.mockClear();
  mockResetQueries.mockClear();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('ScreenErrorBoundary', () => {
  it('renders children normally when no error', () => {
    const { getByText } = render(
      <ScreenErrorBoundary screenName="Test">
        <GoodChild />
      </ScreenErrorBoundary>,
    );
    expect(getByText('All good')).toBeTruthy();
  });

  it('shows fallback when child throws during render', () => {
    const { getByText, queryByText } = render(
      <ScreenErrorBoundary screenName="Test">
        <BadChild />
      </ScreenErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText(/unexpected error occurred/)).toBeTruthy();
    expect(queryByText('All good')).toBeNull();
  });

  it('logs via addLog with ERROR status and screen name', () => {
    render(
      <ScreenErrorBoundary screenName="Dashboard">
        <BadChild />
      </ScreenErrorBoundary>,
    );
    expect(mockAddLog).toHaveBeenCalledWith(
      '[Dashboard] Screen crashed',
      'ERROR',
      expect.arrayContaining(['Render kaboom']),
    );
  });

  it('Try Again resets queries and remounts child', () => {
    let shouldThrow = true;
    function ToggleBadChild(): React.ReactElement {
      if (shouldThrow) throw new Error('render fails');
      return <Text>Recovered</Text>;
    }

    const { getByText } = render(
      <ScreenErrorBoundary screenName="Test">
        <ToggleBadChild />
      </ScreenErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(getByText('Try Again'));

    expect(mockResetQueries).toHaveBeenCalled();
    expect(getByText('Recovered')).toBeTruthy();
  });

  it('shows Go Back when onGoBack is provided', () => {
    const goBack = jest.fn();
    const { getByText } = render(
      <ScreenErrorBoundary screenName="Test" onGoBack={goBack}>
        <BadChild />
      </ScreenErrorBoundary>,
    );
    fireEvent.press(getByText('Go Back'));
    expect(goBack).toHaveBeenCalled();
  });

  it('hides Go Back when onGoBack is not provided', () => {
    const { queryByText } = render(
      <ScreenErrorBoundary screenName="Test">
        <BadChild />
      </ScreenErrorBoundary>,
    );
    expect(queryByText('Go Back')).toBeNull();
  });
});

describe('withErrorBoundary HOC', () => {
  it('forwards all props to the wrapped component', () => {
    interface TestProps { label: string; count: number }
    function TestScreen({ label, count }: TestProps) {
      return <Text>{`${label}-${count}`}</Text>;
    }

    const SafeTest = withErrorBoundary(TestScreen, 'Test');
    const { getByText } = render(<SafeTest label="hello" count={42} />);
    expect(getByText('hello-42')).toBeTruthy();
  });

  it('provides Go Back when canGoBack is true and navigation prop exists', () => {
    const goBack = jest.fn();

    function CrashScreen(): React.ReactElement {
      throw new Error('crash');
    }

    const SafeCrash = withErrorBoundary(CrashScreen, 'Crash', { canGoBack: true });
    const { getByText } = render(<SafeCrash navigation={{ goBack }} />);
    fireEvent.press(getByText('Go Back'));
    expect(goBack).toHaveBeenCalled();
  });
});

describe('SectionErrorBoundary', () => {
  it('renders children normally when no error', () => {
    const { getByText } = render(
      <SectionErrorBoundary sectionName="TestSection">
        <GoodChild />
      </SectionErrorBoundary>,
    );
    expect(getByText('All good')).toBeTruthy();
  });

  it('shows compact inline fallback when child throws', () => {
    const { getByText, queryByText } = render(
      <SectionErrorBoundary sectionName="TestSection">
        <BadChild />
      </SectionErrorBoundary>,
    );
    expect(getByText('This section failed to load.')).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('logs via addLog with section name', () => {
    render(
      <SectionErrorBoundary sectionName="Settings">
        <BadChild />
      </SectionErrorBoundary>,
    );
    expect(mockAddLog).toHaveBeenCalledWith(
      '[Settings] Section crashed',
      'ERROR',
      expect.arrayContaining(['Render kaboom']),
    );
  });

  it('Try Again resets queries and remounts child', () => {
    let shouldThrow = true;
    function ToggleBad(): React.ReactElement {
      if (shouldThrow) throw new Error('section fails');
      return <Text>Section recovered</Text>;
    }

    const { getByText } = render(
      <SectionErrorBoundary sectionName="TestSection">
        <ToggleBad />
      </SectionErrorBoundary>,
    );

    expect(getByText('This section failed to load.')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(getByText('Try Again'));

    expect(mockResetQueries).toHaveBeenCalled();
    expect(getByText('Section recovered')).toBeTruthy();
  });
});
