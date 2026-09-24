import { userAskedToCreate } from './router';
import { normalizeSearchText } from './snapshot/loadAppCatalog';

export const HUMAN_DOMAINS = [
  { id: 'day', label: 'Μέρα' },
  { id: 'body', label: 'Σώμα' },
  { id: 'time', label: 'Χρόνος' },
  { id: 'communication', label: 'Επικοινωνία' },
  { id: 'people', label: 'Άνθρωποι' },
  { id: 'money', label: 'Χρήμα' },
  { id: 'work', label: 'Δουλειά' },
  { id: 'obligations', label: 'Υποχρεώσεις' },
  { id: 'home', label: 'Σπίτι' },
  { id: 'memory', label: 'Μνήμη' },
];

export const BUSINESS_DOMAINS = [
  { id: 'cash', label: 'Ταμείο' },
  { id: 'customers', label: 'Πελάτες' },
  { id: 'sales', label: 'Πωλήσεις' },
  { id: 'prices', label: 'Τιμές' },
  { id: 'operations', label: 'Λειτουργία' },
  { id: 'people', label: 'Άνθρωποι' },
  { id: 'suppliers', label: 'Προμηθευτές' },
  { id: 'documents', label: 'Έγγραφα' },
  { id: 'image', label: 'Εικόνα προς τα έξω' },
  { id: 'risk', label: 'Κίνδυνος της εβδομάδας' },
];

export const ERP_DOMAINS = [
  'cash',
  'customers',
  'sales',
  'prices',
  'operations',
  'people',
  'suppliers',
  'documents',
];

export const ASSISTANT_ACTION_TYPES = [
  'create_open_item',
  'complete_open_item',
  'delete_open_item',
  'send_mail',
  'commit_customer',
  'record_payment',
  'computer_open',
  'computer_write',
  'computer_fill',
];

export const OUTBOUND_ACTION_TYPES = [
  'send_mail',
  'record_payment',
  'delete_open_item',
  'commit_customer',
];

export const COMPUTER_ACTION_TYPES = [
  'computer_open',
  'computer_write',
  'computer_fill',
];

const COMPUTER_RE = /ανοιξ|γραψ|συμπληρ|open|write|fill/;

export function userAskedForComputer(question) {
  return COMPUTER_RE.test(normalizeSearchText(question));
}

export function holdActions(actions, question) {
  const list = Array.isArray(actions) ? actions : [];
  const holdProjectBatch = list.some((item) => item.type === 'create_project') && !userAskedToCreate(question);
  const computerAsked = userAskedForComputer(question);
  const hold = [];
  const run = [];
  for (const action of list) {
    const outbound = OUTBOUND_ACTION_TYPES.includes(action.type);
    const computer = COMPUTER_ACTION_TYPES.includes(action.type);
    const project = !ASSISTANT_ACTION_TYPES.includes(action.type);
    if (outbound || (computer && !computerAsked) || (project && holdProjectBatch)) hold.push(action);
    else run.push(action);
  }
  return { hold, run };
}

export function actionLabel(action) {
  const labels = {
    send_mail: 'Αποστολή mail',
    record_payment: 'Καταγραφή πληρωμής',
    delete_open_item: 'Διαγραφή εκκρεμότητας',
    commit_customer: 'Δέσμευση σε πελάτη',
    computer_open: 'Άνοιγμα στον υπολογιστή',
    computer_write: 'Εγγραφή αρχείου',
    computer_fill: 'Συμπλήρωση αρχείου',
    create_open_item: 'Νέα εκκρεμότητα',
    complete_open_item: 'Ολοκλήρωση εκκρεμότητας',
    create_project: 'Νέο project',
  };
  return labels[action?.type] || action?.type || 'Ενέργεια';
}

export function assistantInstructionBlock(kind) {
  const briefing = kind === 'morning'
    ? `MORNING BRIEFING. Answer in three short parts, in the user's language: (1) what happened, from SNAPSHOT.lifeline, SNAPSHOT.assistant.calls, and mail already handled; (2) what is still open, from SNAPSHOT.assistant.openItems, especially due today or overdue; (3) exactly one next move. Do not invent numbers.`
    : kind === 'evening'
      ? `EVENING BRIEFING. Say what was scheduled (open items due today, the day's todos) and what actually happened (completed work, day notes, calls). Keep it short. Do not add a new advice list.`
      : kind === 'business'
        ? `BUSINESS BRIEFING. Cover cash, customers, sales, prices, operations, people, suppliers, documents, the outward image in SNAPSHOT.brand, and the risk of the week. Then give ONE recommendation. Call request_erp for each domain you need before you recommend. Cite the figures from TOOL RESULTS or SNAPSHOT.assistant.erp. If erp.connected is false, say the picture is incomplete and do not invent figures.`
        : '';

  return `ONE ASSISTANT, TWO LEVELS.
Human domains: day, body, time, communication, people, money, work, obligations, home, memory.
Business domains: cash, customers, sales, prices, operations, people, suppliers, documents, outward image, weekly risk.
SNAPSHOT.assistant is the live pack: open items, mail summaries, ERP snapshots, recent calls, payment records.
JOBS YOU CAN ACTUALLY DO:
- Mail: call list_mail to read summaries. Draft a reply in send_mail.body using MEMORY style and writing_example. You never send it. The app asks for yes. You never see the mailbox token.
- Open items: create_open_item and complete_open_item. delete_open_item always waits for yes. dueOn is YYYY-MM-DD or "". projectTitle is "human" or "business". items[0] is mail, call, day, or manual. target is a source id when you have one. The morning briefing reads this list.
- Computer: only when SNAPSHOT.assistant.computer is "act" (desktop app). Emit computer_open, computer_write, or computer_fill. rootId comes from LOCAL FILES. relativePath stays inside that folder. computer_fill items are "find => replace". On web and mobile computer is "read": do not emit those actions. Say the computer works only in the desktop app, and here you can only read.
OUTBOUND ALWAYS WAITS FOR YES: send_mail, record_payment, delete_open_item, commit_customer. record_payment only stores the decision; it does not move money. commit_customer stores the promise as an open item; it does not message the customer. If they also need a mail, add a separate send_mail.
Unused action strings (dueOn, target, rootId, relativePath, amount, stageTitle, projectTitle, body) must be "".
Never print API keys, OAuth tokens, or Authorization headers.
${briefing}`;
}
