import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

const fieldClasses =
  "w-full rounded-md border border-sand bg-white px-3.5 py-2.5 text-sm " +
  "text-ink placeholder:text-stone/70 " +
  "focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25";

export default function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`${fieldClasses} ${className ?? ""}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea className={`${fieldClasses} min-h-32 ${className ?? ""}`} {...rest} />
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
};

/** Label + control + inline error, stacked. */
export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
