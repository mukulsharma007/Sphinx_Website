/* Shared between the contact form (client) and /api/contact (server),
   so the two can never drift apart. */

export type ContactPayload = {
  name: string;
  company: string;
  email: string;
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(data: Partial<ContactPayload>) {
  const errors: Partial<Record<keyof ContactPayload, string>> = {};

  if (!data.name?.trim()) errors.name = "Please add your name.";
  if (!data.company?.trim()) errors.company = "Please add your company.";
  if (!data.email?.trim() || !EMAIL_RE.test(data.email)) {
    errors.email = "Please use a valid email address.";
  }
  if (!data.message?.trim() || data.message.trim().length < 10) {
    errors.message = "Tell us a little more — at least a sentence.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
