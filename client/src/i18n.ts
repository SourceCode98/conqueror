import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enGame from './locales/en/game.json';
import enErrors from './locales/en/errors.json';
import esCommon from './locales/es/common.json';
import esGame from './locales/es/game.json';
import esErrors from './locales/es/errors.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    ns: ['common', 'game', 'errors'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, game: enGame, errors: enErrors },
      es: { common: esCommon, game: esGame, errors: esErrors },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
