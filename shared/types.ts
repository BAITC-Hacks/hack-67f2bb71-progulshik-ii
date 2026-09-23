export type CardField = 'title' | 'context' | 'need' | 'users' | 'data' | 'constraints' | 'expectedResult' | 'successCriteria' | 'contact' | 'interactionFormat';
export type Card = Record<CardField, string>;
export type ReadinessLevel = 'draft' | 'working' | 'ready' | 'priority';
export type TaskStatus = 'draft' | 'published';
export interface ScoreCriterion {
  id: string; label: string; maxPoints: number; points: number;
  fields: CardField[]; missingFields: CardField[]; unconfirmedFields: CardField[]; explanation: string;
}
export interface Rating {
  score: number; level: ReadinessLevel; label: string;
  breakdown: ScoreCriterion[]; missingFields: CardField[]; unconfirmedFields: CardField[];
  recommendations: string[];
}
export interface BusinessTask {
  id: string; rawDescription: string; topic: string; card: Card;
  confirmedFields: CardField[]; status: TaskStatus; revision: number;
  createdAt: string; updatedAt: string; publishedAt: string | null;
  rating: Rating;
  interview?: { source: string; questions: Array<{ id: string; field: CardField; text: string; hint: string }>; answers: Record<string, string> };
}
export interface Team {
  id: string; name: string; interests: string[]; skills: string[]; technologies: string[];
}
export interface Proposal {
  id: string; taskId: string; teamId: string; idea: string; plan: string;
  timeline: string; prototypeUrl: string; status: 'pending' | 'accepted' | 'rejected';
  createdAt: string; updatedAt: string;
}
export interface Question { field: CardField; question: string; reason: string; }
export interface AiAnalysis {
  mode: 'mock' | 'openai' | 'fallback'; questions: Question[];
  suggestedCard: Card; missingFields: CardField[]; warnings: string[];
}
export interface ApiError { error: { code: string; message: string; details?: unknown }; }
