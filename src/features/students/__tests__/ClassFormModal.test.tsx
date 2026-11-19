// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData } from '../../../db/database';
import { ClassFormModal } from '../ClassFormModal';

describe('ClassFormModal', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('creates the class when pressing Enter in the class-name field', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <ClassFormModal
        isOpen={true}
        onClose={onClose}
        defaultAcademicYear="2026-2027"
        onSaved={onSaved}
      />
    );

    const nameInput = screen.getByLabelText(/ឈ្មោះថ្នាក់/);
    fireEvent.change(nameInput, { target: { value: '៧ខ' } });
    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(async () => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      const classes = await db.classes.toArray();
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('៧ខ');
    });
  });
});
