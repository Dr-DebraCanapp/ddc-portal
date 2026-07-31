/* global React, window */
/* ============================================================
   Send an invoice — the PDF plus a written email
   A page cannot attach a file to a mail draft, so this does the
   only honest version of "attached": save the PDF first, then open
   the email with the wording and payment instructions ready, and
   tell the user to attach the file they just saved.
   Loads AFTER schedule-billing-ui.jsx.
   ============================================================ */
const SD_B = () => window.SchedBill;
const SD_S = () => window.SCHED;

function SendInvoiceModal({ entity, onClose, onSent }) {
  const B = SD_B();
  const e = entity;
  const remote = e.kind === 'remote';
  const doc = remote ? 'statement' : 'invoice';
  const acct = e.account || {};
  const inv = e.invoice || {};
  const [step, setStep] = useState(acct.email ? 'ready' : 'noemail');
  const pay = B.payLines(e);
  const cfg = B.payCfg();

  const hasPdf = step === 'saved' || step === 'sent';
  const saveDoc = () => { B.openDocument(e, 'invoice'); setStep('saved'); };
  /* Only say "attached" if the document was actually opened to be saved —
     otherwise the wording falls back to "…is ready", which is still true. */
  const draft = () => { B.email(e, hasPdf); setStep('sent'); onSent && onSent(e); };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Send · {inv.number}</div>
        <h2 className="sc-modal-h">Email the {doc} to {acct.billTo || acct.name}</h2>
        <p className="sc-modal-sub">
          Two steps, because a browser can’t attach a file to an email for you: save the PDF, then
          we’ll open your mail app with everything written so you can attach it.
        </p>

        <div className="sd-steps">
          <div className={`sd-step ${step !== 'noemail' ? 'on' : ''} ${step === 'saved' || step === 'sent' ? 'done' : ''}`}>
            <span className="n">1</span>
            <div>
              <b>Save the {doc} as a PDF</b>
              <p>Opens the {doc} with a Print / Save as PDF button. Save it somewhere you’ll find it — your Downloads folder is fine.</p>
              <button className="btn btn-clay btn-sm" onClick={saveDoc}>{hasPdf ? 'Open it again' : 'Open ' + doc + ' → save as PDF'}</button>
            </div>
          </div>
          <div className={`sd-step ${hasPdf ? 'on' : ''}`}>
            <span className="n">2</span>
            <div>
              <b>Open the email and attach it</b>
              <p>
                Addressed to {acct.email
                  ? <strong>{acct.email}</strong>
                  : <em>no email on this account — add one under Clinics first</em>}, with the totals, the due date and how to pay already written.
                {hasPdf
                  ? ' Attach the PDF you just saved and send.'
                  : ' Skip step 1 and it won’t mention an attachment — send it as a notice and they can download their own copy from the portal.'}
              </p>
              <button className="btn btn-clay btn-sm" disabled={!acct.email || step === 'noemail'} onClick={draft}>
                {hasPdf ? 'Open email draft' : 'Open email without attachment'}
              </button>
            </div>
          </div>
        </div>

        <details className="sd-preview" open>
          <summary>What the email says{hasPdf ? '' : ' (no attachment)'}</summary>
          <pre>{B.emailBody(e, hasPdf)}</pre>
        </details>

        {!cfg.portalUrl && (
          <div className="sd-warn">No portal address is set, so the email can’t tell them where to sign in. Add <code>payments.portalUrl</code> to <code>config.js</code>.</div>
        )}
        {pay.length <= 1 && (
          <div className="sd-warn">Only one payment method is configured. Fill in <code>payments</code> in <code>config.js</code> (ACH details, card link) so the {doc} tells them every way they can pay.</div>
        )}

        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{step === 'sent' ? 'Done' : 'Cancel'}</button>
          {step === 'sent' && <span className="sd-done">{hasPdf ? '✓ Draft opened — remember to attach the PDF you saved.' : '✓ Draft opened — no attachment mentioned.'}</span>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SendInvoiceModal });
