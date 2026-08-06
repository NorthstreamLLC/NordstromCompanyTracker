import type { Direction, Frequency } from '@finscope/core';

/**
 * One-tap starting points for the setup flow. The whole point of recurring
 * entry is that the user types as little as possible, so the common items come
 * pre-labelled with a sensible category, frequency and fixed/flexible flag.
 */
export interface Preset {
  name: string;
  categorySlug: string;
  direction: Direction;
  frequency: Frequency;
  isFixed: boolean;
}

export const INCOME_PRESETS: Preset[] = [
  { name: 'Salary', categorySlug: 'salary', direction: 'inflow', frequency: 'biweekly', isFixed: true },
  { name: 'Partner salary', categorySlug: 'salary', direction: 'inflow', frequency: 'biweekly', isFixed: true },
  { name: 'Freelance income', categorySlug: 'freelance', direction: 'inflow', frequency: 'monthly', isFixed: false },
  { name: 'Rental income', categorySlug: 'rental-income', direction: 'inflow', frequency: 'monthly', isFixed: true },
];

export const EXPENSE_PRESETS: Preset[] = [
  { name: 'Rent', categorySlug: 'rent', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Mortgage', categorySlug: 'mortgage', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Utilities', categorySlug: 'utilities', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Insurance', categorySlug: 'insurance', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Car payment', categorySlug: 'transport', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Childcare', categorySlug: 'childcare', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Groceries', categorySlug: 'groceries', direction: 'outflow', frequency: 'weekly', isFixed: false },
  { name: 'Dining out', categorySlug: 'restaurants', direction: 'outflow', frequency: 'monthly', isFixed: false },
  { name: 'Streaming', categorySlug: 'streaming', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Phone', categorySlug: 'utilities', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Gym', categorySlug: 'fitness', direction: 'outflow', frequency: 'monthly', isFixed: true },
  { name: 'Credit card payment', categorySlug: 'debt-payment', direction: 'outflow', frequency: 'monthly', isFixed: true },
];
