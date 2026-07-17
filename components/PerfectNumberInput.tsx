'use client';

import React, { useState, useEffect, useRef } from 'react';

interface PerfectNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
}

export default function PerfectNumberInput({
  value,
  onChange,
  min,
  max,
  className,
  style,
  ...props
}: PerfectNumberInputProps) {
  const [localValue, setLocalValue] = useState<string>(String(value));
  const isFocused = useRef(false);

  // Keep local value in sync with the external prop when not focused
  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(String(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    
    // Set local state immediately to what the user typed (allows empty/deletions)
    setLocalValue(rawValue);

    // If the input is completely empty, trigger onChange with min or 0
    // but don't force localValue to match it so the user can continue typing.
    if (rawValue === '') {
      onChange(min !== undefined ? min : 0);
      return;
    }

    const parsed = parseInt(rawValue, 10);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = true;
    e.target.select();
    if (props.onFocus) {
      props.onFocus(e);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = false;
    
    // Resolve boundaries on blur
    let parsed = parseInt(localValue, 10);
    if (isNaN(parsed)) {
      parsed = min !== undefined ? min : 0;
    } else {
      if (min !== undefined && parsed < min) {
        parsed = min;
      }
      if (max !== undefined && parsed > max) {
        parsed = max;
      }
    }
    
    setLocalValue(String(parsed));
    onChange(parsed);

    if (props.onBlur) {
      props.onBlur(e);
    }
  };

  return (
    <input
      type="number"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      min={min}
      max={max}
      className={className}
      style={style}
      {...props}
    />
  );
}
