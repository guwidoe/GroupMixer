import React from 'react';

interface InlineTextEditorProps {
  ariaLabel?: string;
  disabled: boolean;
  placeholder?: string;
  value: string;
  inputType?: 'text' | 'number';
  onCommit: (value: string) => void;
}

export function InlineTextEditor({
  ariaLabel,
  disabled,
  placeholder,
  value,
  inputType = 'text',
  onCommit,
}: InlineTextEditorProps) {
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      className="input h-9 min-w-[10rem]"
      disabled={disabled}
      type={inputType}
      placeholder={placeholder}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => onCommit(draftValue)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraftValue(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
