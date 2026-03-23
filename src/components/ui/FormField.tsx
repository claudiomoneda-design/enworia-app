"use client";

import { Tooltip } from "./Tooltip";

interface FormFieldProps {
  label: string;
  name: string;
  tooltip?: string;
  required?: boolean;
  children?: React.ReactNode;
  type?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
}

export function FormField({
  label,
  name,
  tooltip,
  required,
  children,
  type = "text",
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: FormFieldProps) {
  return (
    <div>
      <label className="flex items-center text-sm font-medium text-[var(--foreground)] mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children || (
        <input
          name={name}
          type={type}
          value={value ?? ""}
          onChange={onChange}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A] transition-colors"
        />
      )}
    </div>
  );
}
