import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import type { ResearchDocument } from '../types';
import { mintIdentifier, publishRecord, documentToRepositoryRecord } from '../repository/publish';
import { documentRedactionOf } from '../repository/redaction';
import { RedactionPreview } from '../components/RedactionPreview';
import './shared.css';
import './Moderation.css';

export function Moderation() {
  const [pendingQuestions, setPendingQuestions] = useState<any[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<any[]>([]);
  /** A queue that cannot be read must say so — an empty page is a lie. */
  const [queueError, setQueueError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'questions' | 'answers' | 'repository'>('questions');
  const [pendingDocs, setPendingDocs] = useState<ResearchDocument[]>([]);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const { user } = useAuth();
  // Publishing a deposit writes the public archive record, which the rules
  // allow an admin and nobody else. Q&A moderation is part of running the
  // site; this tab is not, so a site manager doesn't see it.
  const { role } = useRole();
  const canPublishDeposits = role === 'admin';

  /* Repository deposits waiting on review. Uploads land as 'submitted' and
   * only an admin moves them on — publishing writes the public record that
   * iia-public reads, so this tab is the gate between "someone uploaded a
   * file" and "it is on the public site". */
  useEffect(() => {
    const q = query(collection(db, 'documents'), where('status', '==', 'submitted'));
    return onSnapshot(q, (snap) => {
      setPendingDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ResearchDocument));
    });
  }, []);

  const publishDoc = async (d: ResearchDocument) => {
    if (!user) return;
    setDocBusy(d.id); setDocError(null);
    try {
      const identifier = await mintIdentifier();
      await publishRecord(documentToRepositoryRecord(d, user.uid, identifier));
      await updateDoc(doc(db, 'documents', d.id), {
        status: 'published', publishedIdentifier: identifier, reviewNotes: null,
      });
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Could not publish this deposit.');
    } finally { setDocBusy(null); }
  };

  const rejectDoc = async (d: ResearchDocument) => {
    if (!user) return;
    setDocBusy(d.id); setDocError(null);
    try {
      await updateDoc(doc(db, 'documents', d.id), { status: 'rejected' });
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Could not update this deposit.');
    } finally { setDocBusy(null); }
  };

  /* Both queues filter on status and sort by a timestamp — which Firestore
   * will not do without a composite index, and refused with a 400 that this
   * page then swallowed: a moderator saw "Incoming Questions (0)" while
   * questions sat in the database. Sorting here instead needs no index, and
   * a moderation queue is small by definition. Any other failure is shown
   * rather than left as an empty page. */
  const byTime = (field: string) => (a: any, b: any) =>
    (a[field]?.toMillis?.() ?? 0) - (b[field]?.toMillis?.() ?? 0);

  // Load Pending Questions
  useEffect(() => {
    /* 'UNAPPROVED' is what the public site wrote before the two ends were
       put back in step — still accepted here so nothing already submitted
       is stranded. */
    const q = query(
      collection(db, 'student_questions'),
      where('status', 'in', ['PENDING_QUESTION', 'UNAPPROVED']),
    );
    return onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(d => data.push({ id: d.id, ...d.data() }));
      setPendingQuestions(data.sort(byTime('submittedAt')));
      setQueueError(null);
    }, (e) => setQueueError(`Could not read the question queue — ${e.message}`));
  }, []);

  // Load Pending Answers
  useEffect(() => {
    const q = query(
      collection(db, 'student_questions'),
      where('status', '==', 'PENDING_ANSWER'),
    );
    return onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(d => data.push({ id: d.id, ...d.data() }));
      setPendingAnswers(data.sort(byTime('answeredAt')));
      setQueueError(null);
    }, (e) => setQueueError(`Could not read the answer queue — ${e.message}`));
  }, []);

  const handleApproveQuestion = async (id: string) => {
    try {
      await updateDoc(doc(db, 'student_questions', id), {
        status: 'READY_FOR_SCIENTIST',
        questionApprovedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      alert('Error approving question');
    }
  };

  const handleReject = async (id: string, type: 'question' | 'answer') => {
    const confirmMessage = type === 'question' 
      ? 'Reject this question? It will be deleted or marked rejected.'
      : 'Reject this answer? It will not be published.';
    if (!window.confirm(confirmMessage)) return;
    try {
      await updateDoc(doc(db, 'student_questions', id), {
        status: type === 'question' ? 'REJECTED_Q' : 'REJECTED_A'
      });
    } catch (e) {
      console.error(e);
      alert('Error rejecting');
    }
  };

  const handlePublishAnswer = async (id: string, currentAnswer: string) => {
    const editedAnswer = window.prompt("Edit answer before publishing (or click OK to publish as is):", currentAnswer);
    if (editedAnswer === null) return; // cancelled
    
    try {
      await updateDoc(doc(db, 'student_questions', id), {
        status: 'PUBLISHED',
        answer: editedAnswer,
        publishedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      alert('Error publishing answer');
    }
  };

  return (
    <div className="ph-page">
      <div className="ph-page-header">
        <h1>Moderation</h1>
        <p className="ph-sub">
          {canPublishDeposits
            ? 'Approve student questions, review scientist answers, and publish repository deposits.'
            : 'Approve student questions and review scientist answers before they go live.'}
        </p>
      </div>

      {queueError && (
        <p className="mod-queue-error" role="alert">{queueError}</p>
      )}

      <div className="mod-tabs">
        <button
          className={`mod-tab ${activeTab === 'questions' ? 'active' : ''}`}
          onClick={() => setActiveTab('questions')}
        >
          Incoming Questions ({pendingQuestions.length})
        </button>
        <button
          className={`mod-tab ${activeTab === 'answers' ? 'active' : ''}`}
          onClick={() => setActiveTab('answers')}
        >
          Pending Answers ({pendingAnswers.length})
        </button>
        {canPublishDeposits && (
          <button
            className={`mod-tab ${activeTab === 'repository' ? 'active' : ''}`}
            onClick={() => setActiveTab('repository')}
          >
            Repository ({pendingDocs.length})
          </button>
        )}
      </div>

      <div className="mod-content">
        {activeTab === 'questions' && (
          <div className="mod-list">
            {pendingQuestions.length === 0 ? (
              <div className="mod-empty">No incoming questions at the moment.</div>
            ) : (
              pendingQuestions.map(q => (
                <div key={q.id} className="mod-card">
                  <div className="mod-card-meta">
                    <strong>{q.firstName || 'Anonymous'}</strong>
                    {q.age ? ` · age ${q.age}` : ''}
                    {q.institute ? ` · ${q.institute}` : ''}
                    {q.submittedAt ? ` · ${q.submittedAt.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                  <div className="mod-card-q">"{q.question}"</div>
                  <div className="mod-card-actions">
                    <button className="ph-btn primary" onClick={() => handleApproveQuestion(q.id)}>
                      Approve — send to the scientist app
                    </button>
                    <button className="ph-btn danger" onClick={() => handleReject(q.id, 'question')}>
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'answers' && (
          <div className="mod-list">
            {pendingAnswers.length === 0 ? (
              <div className="mod-empty">No pending answers from scientists.</div>
            ) : (
              pendingAnswers.map(q => (
                <div key={q.id} className="mod-card">
                  <div className="mod-card-meta">
                    <strong>{q.firstName || 'Anonymous'}</strong>
                    {q.age ? ` · age ${q.age}` : ''}
                    {q.institute ? ` · ${q.institute}` : ''}
                  </div>
                  <div className="mod-card-q">"{q.question}"</div>
                  <div className="mod-card-a-header">
                    Answered from {q.answeredByStation || 'the field app'}
                    {q.answeredAt ? ` · ${q.answeredAt.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                  <div className="mod-card-a">{q.answer}</div>
                  <div className="mod-card-actions">
                    <button className="ph-btn primary" onClick={() => handlePublishAnswer(q.id, q.answer)}>
                      Publish the answer
                    </button>
                    <button className="ph-btn danger" onClick={() => handleReject(q.id, 'answer')}>
                      Reject Answer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'repository' && (
          <div className="mod-list">
            {docError && <div className="mod-card mod-card--error">{docError}</div>}
            {pendingDocs.length === 0 ? (
              <div className="mod-empty">
                No deposits waiting. Uploads to the Knowledge Repository appear here for review
                before they reach the public site.
              </div>
            ) : (
              pendingDocs.map((d) => (
                <div key={d.id} className="mod-card">
                  <div className="mod-card-meta">
                    <strong>{d.title}</strong> | {d.category} · {d.station}
                  </div>
                  <div className="mod-card-q">{d.description}</div>
                  <div className="mod-doc-facts">
                    <span>{d.fileName} ({Math.max(1, Math.round((d.fileSizeBytes ?? 0) / 1024))} KB)</span>
                    <span>{d.license}</span>
                    {d.instrument && <span>{d.instrument}</span>}
                    <span>Deposited by {d.authorName}</span>
                    {d.embargo && d.embargo !== 'none' && <span className="mod-doc-embargo">Embargo: {d.embargo}</span>}
                  </div>
                  {/* What of this deposit publishes, and what stays here.
                      Shown before the publish button, not after it. */}
                  <RedactionPreview
                    redaction={documentRedactionOf(d)}
                    record={documentToRepositoryRecord(d, 'preview', 'IIA-PREVIEW')}
                  />
                  <div className="mod-card-actions">
                    <a className="ph-btn ghost" href={d.fileUrl} target="_blank" rel="noreferrer">Open the file</a>
                    <button className="ph-btn primary" onClick={() => publishDoc(d)} disabled={docBusy === d.id}>
                      {docBusy === d.id ? 'Publishing…' : 'Publish to the repository'}
                    </button>
                    <button className="ph-btn danger" onClick={() => rejectDoc(d)} disabled={docBusy === d.id}>
                      Send back
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
