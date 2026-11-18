// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData, saveProfile } from '../../db/database';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import App from '../App';

describe('App integration with seeded profile', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sidebar and header when a profile is seeded', async () => {
    await saveProfile({
      teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
      schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
      directorName: 'លោក ជា សារ៉ា',
      academicYear: '២០២៦-២០២៧',
    });

    render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );

    // Sidebar displays teacher name, school name, and Offline badge
    // (Desktop and mobile drawer sidebars both render in DOM)
    await waitFor(
      () => {
        expect(screen.getAllByText('លោកគ្រូ សុខ ដារ៉ា').length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 3000 }
    );
    expect(screen.getAllByText('អនុវិទ្យាល័យ ដំណាក់ព្រីង').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Offline').length).toBeGreaterThanOrEqual(1);

    // Header displays class picker & month picker
    expect(screen.getByLabelText('ជ្រើសថ្នាក់')).toBeTruthy();
    expect(screen.getByLabelText('ជ្រើសខែ')).toBeTruthy();
    expect(screen.getByLabelText('ជ្រើសឆ្នាំ')).toBeTruthy();
  });
});
