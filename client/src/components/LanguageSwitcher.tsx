import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  function toggle() {
    i18n.changeLanguage(i18n.language.startsWith('es') ? 'en' : 'es');
  }

  return (
    <button
      className="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-gray-600 hover:border-gray-400"
      onClick={toggle}
      title={t('language')}
    >
      {i18n.language.startsWith('es') ? '🇺🇸 EN' : '🇪🇸 ES'}
    </button>
  );
}
