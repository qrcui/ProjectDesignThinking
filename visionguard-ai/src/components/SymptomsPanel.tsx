import { useId } from 'react';
import '../enhancements.css';

export interface SymptomChoice {
  id: string;
  label: string;
  description?: string;
  redFlag?: boolean;
  exclusive?: boolean;
}

export interface SymptomsPanelCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  checklistLegend: string;
  redFlagLabel: string;
  redFlagNoticeTitle: string;
  redFlagNoticeBody: string;
  completeLabel: string;
  selectionRequiredHint: string;
  completedTitle: string;
  completedBody: string;
  selectedSummaryLabel: string;
  editLabel: string;
}

export interface SymptomsPanelProps {
  choices: readonly SymptomChoice[];
  selectedIds: readonly string[];
  completed: boolean;
  onSelectedIdsChange: (selectedIds: string[]) => void;
  onComplete: () => void;
  onEdit: () => void;
  copy: SymptomsPanelCopy;
  disabled?: boolean;
  className?: string;
}

export function SymptomsPanel({
  choices,
  selectedIds,
  completed,
  onSelectedIdsChange,
  onComplete,
  onEdit,
  copy,
  disabled = false,
  className = '',
}: SymptomsPanelProps) {
  const headingId = useId();
  const legendId = useId();
  const selectionHintId = useId();
  const validSelectedIds = [...new Set(selectedIds.filter((id) => choices.some((choice) => choice.id === id)))];
  const selectedChoices = choices.filter((choice) => validSelectedIds.includes(choice.id));
  const selectedRedFlags = selectedChoices.filter((choice) => choice.redFlag);
  const needsSelection = validSelectedIds.length === 0;
  const canComplete = validSelectedIds.length > 0 && !disabled;

  const toggleChoice = (choice: SymptomChoice, selected: boolean) => {
    if (disabled) return;

    if (!selected) {
      onSelectedIdsChange(validSelectedIds.filter((id) => id !== choice.id));
      return;
    }

    if (choice.exclusive) {
      onSelectedIdsChange([choice.id]);
      return;
    }

    const exclusiveIds = new Set(choices.filter((item) => item.exclusive).map((item) => item.id));
    onSelectedIdsChange([...validSelectedIds.filter((id) => !exclusiveIds.has(id)), choice.id]);
  };

  return (
    <section
      className={`vg-symptoms vg-enhancement-panel ${completed ? 'is-complete' : ''} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="vg-enhancement-heading">
        <div>
          <span className="vg-kicker">{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <p>{copy.introduction}</p>
      </div>

      {completed ? (
        <div className="vg-symptoms__completed">
          <span className="vg-complete-mark" aria-hidden="true">✓</span>
          <div className="vg-symptoms__completed-copy" role="status">
            <h3>{copy.completedTitle}</h3>
            <p>{copy.completedBody}</p>
            <div className="vg-symptoms__summary">
              <strong>{copy.selectedSummaryLabel}</strong>
              <ul>
                {selectedChoices.map((choice) => (
                  <li key={choice.id} className={choice.redFlag ? 'is-red-flag' : ''}>
                    {choice.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button className="vg-secondary-action" type="button" onClick={onEdit} disabled={disabled}>
            {copy.editLabel}
          </button>
        </div>
      ) : (
        <>
          <fieldset
            className="vg-symptom-list"
            aria-describedby={needsSelection && !disabled ? selectionHintId : undefined}
          >
            <legend id={legendId}>{copy.checklistLegend}</legend>
            <div className="vg-symptom-list__grid">
              {choices.map((choice, index) => {
                const checked = validSelectedIds.includes(choice.id);
                const descriptionId = choice.description ? `${legendId}-choice-${index}` : undefined;

                return (
                  <label
                    className={`vg-symptom-choice ${checked ? 'is-selected' : ''} ${choice.redFlag ? 'is-red-flag' : ''}`.trim()}
                    key={choice.id}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      aria-describedby={descriptionId}
                      onChange={(event) => toggleChoice(choice, event.target.checked)}
                    />
                    <span className="vg-check-control" aria-hidden="true"><i /></span>
                    <span className="vg-symptom-choice__copy">
                      <span className="vg-symptom-choice__title">
                        <strong>{choice.label}</strong>
                        {choice.redFlag && <small>{copy.redFlagLabel}</small>}
                      </span>
                      {choice.description && <span id={descriptionId}>{choice.description}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {selectedRedFlags.length > 0 && (
            <div className="vg-red-flag-notice" role="alert">
              <span aria-hidden="true">!</span>
              <div>
                <strong>{copy.redFlagNoticeTitle}</strong>
                <p>{copy.redFlagNoticeBody}</p>
              </div>
            </div>
          )}

          <div className="vg-enhancement-actions">
            <button
              className="vg-primary-action"
              type="button"
              onClick={onComplete}
              disabled={!canComplete}
              aria-describedby={needsSelection && !disabled ? selectionHintId : undefined}
            >
              {copy.completeLabel}
              <span aria-hidden="true">→</span>
            </button>
            {needsSelection && !disabled && (
              <p className="vg-action-hint" id={selectionHintId} role="status">
                {copy.selectionRequiredHint}
              </p>
            )}
          </div>
        </>
      )}

      {completed && selectedRedFlags.length > 0 && (
        <div className="vg-red-flag-notice vg-red-flag-notice--completed" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>{copy.redFlagNoticeTitle}</strong>
            <p>{copy.redFlagNoticeBody}</p>
          </div>
        </div>
      )}
    </section>
  );
}
