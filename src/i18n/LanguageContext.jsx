import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import mn from './mn.js';

const STORAGE_KEY = 'fleetnova_lang';
const LanguageContext = createContext(null);

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'mn' || saved === 'en') return saved;
  } catch {
    // storage unavailable
  }
  return 'mn';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  // Source strings are English and double as dictionary keys; unknown keys fall back to English.
  const t = useCallback(
    (text, vars) => {
      let out = lang === 'mn' ? mn[text] ?? text : text;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      }
      return out;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, tr: t, locale: lang === 'mn' ? 'mn-MN' : 'en-US' }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used within a LanguageProvider');
  return ctx;
}
