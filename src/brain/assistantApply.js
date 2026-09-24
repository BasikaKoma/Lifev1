import { ASSISTANT_ACTION_TYPES, COMPUTER_ACTION_TYPES } from './levels';
import { createOpenItem, findOpenItem, setOpenItemStatus } from '../lib/assistant/openItems';
import { sendMail } from '../lib/assistant/mail';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import {
  brainFillText,
  brainOpenPath,
  brainOpenUrl,
  brainWriteText,
  hasElectronBrain,
} from '../platform/brain';

function levelOf(action) {
  return action.projectTitle === 'business' ? 'business' : 'human';
}

function sourceOf(action) {
  const source = action.items?.[0];
  if (source === 'mail' || source === 'call' || source === 'day' || source === 'manual') return source;
  return 'manual';
}

function emailOrEmpty(value) {
  const text = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

async function recordPayment(action) {
  const row = {
    title: action.title,
    amount: action.amount || '',
    counterparty: action.target || '',
    note: action.body || '',
  };
  if (!isSupabaseConfigured()) {
    const key = 'lifev1-payment-records';
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    current.unshift({ ...row, id: `local-${crypto.randomUUID()}`, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(current.slice(0, 40)));
    return row;
  }
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) throw new Error('Δεν έχεις συνδεθεί.');
  const { error } = await supabase.from('payment_records').insert({ ...row, user_id: userId });
  if (error) throw error;
  return row;
}

async function applyComputer(action) {
  if (!hasElectronBrain()) {
    return 'ο υπολογιστής είναι μόνο στο desktop — εδώ μόνο ανάγνωση';
  }
  if (action.type === 'computer_open') {
    if (/^https?:\/\//i.test(action.target)) {
      await brainOpenUrl(action.target);
      return `άνοιξα ${action.target}`;
    }
    await brainOpenPath(action.rootId, action.relativePath);
    return `άνοιξα ${action.relativePath || action.title}`;
  }
  if (action.type === 'computer_write') {
    await brainWriteText(action.rootId, action.relativePath, action.body || '');
    return `έγραψα ${action.relativePath}`;
  }
  const pairs = (action.items || [])
    .map((line) => {
      const splitAt = String(line).indexOf('=>');
      if (splitAt <= 0) return null;
      return {
        from: line.slice(0, splitAt).trim(),
        to: line.slice(splitAt + 2).trim(),
      };
    })
    .filter((pair) => pair?.from);
  await brainFillText(action.rootId, action.relativePath, pairs);
  return `συμπλήρωσα ${action.relativePath}`;
}

export async function applyAssistantActions(actions = []) {
  const parts = [];
  const errors = [];
  for (const action of actions) {
    if (!ASSISTANT_ACTION_TYPES.includes(action.type)) continue;
    try {
      if (action.type === 'create_open_item') {
        const item = await createOpenItem({
          title: action.title,
          body: action.body,
          dueOn: action.dueOn,
          level: levelOf(action),
          source: sourceOf(action),
          sourceRef: action.target,
        });
        parts.push(`εκκρεμότητα «${item.title}»`);
        continue;
      }
      if (action.type === 'complete_open_item' || action.type === 'delete_open_item') {
        const found = await findOpenItem(action.target || action.title);
        if (!found) {
          errors.push(`δεν βρήκα την εκκρεμότητα «${action.title}»`);
          continue;
        }
        await setOpenItemStatus(found.id, action.type === 'delete_open_item' ? 'deleted' : 'done');
        parts.push(action.type === 'delete_open_item'
          ? `έσβησα την εκκρεμότητα «${found.title}»`
          : `έκλεισα την εκκρεμότητα «${found.title}»`);
        continue;
      }
      if (action.type === 'send_mail') {
        await sendMail({
          gmailId: emailOrEmpty(action.target) ? '' : action.target,
          to: emailOrEmpty(action.target),
          subject: action.title,
          body: action.body,
        });
        parts.push(`έστειλα το mail «${action.title}»`);
        continue;
      }
      if (action.type === 'commit_customer') {
        const item = await createOpenItem({
          title: action.title,
          body: action.body,
          dueOn: action.dueOn,
          level: 'business',
          source: 'commitment',
          sourceRef: action.target,
        });
        parts.push(`κράτησα τη δέσμευση «${item.title}». Δεν στάλθηκε τίποτα στον πελάτη`);
        continue;
      }
      if (action.type === 'record_payment') {
        await recordPayment(action);
        parts.push(`κατέγραψα την πληρωμή «${action.title}». Δεν μετακινήθηκαν χρήματα`);
        continue;
      }
      if (COMPUTER_ACTION_TYPES.includes(action.type)) {
        parts.push(await applyComputer(action));
      }
    } catch (err) {
      errors.push(err.message || `απέτυχε το ${action.type}`);
    }
  }
  const message = [
    parts.length ? `Έτοιμο: ${parts.join(', ')}.` : '',
    errors.length ? errors.join(' ') : '',
  ].filter(Boolean).join(' ');
  return {
    created: parts.length > 0,
    message: message || null,
    error: parts.length ? null : (errors[0] || null),
  };
}

export async function applyReadyActions(actions, applyProject) {
  const assistant = (actions || []).filter((item) => ASSISTANT_ACTION_TYPES.includes(item.type));
  const project = (actions || []).filter((item) => !ASSISTANT_ACTION_TYPES.includes(item.type));
  const assistantResult = assistant.length ? await applyAssistantActions(assistant) : null;
  let projectResult = null;
  if (project.length && applyProject) {
    projectResult = await applyProject(project);
  }
  const message = [projectResult?.message, assistantResult?.message].filter(Boolean).join(' ');
  return {
    created: Boolean(projectResult?.created || assistantResult?.created),
    message: message || null,
    error: projectResult?.error || assistantResult?.error || null,
  };
}
