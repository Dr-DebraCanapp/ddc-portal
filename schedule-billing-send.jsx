/* global React, window */
/* ============================================================
   Send an invoice or statement

   When email is set up this is one step: the invoice itself is the
   email — laid out, totalled, with the payment instructions — sent
   from the practice address. No PDF to save, nothing to attach.

   Without email it falls back to the old honest two-step: save the
   PDF, then open a draft in your own mail program, because a page
   cannot attach a file to a mail draft.

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
  const canMail = !!(window.DDCMail && window.DDCMail.configured);

  const [step, setStep] = useState(acct.email ? 'ready' : 'noemail');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pay = B.payLines(e);
  const cfg = B.payCfg();

  const hasPdf = step === 'saved' || step === 'sent';
  const saveDoc = () => { B.openDocument(e, 'invoice'); setStep('saved'); };
  const draft = () => { B.email(e, hasPdf); setStep('sent'); onSent && onSent(e); };

  const subject = `${remote ? 'Statement' : 'Invoice'} ${inv.number || ''} — Dr. Debra Canapp, DVM, DACVSMR`;

  /* The invoice, laid out as an email. Not the printable document —
     that one's styling lives in a <head><style> block mail clients
     strip, so there's a dedicated builder for this. */
  const sendNow = async () => {
    setBusy(true); setErr('');
    try {
      const body = B.emailBody(e, false);
      const intro = String(body).split(/\n\s*\n+/).slice(0, 2).join('\n\n');
      await window.DDCMail.send({
        to: acct.email,
        subject,
        body,
        kind: 'invoice',
        html: SD_S().buildInvoiceEmailHTML(e, { intro }),
      });
      setStep('sent');
      onSent && onSent(e);
    } catch (ex) {
      setErr(ex.message || String(ex));
    }
    setBusy(false);
  };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Send · {inv.number}</div>
        <h2 className="sc-modal-h">Email the {doc} to {acct.billTo || acct.name}</h2>

        {!acct.email && (
          <div className="sd-warn">This account has no email address. Add one on the hospital's profile under Hospitals, then come back.</div>
        )}

        {canMail ? (
          <React.Fragment>
            <p className="sc-modal-sub">
              The {doc} goes out as the email itself — totals, due date and how to pay, all laid out —
              from <strong>info@drdebracanapp.com</strong>. Nothing to save or attach.
            </p>
            <div className="sd-sendbox">
              <div className="sd-sendrow"><span className="k">To</span>{acct.email || <em>no email on this account</em>}</div>
              <div className="sd-sendrow"><span className="k">Subject</span>{subject}</div>
              <div className="sd-sendrow"><span className="k">Balance</span>{SD_S().money(B.balance(e))} · Net {inv.termsDays || 15}</div>
            </div>

            {step === 'sent' ? (
              <p className="sd-done" style={{ marginTop: 14 }}>✓ Sent to {acct.email}.</p>
            ) : (
              <div className="mail-acts" style={{ marginTop: 16 }}>
                <button className="btn btn-clay" disabled={busy || !acct.email} onClick={sendNow}>
                  {busy ? 'Sending…' : `Send the ${doc}`}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=760,height=980'); if (w) { w.document.write(SD_S().buildInvoiceEmailHTML(e, { intro: B.emailBody(e, false).split(/\n\s*\n+/).slice(0, 2).join('\n\n') })); w.document.close(); } }}>Preview it</button>
                <button className="btn btn-ghost btn-sm" onClick={saveDoc}>Save a PDF copy</button>
                <button className="btn btn-ghost btn-sm" onClick={draft}>Open in my mail instead</button>
              </div>
            )}
            {err && <div className="mail-err">{err}<br />Nothing was sent. Use “Open in my mail instead” to get it out now.</div>}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p className="sc-modal-sub">
              Two steps, because a browser can’t attach a file to an email for you: save the PDF, then
              we’ll open your mail app with everything written so you can attach it.
            </p>
            <div className="sd-steps">
              <div className={`sd-step ${step !== 'noemail' ? 'on' : ''} ${hasPdf ? 'done' : ''}`}>
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
                      : <em>no email on this account — add one under Hospitals first</em>}, with the totals, the due date and how to pay already written.
                    {hasPdf
                      ? ' Attach the PDF you just saved and send.'
                      : ' Skip step 1 and it won’t mention an attachment — send it as a notice and they can download their own copy from the portal.'}
                  </p>
                  <button className="btn btn-clay btn-sm" disabled={!acct.email} onClick={draft}>
                    {hasPdf ? 'Open email draft' : 'Open email without attachment'}
                  </button>
                </div>
              </div>
            </div>
            <p className="mail-note">
              Set up email and this becomes one click, with the {doc} in the message — see EMAIL-SETUP.md.
            </p>
          </React.Fragment>
        )}

        <details className="sd-preview"><summary>What the email says</summary><pre>{B.emailBody(e, canMail ? false : hasPdf)}</pre></details>

        {!cfg.portalUrl && (
          <div className="sd-warn">No portal address is set, so the email can’t tell them where to sign in. Add <code>payments.portalUrl</code> to <code>config.js</code>.</div>
        )}
        {pay.length <= 1 && (
          <div className="sd-warn">Only one payment method is configured. Fill in <code>payments</code> in <code>config.js</code> (ACH details, card link) so the {doc} tells them every way they can pay.</div>
        )}

        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{step === 'sent' ? 'Done' : 'Cancel'}</button>
          {step === 'sent' && !canMail && <span className="sd-done">{hasPdf ? '✓ Draft opened — remember to attach the PDF you saved.' : '✓ Draft opened — no attachment mentioned.'}</span>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SendInvoiceModal });
