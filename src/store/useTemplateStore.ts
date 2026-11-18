import { create } from 'zustand';
import type { CardTemplate } from '../types/template';
import type { PrintSettings } from '../types/print';
import {
  defaultPrintSettings,
  defaultReferenceTemplate,
  templateBattambangBottomPhoto,
  PREDEFINED_TEMPLATES,
  TEMPLATE_1_ID,
  TEMPLATE_2_ID,
} from '../db/defaultTemplates';
import { db } from '../db/database';
import {
  calculateA4GridLayout,
  PHOTO_3X4_HEIGHT_MM,
  PHOTO_3X4_WIDTH_MM,
  LEGACY_PHOTO_HEIGHT_MM,
  LEGACY_PHOTO_WIDTH_MM,
} from '../utils/cardSizes';
import { MOEYS_EMBLEM_DATA_URI, resolveFlourishUrl } from '../utils/assets';

export interface CardExactSizeOptions {
  whiteMarginMm?: number;
  photoWidthMm?: number;
  photoHeightMm?: number;
}

interface TemplateStoreState {
  currentTemplate: CardTemplate;
  printSettings: PrintSettings;
  isCustomized: boolean;
  isInitialized: boolean;

  setTemplate: (template: CardTemplate) => void;
  updateTemplateField: <K extends keyof CardTemplate>(key: K, value: CardTemplate[K]) => void;
  setCardDimensions: (widthMm: number, heightMm: number, exact?: CardExactSizeOptions) => void;
  resetToReferenceTemplate: () => Promise<void>;
  saveTemplate: () => Promise<void>;

  setPrintSettings: (settings: PrintSettings) => void;
  updatePrintSetting: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void;
  savePrintSettings: () => Promise<void>;
  resetPrintSettings: () => void;

  /** Seeds default templates into KruDeskDB if absent, then hydrates store. */
  loadFromDatabase: () => Promise<void>;
  /** Switches active template using the saved copy in KruDeskDB. */
  selectTemplate: (templateId: string) => Promise<void>;
}

const ACTIVE_TEMPLATE_KEY = 'activeTemplateId';

async function ensureDefaultCardTemplatesInDb(): Promise<void> {
  const existingRef1 = await db.templates.get(TEMPLATE_1_ID);
  if (!existingRef1) {
    await db.templates.put(defaultReferenceTemplate);
  } else {
    await db.templates.update(TEMPLATE_1_ID, {
      flourishUrl: resolveFlourishUrl(existingRef1.flourishUrl),
      emblemUrl: MOEYS_EMBLEM_DATA_URI,
      ...(existingRef1.useExactPhotoSize ? {} : { photoBoxWidthMm: 30, photoBoxHeightMm: 40 }),
    });
  }

  const existingRef2 = await db.templates.get(TEMPLATE_2_ID);
  if (!existingRef2) {
    await db.templates.put(templateBattambangBottomPhoto);
  } else {
    await db.templates.update(TEMPLATE_2_ID, {
      flourishUrl: resolveFlourishUrl(existingRef2.flourishUrl),
      emblemUrl: MOEYS_EMBLEM_DATA_URI,
      ...(existingRef2.useExactPhotoSize ? {} : { photoBoxWidthMm: 30, photoBoxHeightMm: 40 }),
    });
  }

  // Upgrade legacy 2.1x3cm exact box default to 2.7x3.5cm real 3x4 photo size
  const all = await db.templates.toArray();
  for (const t of all) {
    if (
      t.useExactPhotoSize &&
      t.photoBoxWidthMm === LEGACY_PHOTO_WIDTH_MM &&
      t.photoBoxHeightMm === LEGACY_PHOTO_HEIGHT_MM
    ) {
      await db.templates.update(t.id, {
        photoBoxWidthMm: PHOTO_3X4_WIDTH_MM,
        photoBoxHeightMm: PHOTO_3X4_HEIGHT_MM,
      });
    }
  }
}

export const useTemplateStore = create<TemplateStoreState>((set, get) => ({
  currentTemplate: { ...defaultReferenceTemplate },
  printSettings: { ...defaultPrintSettings },
  isCustomized: false,
  isInitialized: false,

  setTemplate: (template) =>
    set({
      currentTemplate: template,
      isCustomized: template.id !== defaultReferenceTemplate.id,
    }),

  updateTemplateField: (key, value) => {
    const updated = {
      ...get().currentTemplate,
      [key]: value,
      updatedAt: Date.now(),
    };
    set({
      currentTemplate: updated,
      isCustomized: true,
    });
  },

  setCardDimensions: (widthMm: number, heightMm: number, exact?: CardExactSizeOptions) => {
    const layout = calculateA4GridLayout(widthMm, heightMm);
    const updatedTemplate: CardTemplate = {
      ...get().currentTemplate,
      cardWidthMm: widthMm,
      cardHeightMm: heightMm,
      whiteMarginMm: exact?.whiteMarginMm,
      useExactPhotoSize: !!(exact?.photoWidthMm && exact?.photoHeightMm),
      ...(exact?.photoWidthMm && exact?.photoHeightMm
        ? { photoBoxWidthMm: exact.photoWidthMm, photoBoxHeightMm: exact.photoHeightMm }
        : {}),
      updatedAt: Date.now(),
    };
    const updatedPrintSettings: PrintSettings = {
      ...get().printSettings,
      cardWidthMm: widthMm,
      cardHeightMm: heightMm,
      gridColumns: layout.cols as PrintSettings['gridColumns'],
      gridRows: layout.rows as PrintSettings['gridRows'],
      cardsPerPage: layout.cardsPerPage as PrintSettings['cardsPerPage'],
      marginLeftMm: layout.marginLeftMm,
      marginTopMm: layout.marginTopMm,
    };
    set({
      currentTemplate: updatedTemplate,
      printSettings: updatedPrintSettings,
      isCustomized: true,
    });
  },

  resetToReferenceTemplate: async () => {
    const freshRef = { ...defaultReferenceTemplate, updatedAt: Date.now() };
    await db.templates.put(freshRef);
    await db.settings.put({ key: ACTIVE_TEMPLATE_KEY, value: freshRef.id });
    set({
      currentTemplate: freshRef,
      isCustomized: false,
    });
  },

  saveTemplate: async () => {
    const current = get().currentTemplate;
    await db.templates.put(current);
    await db.settings.put({ key: ACTIVE_TEMPLATE_KEY, value: current.id });
  },

  setPrintSettings: (settings) => set({ printSettings: settings }),

  updatePrintSetting: (key, value) => {
    set({
      printSettings: {
        ...get().printSettings,
        [key]: value,
      },
    });
  },

  savePrintSettings: async () => {
    const current = get().printSettings;
    await db.settings.put({ key: 'printSettings', value: current });
  },

  resetPrintSettings: () => set({ printSettings: { ...defaultPrintSettings } }),

  loadFromDatabase: async () => {
    await ensureDefaultCardTemplatesInDb();
    const active = await db.settings.get(ACTIVE_TEMPLATE_KEY);
    const activeId = (active?.value as string) || defaultReferenceTemplate.id;
    const saved =
      (await db.templates.get(activeId)) ||
      (await db.templates.get(defaultReferenceTemplate.id)) ||
      defaultReferenceTemplate;
    const savedPrint = await db.settings.get('printSettings');
    set({
      currentTemplate: { ...saved },
      printSettings: {
        ...defaultPrintSettings,
        ...((savedPrint?.value as Partial<PrintSettings>) || {}),
      },
      isCustomized: saved.id !== defaultReferenceTemplate.id,
      isInitialized: true,
    });
  },

  selectTemplate: async (templateId: string) => {
    const saved =
      (await db.templates.get(templateId)) ||
      PREDEFINED_TEMPLATES.find((t) => t.id === templateId);
    if (!saved) return;
    set({
      currentTemplate: { ...saved },
      isCustomized: saved.id !== defaultReferenceTemplate.id,
    });
    await db.settings.put({ key: ACTIVE_TEMPLATE_KEY, value: saved.id });
  },
}));
