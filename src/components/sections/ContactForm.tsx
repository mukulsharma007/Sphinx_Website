"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input, { Textarea, Field } from "@/components/ui/Input";
import { validateContact, type ContactPayload } from "@/lib/validate";

type Status = "idle" | "sending" | "sent" | "error";

const empty: ContactPayload = { name: "", company: "", email: "", message: "" };

export default function ContactForm() {
  const [data, setData] = useState<ContactPayload>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactPayload, string>>>({});
  const [status, setStatus] = useState<Status>("idle");

  const set = (key: keyof ContactPayload) => (value: string) =>
    setData((d) => ({ ...d, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const check = validateContact(data);
    setErrors(check.errors);
    if (!check.valid) return;

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-sand bg-white p-8 text-center">
        <p aria-hidden className="text-2xl text-gold">◆</p>
        <h2 className="display mt-3 text-2xl text-night">Message received.</h2>
        <p className="mt-2 text-sm text-stone">
          Thanks, {data.name.split(" ")[0]} — we reply within one business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={data.name}
            onChange={(e) => set("name")(e.target.value)}
          />
        </Field>
        <Field label="Company" htmlFor="company" error={errors.company}>
          <Input
            id="company"
            name="organization"
            autoComplete="organization"
            value={data.company}
            onChange={(e) => set("company")(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Work email" htmlFor="email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={data.email}
          onChange={(e) => set("email")(e.target.value)}
        />
      </Field>

      <Field
        label="What would you like Sphinx to handle?"
        htmlFor="message"
        error={errors.message}
      >
        <Textarea
          id="message"
          name="message"
          placeholder="e.g. We get ~200 support questions a week, mostly about onboarding and pricing…"
          value={data.message}
          onChange={(e) => set("message")(e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Request a demo"}
        </Button>
        {status === "error" && (
          <p className="text-sm text-red-700">
            Something went wrong on our side — please try again.
          </p>
        )}
      </div>
    </form>
  );
}
