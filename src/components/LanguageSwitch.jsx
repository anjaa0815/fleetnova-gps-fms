import React from 'react';
import { Languages } from 'lucide-react';
import { useT } from '../i18n/LanguageContext.jsx';

export default function LanguageSwitch({ style }) {
  const { lang, setLang } = useT();
  const next = lang === 'mn' ? 'en' : 'mn';

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => setLang(next)}
      title={lang === 'mn' ? 'Switch to English' : 'Монгол хэл рүү шилжих'}
      aria-label={lang === 'mn' ? 'Switch to English' : 'Монгол хэл рүү шилжих'}
      style={style}
    >
      <Languages size={14} />
      <span>{lang === 'mn' ? 'MN' : 'EN'}</span>
    </button>
  );
}
