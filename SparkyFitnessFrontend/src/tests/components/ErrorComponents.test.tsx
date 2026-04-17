import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  RouteErrorBoundary,
  RootErrorBoundary,
} from '@/pages/Errors/ErrorComponents';
import {
  chunkRecoveryRuntime,
  triggerChunkRecoveryReload,
} from '@/utils/chunkRecovery';

const mockNavigate = jest.fn();
const mockUseRouteError = jest.fn();
const mockReload = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouteError: () => mockUseRouteError(),
  };
});

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

describe('ErrorComponents', () => {
  beforeAll(() => {
    jest
      .spyOn(chunkRecoveryRuntime, 'reloadWindowLocation')
      .mockImplementation(mockReload);
  });

  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
    mockReload.mockClear();
    mockUseRouteError.mockReset();
    jest.restoreAllMocks();
    jest
      .spyOn(chunkRecoveryRuntime, 'reloadWindowLocation')
      .mockImplementation(mockReload);
  });

  it('auto-reloads once for stale route chunk errors', async () => {
    mockUseRouteError.mockReturnValue(
      new TypeError('Failed to fetch dynamically imported module')
    );

    render(<RouteErrorBoundary />);

    expect(screen.getByText('Updating SparkyFitness...')).toBeInTheDocument();
    expect(screen.queryByText('Reload Page')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to the existing manual actions after a recent reload attempt', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(5_000);

    triggerChunkRecoveryReload();
    mockReload.mockClear();

    mockUseRouteError.mockReturnValue(
      new TypeError('Failed to fetch dynamically imported module')
    );

    render(<RouteErrorBoundary />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to fetch dynamically imported module')
    ).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Return to Home')).toBeInTheDocument();
    expect(mockReload).not.toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it('falls back to the manual recovery UI if storage blocks the reload guard', async () => {
    const setItemSpy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

    mockUseRouteError.mockReturnValue(
      new TypeError('Failed to fetch dynamically imported module')
    );

    render(<RouteErrorBoundary />);

    await waitFor(() => {
      expect(screen.getByText('Reload Page')).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Updating SparkyFitness...')
    ).not.toBeInTheDocument();
    expect(mockReload).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
  });

  it('keeps unrelated root errors on the normal fallback UI', () => {
    mockUseRouteError.mockReturnValue(new Error('Unexpected failure'));

    render(<RootErrorBoundary />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unexpected failure')).toBeInTheDocument();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
