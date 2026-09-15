

export const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const DIGITS = '0123456789'.split('');
export const SIGNS = ['.', ',', '!', '?', ':', ';', '-', '_', '(', ')', '/', '+', '=', '€', '%', '&', '’', '«', '»', '…', '–', '—', '·'];
export const FRENCH_LOWER = ['à', 'â', 'ä', 'æ', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'œ', 'ù', 'û', 'ü', 'ÿ'];
export const FRENCH_UPPER = ['À', 'Â', 'Ä', 'Æ', 'Ç', 'É', 'È', 'Ê', 'Ë', 'Î', 'Ï', 'Ô', 'Œ', 'Ù', 'Û', 'Ü', 'Ÿ'];
export const FRENCH: string[] = [...FRENCH_LOWER, ...FRENCH_UPPER];

// Alle weiteren lateinischen Buchstaben (Spanisch, Portugiesisch, Italienisch,
// Skandinavisch, Osteuropäisch, Türkisch, Vietnamesisch, …) – werden per
// Unicode-Komposition erzeugt, siehe engine/demoGenerator (composeLatin).
// Nicht-lateinische Schriften (Chinesisch, Arabisch, …) sind ausgenommen.
import { EXTENDED_LATIN } from '../engine/demoGenerator';
export { EXTENDED_LATIN };

export const REQUIRED_CHARS: string[] = [...LOWER, ...UPPER, ...DIGITS];
export const ALL_TRAIN_CHARS: string[] = [...LOWER, ...UPPER, ...DIGITS, ...SIGNS, ...FRENCH, ...EXTENDED_LATIN];

export interface OnboardingStep {
  id: 'lower' | 'upper' | 'french' | 'signs' | 'sentences';
  title: string;
  chars: string[];
  hint: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'lower', title: 'Buchstaben', chars: LOWER, hint: 'Schreibe jeden Kleinbuchstaben so, wie du ihn im Alltag schreibst.' },
  { id: 'upper', title: 'Großbuchstaben', chars: UPPER, hint: 'Jetzt die Großbuchstaben – gern mit deinem natürlichen Schwung.' },
  { id: 'french', title: 'Französisch (optional)', chars: FRENCH, hint: 'Alle französischen Buchstaben – nur nötig, wenn du französische Texte schreibst. Alles überspringbar mit „Weiter".' },
  { id: 'signs', title: 'Zahlen & Zeichen', chars: [...DIGITS, ...SIGNS], hint: 'Zahlen und Satzzeichen machen dein Schriftbild komplett.' },
  { id: 'sentences', title: 'Handschrift testen', chars: [], hint: 'Schreibe die Sätze ab – daraus lernt die Engine deine Neigung und Abstände.' },
];

export const TRAIN_SENTENCES: string[] = [
  'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.',
  'Victor jagt zwölf Boxkämpfer quer über den großen Sylter Deich.',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789 – € 42,50 + 8 % & mehr? Ja!',
  'Packt mit an: Fünf Boxer jagen die quirlige Eva über den Deich!',
  'Dès Noël où un zéphyr haï me vêt de glaçons würmiens je dîne d’exquis rôtis de bœuf.',
  'Le garçon pâle mangea çà et là un ex æquo.',
];


export function coverageFor(doneChars: Set<string>, sentencesDone: number, totalSentences: number): number {
  const charPart = (doneChars.size / REQUIRED_CHARS.length) * 82;
  const sentPart = totalSentences > 0 ? (sentencesDone / totalSentences) * 18 : 0;
  return Math.min(100, Math.round(charPart + sentPart));
}
