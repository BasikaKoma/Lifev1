import { useState } from 'react';
import {
  SUGGESTED_COLOR_ROLES,
  createBriefColor,
  createBriefFact,
  formatProjectBriefForAgent,
  isProjectBriefEmpty,
  normalizeHexColor,
  normalizeProjectBrief,
} from '../utils/projectBrief';

export function ProjectBriefPanel({ projectTitle, brief, onChange }) {
  const data = normalizeProjectBrief(brief);
  const [copied, setCopied] = useState(false);
  const agentContext = formatProjectBriefForAgent({ title: projectTitle, brief: data });

  const patch = (partial) => onChange?.({ ...data, ...partial });

  const updateColor = (id, partial) => {
    patch({
      colors: data.colors.map((color) => (color.id === id ? { ...color, ...partial } : color)),
    });
  };

  const updateFact = (id, partial) => {
    patch({
      facts: data.facts.map((fact) => (fact.id === id ? { ...fact, ...partial } : fact)),
    });
  };

  const copyAgentContext = async () => {
    const text = agentContext || 'PROJECT BRIEF\n(empty)';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.alert(text);
    }
  };

  return (
    <>
      <div className="settings-block">
        <h3 className="settings-block__title">Τι είναι</h3>
        <p className="settings-block__desc">
          Σύντομη περιγραφή του project — τι είναι, για ποιον υπάρχει, τι το ξεχωρίζει.
        </p>
        <textarea
          className="input textarea"
          rows={4}
          value={data.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          placeholder="π.χ. Εφαρμογή προσωπικής εξέλιξης για founders που χτίζουν την επόμενη κίνηση τους."
        />
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Τι κάνει</h3>
        <p className="settings-block__desc">
          Τι προσφέρει στην πράξη: προϊόν, υπηρεσία, βασικές λειτουργίες.
        </p>
        <textarea
          className="input textarea"
          rows={4}
          value={data.purpose}
          onChange={(e) => patch({ purpose: e.target.value })}
          placeholder="π.χ. Roadmap, Lifeline και assistant που βοηθά να προχωράς το business μέρα με τη μέρα."
        />
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Marketing</h3>
        <p className="settings-block__desc">
          Στοιχεία brand που μπορεί να χρησιμοποιεί ο agent σε κείμενα, προτάσεις και ιδέες.
        </p>

        <label className="settings-label" htmlFor="brief-tagline">Tagline</label>
        <input
          id="brief-tagline"
          type="text"
          className="input"
          value={data.tagline}
          onChange={(e) => patch({ tagline: e.target.value })}
          placeholder="Μια φράση που μένει"
        />

        <label className="settings-label" htmlFor="brief-audience">Κοινό</label>
        <textarea
          id="brief-audience"
          className="input textarea"
          rows={3}
          value={data.audience}
          onChange={(e) => patch({ audience: e.target.value })}
          placeholder="Σε ποιους απευθύνεται"
        />

        <label className="settings-label" htmlFor="brief-voice">Τόνος / voice</label>
        <textarea
          id="brief-voice"
          className="input textarea"
          rows={3}
          value={data.voice}
          onChange={(e) => patch({ voice: e.target.value })}
          placeholder="π.χ. Άμεσος, πρακτικός, χωρίς fluff. Ελληνικά καθημερινά."
        />

        <label className="settings-label" htmlFor="brief-website">Website</label>
        <input
          id="brief-website"
          type="url"
          className="input"
          value={data.website}
          onChange={(e) => patch({ website: e.target.value })}
          placeholder="https://"
        />
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Χρώματα</h3>
        <p className="settings-block__desc">
          Παλέτα brand. Ο agent τα παίρνει ως δεδομένα — μην τα αφήσεις κενά αν μετράνε στο marketing.
        </p>
        <div className="project-brief-colors">
          {data.colors.length === 0 && (
            <p className="settings-meta">Δεν έχεις χρώματα ακόμα.</p>
          )}
          {data.colors.map((color) => (
            <div key={color.id} className="project-brief-color">
              <input
                type="color"
                className="project-brief-color__swatch"
                value={normalizeHexColor(color.hex)}
                onChange={(e) => updateColor(color.id, { hex: e.target.value })}
                aria-label={`Χρώμα ${color.name || ''}`}
              />
              <input
                type="text"
                className="input"
                value={color.name}
                onChange={(e) => updateColor(color.id, { name: e.target.value })}
                placeholder="π.χ. Primary"
              />
              <input
                type="text"
                className="input project-brief-color__hex"
                value={color.hex}
                onChange={(e) => updateColor(color.id, { hex: e.target.value })}
                placeholder="#000000"
              />
              <button
                type="button"
                className="btn btn--text btn--sm btn--danger-text"
                onClick={() => patch({ colors: data.colors.filter((item) => item.id !== color.id) })}
              >
                Αφαίρεση
              </button>
            </div>
          ))}
        </div>
        <div className="project-brief-color-add">
          {SUGGESTED_COLOR_ROLES.filter(
            (role) => !data.colors.some((color) => color.name.toLowerCase() === role.toLowerCase())
          ).slice(0, 3).map((role) => (
            <button
              key={role}
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => patch({ colors: [...data.colors, createBriefColor({ name: role })] })}
            >
              + {role}
            </button>
          ))}
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => patch({ colors: [...data.colors, createBriefColor({ name: 'Color' })] })}
          >
            + Χρώμα
          </button>
        </div>
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Επιπλέον δεδομένα</h3>
        <p className="settings-block__desc">
          Ό,τι άλλο πρέπει να ξέρει ο agent: fonts, social, τιμή, ανταγωνιστές, λέξεις που δεν χρησιμοποιούμε.
        </p>
        <div className="project-brief-facts">
          {data.facts.map((fact) => (
            <div key={fact.id} className="project-brief-fact">
              <input
                type="text"
                className="input"
                value={fact.label}
                onChange={(e) => updateFact(fact.id, { label: e.target.value })}
                placeholder="Πεδίο (π.χ. Font)"
              />
              <input
                type="text"
                className="input"
                value={fact.value}
                onChange={(e) => updateFact(fact.id, { value: e.target.value })}
                placeholder="Τιμή (π.χ. Inter)"
              />
              <button
                type="button"
                className="btn btn--text btn--sm btn--danger-text"
                onClick={() => patch({ facts: data.facts.filter((item) => item.id !== fact.id) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => patch({ facts: [...data.facts, createBriefFact()] })}
        >
          + Πεδίο
        </button>
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Οδηγίες για τον agent</h3>
        <p className="settings-block__desc">
          Κανόνες που ο assistant διαβάζει ως δεδομένα: πώς να μιλάει, τι να προτείνει, τι να αποφεύγει.
        </p>
        <textarea
          className="input textarea project-brief-instructions"
          rows={8}
          value={data.agentInstructions}
          onChange={(e) => patch({ agentInstructions: e.target.value })}
          placeholder={'π.χ.\n- Μίλα στα ελληνικά, σύντομα.\n- Μην προτείνεις εκπτώσεις.\n- Τα CTA να είναι πρακτικά, όχι hype.'}
        />
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Context που βλέπει ο agent</h3>
        <p className="settings-block__desc">
          Αυτό το κείμενο περνάει στον assistant μαζί με κάθε ερώτηση για το project.
        </p>
        {isProjectBriefEmpty(data) ? (
          <p className="settings-meta">Γέμισε τα πεδία από πάνω για να φανεί το context.</p>
        ) : (
          <pre className="project-brief-preview">{agentContext}</pre>
        )}
        <button type="button" className="btn btn--outline btn--sm" onClick={copyAgentContext}>
          {copied ? 'Αντιγράφηκε' : 'Αντιγραφή context'}
        </button>
      </div>
    </>
  );
}
