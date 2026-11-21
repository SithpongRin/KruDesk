// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InstallAppCard } from '../InstallAppCard';
import { usePwaInstallStore, type BeforeInstallPromptEvent } from '../../../store/usePwaInstallStore';

describe('InstallAppCard in Settings', () => {
  beforeEach(() => {
    usePwaInstallStore.setState({
      isInstalled: false,
      isIos: false,
      deferredPrompt: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('hides completely when the app is already installed', () => {
    usePwaInstallStore.setState({
      isInstalled: true,
      isIos: true,
      deferredPrompt: {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      } as unknown as BeforeInstallPromptEvent,
    });

    const { container } = render(<InstallAppCard />);
    expect(container.firstChild).toBeNull();
  });

  it('hides on non-iOS when no beforeinstallprompt event is available (e.g. already installed on desktop)', () => {
    const { container } = render(<InstallAppCard />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Install button when beforeinstallprompt is captured and hides after user accepts', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    usePwaInstallStore.setState({
      isInstalled: false,
      isIos: false,
      deferredPrompt: {
        prompt: promptMock,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      } as unknown as BeforeInstallPromptEvent,
    });

    render(<InstallAppCard />);
    expect(screen.getByTestId('install-app-card')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ដំឡើងកម្មវិធី'));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('install-app-card')).toBeNull();
    });
  });

  it('shows iOS Safari Add to Home Screen instructions on iOS when not installed', () => {
    usePwaInstallStore.setState({
      isInstalled: false,
      isIos: true,
      deferredPrompt: null,
    });

    render(<InstallAppCard />);
    expect(screen.getByTestId('install-app-card')).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });
});
