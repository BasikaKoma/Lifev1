import { BrandMark } from './BrandMark';
import { APP_NAME } from '../constants/branding';

export function ConfigErrorView({ message }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandMark className="auth-card__logo" size={56} alt="" />
        <h1 className="auth-card__title">{APP_NAME}</h1>
        <p className="auth-card__subtitle">Η εφαρμογή δεν έχει ρυθμιστεί σωστά για cloud sync.</p>
        <p className="auth-form__error">{message}</p>
        <p className="settings-meta">
          Για developers: βάλε το <strong>anon public</strong> key στο <code>.env</code> ως{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, μετά κάνε restart το <code>npm run dev</code>.
        </p>
        <p className="settings-meta">
          Supabase Dashboard → Project Settings → API → <strong>anon public</strong> (όχι service_role).
        </p>
      </div>
    </div>
  );
}
