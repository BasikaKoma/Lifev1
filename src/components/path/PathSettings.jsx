import { useState } from 'react';
import { createEmptyTemplate } from '../../lib/path/schema';
import { formatDuration, plannedDayMinutes } from '../../lib/path/logic';
import { ConfirmDialog } from '../ConfirmDialog';
import { PathModal, TemplateFields } from './PathFields';
import { PathTemplateWeek } from './PathTemplateWeek';

export function PathSettingsButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`path-tabs__settings${active ? ' is-active' : ''}`}
      aria-label="Ρυθμίσεις"
      aria-pressed={active}
      title="Ρυθμίσεις"
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

/** Path settings: the template week, laid out like the real week it fills. */
export function PathSettings({ path }) {
  const [editor, setEditor] = useState(null);
  const [pendingRemove, setPendingRemove] = useState(null);

  const goals = path.goals.filter((goal) => goal.status !== 'Archived');
  const isExisting = Boolean(editor && path.templates.some((template) => template.id === editor.id));
  const weekMinutes = plannedDayMinutes(path.templates.filter((template) => template.enabled));

  const openNew = (weekday = 1, startTime = null) => {
    setEditor({ ...createEmptyTemplate({ weekday, startTime, duration: 60 }), title: '' });
  };

  const moveTemplate = (templateId, { weekday, startTime }) => {
    const current = path.templates.find((template) => template.id === templateId);
    if (!current || (current.weekday === weekday && current.startTime === startTime)) return;
    path.upsertTemplate({ ...current, weekday, startTime });
  };

  const save = () => {
    if (!editor?.title?.trim()) return;
    path.upsertTemplate({ ...editor, title: editor.title.trim() });
    setEditor(null);
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    path.removeTemplate(pendingRemove.id);
    if (editor?.id === pendingRemove.id) setEditor(null);
    setPendingRemove(null);
  };

  return (
    <section className="path-settings">
      <header className="path-settings__head">
        <div>
          <h2>Template εβδομάδας</h2>
          <p className="path-empty">
            Έτσι ξεκινάει κάθε νέα εβδομάδα στο Week: κάθε block εδώ μπαίνει αυτόματα την ίδια μέρα και ώρα.
            Κλικ σε κενή ώρα για νέο, σύρε ένα block για να αλλάξεις μέρα ή ώρα.
          </p>
        </div>
        <div className="path-settings__summary">
          <span className="path-card__meta">
            {path.templates.length} templates{weekMinutes ? ` · ${formatDuration(weekMinutes)} την εβδομάδα` : ''}
          </span>
          <button type="button" className="btn btn--primary" onClick={() => openNew()}>Νέο template</button>
        </div>
      </header>

      <PathTemplateWeek
        templates={path.templates}
        goals={path.goals}
        onOpen={setEditor}
        onNew={openNew}
        onMove={moveTemplate}
      />

      <PathModal open={Boolean(editor)} title={isExisting ? 'Επεξεργασία template' : 'Νέο template'} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <p className="path-empty" style={{ marginBottom: 12 }}>
              Κάθε εβδομάδα μπαίνει ένα block αυτή τη μέρα. Αν σβήσεις ένα από αυτά, σβήνεται μόνο εκείνη η εβδομάδα.
              {isExisting ? ' Οι αλλαγές ισχύουν για εβδομάδες που δεν έχουν ακόμα block.' : ''}
            </p>
            <TemplateFields
              template={editor}
              goals={goals}
              onChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))}
            />
            <div className="path-modal__actions">
              {isExisting ? (
                <button type="button" className="btn btn--danger" onClick={() => setPendingRemove(editor)}>Διαγραφή</button>
              ) : null}
              <button type="button" className="btn" onClick={() => setEditor(null)}>Ακύρωση</button>
              <button type="button" className="btn btn--primary" onClick={save} disabled={!editor.title?.trim()}>
                Αποθήκευση
              </button>
            </div>
          </>
        ) : null}
      </PathModal>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Διαγραφή template"
        message={`Να διαγραφεί το «${pendingRemove?.title || 'template'}»; Τα επόμενα blocks του που δεν έχουν ξεκινήσει σβήνονται· όσα έγιναν μένουν.`}
        confirmLabel="Διαγραφή"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
