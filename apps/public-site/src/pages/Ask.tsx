import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle2, Send, ArrowLeft, Search, UserCircle2, ChevronRight, Activity } from 'lucide-react';
import './Ask.css';

const SCIENTISTS = [
  { id: 1, name: 'Dr. Aarav Sharma', field: 'Glaciology', bio: 'Studying ice core samples to understand past climate changes.', top: '15%', left: '10%', img: 'https://media.istockphoto.com/id/1208347605/photo/portrait-of-a-scientist-in-the-laboratory.jpg?s=612x612&w=0&k=20&c=uZ3mV0fuvA1IPVfrMNHTzlLMvETmQE7JTzhNbOxDyjU=' },
  { id: 2, name: 'Dr. Priya Patel', field: 'Marine Biology', bio: 'Researching the adaptation of marine life in sub-zero temperatures.', top: '20%', right: '15%', img: 'https://media.istockphoto.com/id/1036131854/photo/facing-her-clients-with-a-quality-focused-mindset.jpg?s=612x612&w=0&k=20&c=2-MX2_FBJUERu9PKTwZMNFGTzokaeOAQPDVtDYWso5k=' },
  { id: 3, name: 'Dr. Rajesh Kumar', field: 'Meteorology', bio: 'Analyzing atmospheric patterns and ozone layer dynamics.', bottom: '25%', left: '15%', img: 'https://media.istockphoto.com/id/1746641970/photo/portrait-of-smiling-young-male-biochemist-standing-with-hands-in-pockets-at-laboratory.jpg?s=612x612&w=0&k=20&c=PG0w6K_fU3DbiXJzV8sJC7bygHVkaZytaKTtKYDlNeY=' },
  { id: 4, name: 'Dr. Ananya Singh', field: 'Geology', bio: 'Mapping geological structures beneath the Antarctic ice sheet.', bottom: '30%', right: '10%', img: 'https://media.istockphoto.com/id/1127106159/photo/portrait-of-a-female-scientist-in-the-laboratory.jpg?s=612x612&w=0&k=20&c=eu2VDATJUoTjeS3n4TJICtO_ue4dquGI6GQEZete9Jw=' },
  { id: 5, name: 'Dr. Vikram Desai', field: 'Astrophysics', bio: 'Utilizing clear polar skies for deep space observation.', top: '45%', left: '4%', img: 'https://media.istockphoto.com/id/1288039261/photo/portrait-of-a-smiling-middle-aged-man-of-indian-origin.jpg?s=612x612&w=0&k=20&c=hksg2MpAsM6pQSR-TASLnfFE4-sDPcYHyE6-edycJDI=' },
  { id: 6, name: 'Dr. Kavya Rao', field: 'Microbiology', bio: 'Discovering extremophile bacteria in subglacial lakes.', top: '55%', right: '6%', img: 'https://media.istockphoto.com/id/1188760541/photo/portrait-of-young-indian-male-medical-student.jpg?s=612x612&w=0&k=20&c=VSLjqW2qmrymMUoidiwVBMCCOkrKN9KxdiYCdBLwugM=' },
];

type Mode = 'START' | 'SUBMIT_INFO' | 'SUBMIT_QUESTION' | 'TRACK' | 'SUCCESS';

export default function Ask() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('START');
  const [form, setForm] = useState({ name: '', age: '', institute: '', question: '' });
  const [trackingIdInput, setTrackingIdInput] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedTrackingId, setGeneratedTrackingId] = useState('');
  
  const [trackResult, setTrackResult] = useState<{ status?: string, answer?: string, question?: string, error?: string } | null>(null);

  const handleNextToQuestion = () => {
    setError('');
    if (!form.name.trim() || !form.age.trim() || !form.institute.trim()) {
      setError('Please fill out your name, age, and institute.');
      return;
    }
    setMode('SUBMIT_QUESTION');
  };

  const handleSubmitQuestion = async () => {
    setError('');
    if (!form.question.trim()) {
      setError('Please enter your question.');
      return;
    }

    setSubmitting(true);
    try {
      /* PENDING_QUESTION, not 'UNAPPROVED': the portal's moderation queue
         asks for exactly this state, and for months this wrote a word
         nothing else in the system knew — so every question submitted here
         sat in a queue nobody was looking at. */
      const docRef = await addDoc(collection(db, 'student_questions'), {
        firstName: form.name.trim(),
        age: form.age.trim(),
        institute: form.institute.trim(),
        question: form.question.trim(),
        status: 'PENDING_QUESTION',
        submittedAt: serverTimestamp(),
        answer: null,
        answeredBy: null,
      });
      setGeneratedTrackingId(docRef.id);
      setMode('SUCCESS');
      setForm({ name: '', age: '', institute: '', question: '' });
    } catch (err: any) {
      console.error(err);
      setError(
        err?.code === 'permission-denied'
          ? 'The portal would not accept that. If the question is very long, try shortening it.'
          : 'Could not reach the portal. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async () => {
    setError('');
    setTrackResult(null);
    if (!trackingIdInput.trim()) {
      setError('Please enter a tracking ID.');
      return;
    }
    
    setSubmitting(true);
    try {
      const docRef = doc(db, 'student_questions', trackingIdInput.trim());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTrackResult({
          status: data.status || 'UNAPPROVED',
          question: data.question,
          answer: data.answer
        });
      } else {
        setTrackResult({ error: 'Question not found. Please check your Tracking ID.' });
      }
    } catch (err) {
      console.error(err);
      setTrackResult({ error: 'Failed to fetch status. Try again later.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ask-page">
      <div className="ask-floating-bg">
        {SCIENTISTS.map(sci => (
          <div 
            key={sci.id} 
            className="floating-scientist" 
            style={{ top: sci.top, left: sci.left, right: sci.right, bottom: sci.bottom }}
          >
            <img src={sci.img} alt={sci.name} className="scientist-avatar" />
            <div className="scientist-tooltip">
              <h4>{sci.name}</h4>
              <p className="sci-field">{sci.field}</p>
              <p className="sci-bio">{sci.bio}</p>
            </div>
          </div>
        ))}
      </div>

      <header className="ask-header">
        <button className="ask-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Back to Home
        </button>
        <div className="ask-header-center">
          <img src="/logo.png" alt="IIA" className="ask-logo" />
        </div>
        <div className="ask-header-right"></div>
      </header>

      <div className="ask-body-wrap">
        <div className="ask-central-container">
          <div className="ask-title-section">
            <h1 className="ask-title">Ask the Scientist</h1>
            <p className="ask-subtitle">Trusted by researchers from various fields. Send your queries directly to Antarctica.</p>
          </div>

          <div className="ask-card">
            {mode === 'START' && (
              <div className="ask-step ask-step-start fade-in">
                <button className="ask-action-card" onClick={() => setMode('SUBMIT_INFO')}>
                  <div className="aac-icon"><UserCircle2 size={32} /></div>
                  <div className="aac-text">
                    <h3>Submit a question</h3>
                    <p>Send a new query to our researchers</p>
                  </div>
                  <ChevronRight size={24} className="aac-arrow" />
                </button>

                <button className="ask-action-card" onClick={() => setMode('TRACK')}>
                  <div className="aac-icon"><Activity size={32} /></div>
                  <div className="aac-text">
                    <h3>Track question progress</h3>
                    <p>Check the status of a submitted query</p>
                  </div>
                  <ChevronRight size={24} className="aac-arrow" />
                </button>
              </div>
            )}

            {mode === 'SUBMIT_INFO' && (
              <div className="ask-step fade-in">
                <button className="ask-inline-back" onClick={() => setMode('START')}><ArrowLeft size={16} /> Back</button>
                <h2>About You</h2>
                <p className="step-desc">Let our scientists know who is asking.</p>
                
                <div className="ask-form-group">
                  <label>Full Name</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="ask-form-group">
                  <label>Age</label>
                  <input
                    type="number"
                    value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                    placeholder="Enter your age"
                  />
                </div>
                <div className="ask-form-group">
                  <label>Institute / College Name</label>
                  <input
                    value={form.institute}
                    onChange={e => setForm(f => ({ ...f, institute: e.target.value }))}
                    placeholder="Where do you study or work?"
                  />
                </div>

                {error && <div className="ask-form-error">{error}</div>}

                <button className="ask-btn primary" onClick={handleNextToQuestion}>
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            )}

            {mode === 'SUBMIT_QUESTION' && (
              <div className="ask-step fade-in">
                <button className="ask-inline-back" onClick={() => setMode('SUBMIT_INFO')}><ArrowLeft size={16} /> Back</button>
                <h2>Your Question</h2>
                <p className="step-desc">What would you like to ask our scientists in Antarctica?</p>
                
                <div className="ask-form-group">
                  <textarea
                    rows={6}
                    value={form.question}
                    onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                    placeholder="Type your question here... Be specific and clear!"
                    disabled={submitting}
                  />
                </div>

                {error && <div className="ask-form-error">{error}</div>}

                <button className="ask-btn primary" onClick={handleSubmitQuestion} disabled={submitting}>
                  {submitting ? 'Transmitting...' : <><Send size={18} /> Submit Question</>}
                </button>
              </div>
            )}

            {mode === 'SUCCESS' && (
              <div className="ask-step ask-step-success fade-in">
                <CheckCircle2 size={64} color="#5fd9ff" className="success-icon" />
                <h2>Question Submitted!</h2>
                <p>Your question has been securely transmitted to our Antarctic research queue.</p>
                
                <div className="tracking-box">
                  <span className="tracking-label">Your Tracking ID:</span>
                  <strong className="tracking-id">{generatedTrackingId}</strong>
                  <span className="tracking-note">Please save this ID to track your question later.</span>
                </div>

                <button className="ask-btn secondary" onClick={() => { setMode('START'); setGeneratedTrackingId(''); }}>
                  Return to Menu
                </button>
              </div>
            )}

            {mode === 'TRACK' && (
              <div className="ask-step fade-in">
                <button className="ask-inline-back" onClick={() => setMode('START')}><ArrowLeft size={16} /> Back</button>
                <h2>Track Progress</h2>
                <p className="step-desc">Enter your Tracking ID to check if your question has been answered.</p>
                
                <div className="ask-form-group track-input-group">
                  <input
                    value={trackingIdInput}
                    onChange={e => setTrackingIdInput(e.target.value)}
                    placeholder="e.g. abc123xyz"
                    disabled={submitting}
                  />
                  <button className="ask-btn primary track-btn" onClick={handleTrack} disabled={submitting}>
                    {submitting ? '...' : <Search size={20} />}
                  </button>
                </div>

                {error && <div className="ask-form-error">{error}</div>}

                {trackResult && (
                  <div className="track-result-box fade-in">
                    {trackResult.error ? (
                      <p className="track-error">{trackResult.error}</p>
                    ) : (
                      <>
                        <div className={`status-badge ${trackResult.status?.toLowerCase()}`}>
                          Status: {trackResult.status}
                        </div>
                        <div className="track-q">
                          <strong>Your Question:</strong>
                          <p>{trackResult.question}</p>
                        </div>
                        {trackResult.answer && (
                          <div className="track-a">
                            <strong>Scientist's Answer:</strong>
                            <p>{trackResult.answer}</p>
                          </div>
                        )}
                        {!trackResult.answer && (
                          <p className="track-wait">Our scientists are still reviewing your question. Check back soon!</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
