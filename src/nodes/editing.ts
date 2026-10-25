import { create } from 'zustand';

/** The card whose text is being edited: its formatting bar takes the place of the card's own toolbar. */
export const useEditingCard = create<{ id: string | null }>(() => ({ id: null }));
