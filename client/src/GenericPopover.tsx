import React, { useEffect } from 'react';

interface GenericPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  onContentScroll?: React.UIEventHandler<HTMLDivElement>;
}

const GenericPopover: React.FC<GenericPopoverProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
  headerActions,
  contentRef,
  onContentScroll,
}) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="generic-popover-overlay" onClick={onClose} role="presentation">
      <div
        className={`generic-popover-panel ${className || ''}`.trim()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Popover'}
      >
        <div className="generic-popover-header">
          <h2 className="generic-popover-title">{title || 'Details'}</h2>
          <div className="generic-popover-header-right">
            {headerActions ? <div className="generic-popover-header-actions">{headerActions}</div> : null}
            <button
              type="button"
              className="generic-popover-close"
              onClick={onClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>
        <div className="generic-popover-content" ref={contentRef} onScroll={onContentScroll}>{children}</div>
      </div>
    </div>
  );
};

export default GenericPopover;
