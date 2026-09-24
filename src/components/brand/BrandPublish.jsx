import { useEffect, useMemo, useState } from 'react';
import { uploadBrandPublishImage } from '../../lib/brand/media';
import { captionForMeta, formatIgHandle, publishToMeta } from '../../lib/meta';
import { nowIso } from '../../lib/brand/schema';

export function BrandPublish({
  item,
  metaStatus,
  onOpenMeta,
  onConnectMeta,
  onPublished,
}) {
  const [facebookOn, setFacebookOn] = useState(true);
  const [instagramOn, setInstagramOn] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const connected = Boolean(metaStatus?.connected);
  const canFacebook = Boolean(metaStatus?.can_publish_facebook);
  const canInstagram = Boolean(metaStatus?.can_publish_instagram);
  const needsReconnect = Boolean(metaStatus?.needs_publish_reconnect || (connected && !canFacebook && !canInstagram));

  useEffect(() => {
    setFacebookOn(Boolean(metaStatus?.facebook));
    setInstagramOn(Boolean(metaStatus?.instagram));
  }, [metaStatus?.facebook, metaStatus?.instagram]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const caption = useMemo(() => {
    if (instagramOn && !facebookOn) return captionForMeta(item, 'instagram');
    return captionForMeta(item, 'facebook');
  }, [item, facebookOn, instagramOn]);

  const onPickFile = (event) => {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : '');
    setError('');
    setResult(null);
  };

  const handlePublish = async () => {
    if (!item) return;
    const platforms = [
      facebookOn ? 'facebook' : null,
      instagramOn ? 'instagram' : null,
    ].filter(Boolean);
    if (!platforms.length) {
      setError('Διάλεξε Facebook, Instagram ή και τα δύο.');
      return;
    }
    if (platforms.includes('instagram') && !file) {
      setError('Το Instagram χρειάζεται εικόνα.');
      return;
    }
    if (platforms.includes('facebook') && !caption && !file) {
      setError('Γράψε draft ή πρόσθεσε εικόνα.');
      return;
    }

    setBusy(true);
    setError('');
    setResult(null);
    try {
      const imageUrl = file ? await uploadBrandPublishImage(file, item.id) : null;
      const payload = await publishToMeta({
        platforms,
        caption,
        imageUrl,
        itemId: item.id,
      });
      const results = payload?.results || {};
      setResult(results);
      const permalinks = {
        facebook: results.facebook?.ok ? results.facebook.permalink : null,
        instagram: results.instagram?.ok ? results.instagram.permalink : null,
      };
      const publishedUrl = permalinks.instagram || permalinks.facebook || item.publishedUrl || '';
      onPublished?.({
        ...item,
        stage: 'published',
        publishedAt: nowIso(),
        publishedUrl,
        variations: {
          ...(item.variations || {}),
          _published: permalinks,
        },
      });
    } catch (err) {
      setError(err.message || 'Αποτυχία δημοσίευσης.');
    } finally {
      setBusy(false);
    }
  };

  if (!item) return null;

  return (
    <section className="brand-card">
      <p className="brand-card__title">Publish to Meta</p>
      {!connected ? (
        <>
          <p className="brand-empty" style={{ marginTop: 10 }}>
            Σύνδεσε Facebook Page / Instagram για να ανέβει το draft.
          </p>
          <button type="button" className="brand-btn brand-btn--outline" style={{ marginTop: 10 }} onClick={onOpenMeta}>
            Connect Meta
          </button>
        </>
      ) : needsReconnect ? (
        <>
          <p className="brand-empty" style={{ marginTop: 10 }}>
            Η σύνδεση είναι μόνο για ανάγνωση. Ξανασύνδεσε για δικαιώματα δημοσίευσης. Στο Meta app ενεργοποίησε
            {' '}<code>pages_manage_posts</code> και <code>instagram_content_publish</code> αν βγει Invalid Scopes.
          </p>
          <button type="button" className="brand-btn brand-btn--green" style={{ marginTop: 10 }} onClick={onConnectMeta}>
            Ενεργοποίηση δημοσίευσης
          </button>
        </>
      ) : (
        <>
          <p className="brand-empty" style={{ marginTop: 10 }}>
            {metaStatus?.facebook?.page_name || '—'}
            {metaStatus?.instagram?.ig_username ? ` · ${formatIgHandle(metaStatus.instagram.ig_username)}` : ''}
          </p>
          <div className="brand-platforms" style={{ marginTop: 10 }}>
            <button
              type="button"
              aria-pressed={facebookOn}
              disabled={!canFacebook}
              onClick={() => setFacebookOn((value) => !value)}
            >
              Facebook
            </button>
            <button
              type="button"
              aria-pressed={instagramOn}
              disabled={!canInstagram}
              onClick={() => setInstagramOn((value) => !value)}
            >
              Instagram
            </button>
          </div>
          {!canInstagram ? (
            <p className="brand-empty" style={{ marginTop: 8 }}>
              Instagram απενεργοποιημένο μέχρι να συνδεθεί Professional στη Page.
            </p>
          ) : null}
          <label className="brand-publish__file" style={{ marginTop: 12 }}>
            Εικόνα {instagramOn ? '(υποχρεωτική για IG)' : '(προαιρετική για Facebook)'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickFile} />
          </label>
          {preview ? <img src={preview} alt="" className="brand-publish__preview" /> : null}
          {error ? <p className="brand-error" style={{ marginTop: 10 }}>{error}</p> : null}
          {result ? (
            <ul className="brand-publish__results">
              {result.facebook ? (
                <li>
                  Facebook: {result.facebook.ok
                    ? (result.facebook.permalink
                      ? <a href={result.facebook.permalink} target="_blank" rel="noreferrer">άνοιξε post</a>
                      : 'δημοσιεύτηκε')
                    : result.facebook.error}
                </li>
              ) : null}
              {result.instagram ? (
                <li>
                  Instagram: {result.instagram.ok
                    ? (result.instagram.permalink
                      ? <a href={result.instagram.permalink} target="_blank" rel="noreferrer">άνοιξε post</a>
                      : 'δημοσιεύτηκε')
                    : result.instagram.error}
                </li>
              ) : null}
            </ul>
          ) : null}
          <button
            type="button"
            className="brand-btn brand-btn--green"
            style={{ marginTop: 12 }}
            disabled={busy || (!facebookOn && !instagramOn)}
            onClick={handlePublish}
          >
            {busy ? 'Ανέβασμα…' : 'Publish'}
          </button>
        </>
      )}
    </section>
  );
}
