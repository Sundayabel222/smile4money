import React, { useState } from 'react';

interface RegistrationFormProps {
  onSubmit?: (data: { email: string; password: string }) => void | Promise<void>;
}

type Fields = { email: string; password: string; confirmPassword: string };
type Errors = Partial<Record<keyof Fields, string>>;

function validateFields({ email, password, confirmPassword }: Fields): Errors {
  const errs: Errors = {};
  if (!email) errs.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email address';
  if (!password) errs.password = 'Password is required';
  else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
  else if (!/(?=.*[A-Z])(?=.*\d)/.test(password))
    errs.password = 'Password must contain uppercase and a number';
  if (password && confirmPassword && password !== confirmPassword)
    errs.confirmPassword = 'Passwords do not match';
  return errs;
}

export function RegistrationForm({ onSubmit }: RegistrationFormProps) {
  const [fields, setFields] = useState<Fields>({ email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(key: keyof Fields, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    // Re-validate with new values so errors clear in real-time
    const errs = validateFields(next);
    setErrors((prev) => ({ ...prev, [key]: errs[key], confirmPassword: errs.confirmPassword }));
  }

  function blur(key: keyof Fields) {
    const errs = validateFields(fields);
    setErrors((prev) => ({ ...prev, [key]: errs[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateFields(fields);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    await onSubmit?.({ email: fields.email, password: fields.password });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={fields.email}
          onChange={(e) => update('email', e.target.value)}
          onBlur={() => blur('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && <span id="email-error">{errors.email}</span>}
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={fields.password}
          onChange={(e) => update('password', e.target.value)}
          onBlur={() => blur('password')}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && <span id="password-error">{errors.password}</span>}
      </div>
      <div>
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={fields.confirmPassword}
          onChange={(e) => update('confirmPassword', e.target.value)}
          onBlur={() => blur('confirmPassword')}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
        />
        {errors.confirmPassword && <span id="confirm-error">{errors.confirmPassword}</span>}
      </div>
      <button type="submit" disabled={submitting}>
        Register
      </button>
    </form>
  );
}
