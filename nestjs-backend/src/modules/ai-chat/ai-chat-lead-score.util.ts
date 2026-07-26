import { Injectable } from '@nestjs/common';
import type { AiChatIntent } from '@prisma/client';

export type LeadScoreBreakdown = Record<string, number>;

export function computeLeadScore(parts: {
  intent?: AiChatIntent | null;
  hasLocation?: boolean;
  hasBudget?: boolean;
  hasTimeline?: boolean;
  hasContactConsent?: boolean;
  requestedHuman?: boolean;
  viewedListings?: number;
  isSpam?: boolean;
}): { score: number; breakdown: LeadScoreBreakdown } {
  const breakdown: LeadScoreBreakdown = {};
  if (parts.isSpam) {
    breakdown.spam = -50;
    return { score: 0, breakdown };
  }
  if (parts.intent && parts.intent !== 'UNKNOWN' && parts.intent !== 'GENERAL_QUESTION') {
    breakdown.clearIntent = 15;
  }
  if (parts.hasLocation) breakdown.location = 10;
  if (parts.hasBudget) breakdown.budget = 10;
  if (parts.hasTimeline) breakdown.timeline = 10;
  if (parts.hasContactConsent) breakdown.contactConsent = 20;
  if (parts.requestedHuman) breakdown.humanRequest = 20;
  if (parts.viewedListings && parts.viewedListings > 0) {
    breakdown.viewedListings = Math.min(10, parts.viewedListings * 2);
  }
  const score = Math.min(100, Math.max(0, Object.values(breakdown).reduce((s, n) => s + n, 0)));
  return { score, breakdown };
}

export function leadScoreCategory(score: number): 'low' | 'medium' | 'quality' | 'priority' {
  if (score >= 80) return 'priority';
  if (score >= 60) return 'quality';
  if (score >= 30) return 'medium';
  return 'low';
}

@Injectable()
export class AiChatLeadService {
  // scoring helpers exported as functions; service used for future extensions
}
