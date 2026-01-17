/**
 * Avatar color utilities
 * Provides consistent color assignment for medication avatars
 */

import { AppColors } from '@/constants/theme';

/**
 * Get consistent pastel color based on medication name
 * Uses a hash function to ensure same name always gets same color
 */
export function getColorForName(name: string): string {
  // Hash the name to get a consistent number
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use absolute value of hash to pick a color
  const index = Math.abs(hash) % AppColors.avatarColors.length;
  return AppColors.avatarColors[index];
}

/**
 * Get first letter of name for avatar
 */
export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}
