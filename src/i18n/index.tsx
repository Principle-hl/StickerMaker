import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en, enPlurals } from './en';
import type { Key, PluralForms, PluralKey } from './en';
import { de, dePlurals } from './de';
import { sl, slPlurals } from './sl';

export type Lang = 'en' | 'de' | 'sl';
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'de', label: 'DE', name: 'Deutsch' },
  { id: 'sl', label: 'SL', name: 'Slovenščina' },
];

const DICT: Record<Lang, Record<Key, string>> = { en, de, sl };
const PLURALS: Record<Lang, Record<PluralKey, PluralForms>> = { en: enPlurals, de: dePlurals, sl: slPlurals };
const STORAGE_KEY = 'sticker-cut-line:lang';

type Vars = Record<string, string | number>;

export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key, substituting `{name}` placeholders. */
  t: (key: Key, vars?: Vars) => string;
  /** Translate a message that may be a key (library errors and warnings) or plain text. */
  msg: (keyOrText: string) => string;
  /** Count with the right plural form for the language. */
  plural: (key: PluralKey, n: number) => string;
  /** Millimetre readout with locale decimals: "2,0 mm" in German and Slovenian. */
  mm: (value: number, digits?: number) => string;
  /** A number with locale decimals and no unit. */
  num: (value: number, digits?: number) => string;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'de' || saved === 'sl') return saved;
  } catch {
    // no storage
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'sl') return base;
    if (base === 'en') return 'en';
  }
  return 'en';
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no storage
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = DICT[lang].appTitle;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const dict = DICT[lang];
    const rules = new Intl.PluralRules(lang);
    const numFmt = (digits: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const num = (v: number, digits = 1) => numFmt(digits).format(v);
    return {
      lang,
      setLang,
      t: (key, vars) => fill(dict[key] ?? en[key] ?? key, vars),
      msg: keyOrText => (keyOrText in dict ? dict[keyOrText as Key] : keyOrText),
      plural: (key, n) => {
        const forms = PLURALS[lang][key];
        return fill(forms[rules.select(n)] ?? forms.other, { n: numFmt(0).format(n) });
      },
      mm: (v, digits = 1) => `${num(v, digits)} mm`,
      num,
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx;
}
