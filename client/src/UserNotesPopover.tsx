import React, { useEffect, useRef, useState } from 'react';
import GenericPopover from './GenericPopover';
import type { UserJobNote } from './ClientSaveLoad';

interface UserNotesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  jobName?: string;
  companyName?: string;
  initialNote?: UserJobNote;
  onSave: (note: UserJobNote) => void;
  onClear: () => void;
}

const UserNotesPopover: React.FC<UserNotesPopoverProps> = ({
  isOpen,
  onClose,
  jobName,
  companyName,
  initialNote,
  onSave,
  onClear,
}) => {
  const [notes, setNotes] = useState(initialNote?.notes ?? '');
  const [userScore, setUserScore] = useState<string>(
    initialNote?.userScore !== null && initialNote?.userScore !== undefined
      ? String(initialNote.userScore)
      : '',
  );
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Sync fields whenever the popover opens or the initial note changes.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setNotes(initialNote?.notes ?? '');
    setUserScore(
      initialNote?.userScore !== null && initialNote?.userScore !== undefined
        ? String(initialNote.userScore)
        : '',
    );
    window.setTimeout(() => notesRef.current?.focus(), 0);
  }, [isOpen, initialNote]);

  const handleSave = () => {
    const raw = userScore.trim();
    let scoreNum: number | null = null;
    if (raw !== '') {
      const parsed = Number(raw);
      scoreNum = Number.isNaN(parsed) ? null : Math.min(100, Math.max(0, Math.round(parsed)));
    }
    onSave({ notes: notes.trim(), userScore: scoreNum });
    onClose();
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  const heading = [jobName, companyName].filter(Boolean).join(' — ');

  return (
    <GenericPopover
      isOpen={isOpen}
      onClose={onClose}
      title="User Notes"
      className="user-notes-popover"
      headerActions={
        <>
          <button
            type="button"
            className="open-corpus-btn"
            onClick={handleSave}
            style={{ marginTop: 0 }}
          >
            Save
          </button>
          {initialNote && (
            <button
              type="button"
              className="open-corpus-btn"
              onClick={handleClear}
              style={{ marginTop: 0, marginLeft: 6 }}
            >
              Clear
            </button>
          )}
        </>
      }
    >
      {heading && (
        <p style={{ marginTop: 0, marginBottom: '14px', fontSize: '0.9rem', color: '#475569' }}>
          {heading}
        </p>
      )}

      <label style={{ display: 'block', marginBottom: '18px' }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>
          Notes
        </span>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write your notes about this job…"
          style={{
            width: '100%',
            minHeight: '160px',
            resize: 'vertical',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            padding: '10px 12px',
            fontSize: '0.9rem',
            lineHeight: 1.55,
            color: '#0f172a',
            background: '#f8fafc',
            boxSizing: 'border-box',
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>
          User Score (0 – 100)
        </span>
        <input
          type="number"
          min={0}
          max={100}
          value={userScore}
          onChange={(e) => setUserScore(e.target.value)}
          placeholder="e.g. 85"
          style={{
            width: '120px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            padding: '8px 10px',
            fontSize: '0.9rem',
            color: '#0f172a',
            background: '#f8fafc',
          }}
        />
      </label>
    </GenericPopover>
  );
};

export default UserNotesPopover;
