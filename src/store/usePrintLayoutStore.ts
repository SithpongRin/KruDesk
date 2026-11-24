import { create } from 'zustand';

export interface PrintLayoutState {
  /**
   * When true, class-level table sheets bypass multi-page row splitting so `fitPageToOnePage`
   * scales the single unsplit page proportionally into one A4/A3 sheet.
   * Always reset to false when PDF preview closes.
   */
  fitOnePage: boolean;
  setFitOnePage: (fitOnePage: boolean) => void;
}

export const usePrintLayoutStore = create<PrintLayoutState>((set) => ({
  fitOnePage: false,
  setFitOnePage: (fitOnePage) => set({ fitOnePage }),
}));
