"use client";

import { ApiForm } from "@/components/ui/interactive";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { fromLocalInput } from "@/lib/format";

export type CourseValues = {
  id?: string;
  name: string;
  description: string;
  category: string;
  level: string;
  keywords: string[];
  priceAmount: number;
  pricePeriod: string;
  durationWeeks: number | null;
  scheduleText: string;
  format: string;
  isActive: boolean;
};

const splitList = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function CourseForm({ course, onDone }: { course?: CourseValues; onDone?: () => void }) {
  return (
    <ApiForm
      action={course?.id ? `/api/v1/courses/${course.id}` : "/api/v1/courses"}
      method={course?.id ? "PATCH" : "POST"}
      submitLabel={course?.id ? "Save course" : "Create course"}
      onDone={onDone}
      toBody={(f) => ({
        name: f.get("name"),
        description: f.get("description") ?? "",
        category: f.get("category") ?? "",
        level: f.get("level") ?? "",
        keywords: splitList(f.get("keywords")),
        priceAmount: Number(f.get("priceAmount")),
        pricePeriod: f.get("pricePeriod"),
        durationWeeks: f.get("durationWeeks") ? Number(f.get("durationWeeks")) : null,
        scheduleText: f.get("scheduleText") ?? "",
        format: f.get("format"),
        isActive: f.get("isActive") === "on",
      })}
    >
      <Field label="Course name" htmlFor="name">
        <Input id="name" name="name" required defaultValue={course?.name} />
      </Field>
      <Field label="Description" htmlFor="description" hint="(the agent quotes this verbatim)">
        <Textarea id="description" name="description" defaultValue={course?.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price" htmlFor="priceAmount">
          <Input id="priceAmount" name="priceAmount" type="number" min={0} step={1000} required defaultValue={course?.priceAmount} />
        </Field>
        <Field label="Per" htmlFor="pricePeriod">
          <Select id="pricePeriod" name="pricePeriod" defaultValue={course?.pricePeriod ?? "month"}>
            <option value="month">month</option>
            <option value="course">full course</option>
            <option value="lesson">lesson</option>
          </Select>
        </Field>
        <Field label="Category" htmlFor="category">
          <Input id="category" name="category" defaultValue={course?.category} placeholder="Languages" />
        </Field>
        <Field label="Level" htmlFor="level">
          <Input id="level" name="level" defaultValue={course?.level} placeholder="Beginner" />
        </Field>
        <Field label="Format" htmlFor="format">
          <Select id="format" name="format" defaultValue={course?.format ?? "offline"}>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </Field>
        <Field label="Duration (weeks)" htmlFor="durationWeeks">
          <Input id="durationWeeks" name="durationWeeks" type="number" min={1} defaultValue={course?.durationWeeks ?? ""} />
        </Field>
      </div>
      <Field label="Schedule" htmlFor="scheduleText">
        <Input id="scheduleText" name="scheduleText" defaultValue={course?.scheduleText} placeholder="Mon/Wed/Fri 15:00" />
      </Field>
      <Field label="Keywords" htmlFor="keywords" hint="(comma separated — words customers use, any language)">
        <Input id="keywords" name="keywords" defaultValue={course?.keywords.join(", ")} placeholder="ingliz, english, английский" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isActive" defaultChecked={course?.isActive ?? true} className="h-4 w-4 rounded border-slate-300" />
        Active (the agent offers this course)
      </label>
    </ApiForm>
  );
}

export function SlotForm({ courseId, timeZone, onDone }: { courseId: string; timeZone: string; onDone?: () => void }) {
  return (
    <ApiForm
      action={`/api/v1/courses/${courseId}/slots`}
      submitLabel="Add slot"
      onDone={onDone}
      toBody={(f) => ({
        startsAt: fromLocalInput(String(f.get("startsAt")), timeZone),
        durationMin: Number(f.get("durationMin")),
        capacity: Number(f.get("capacity")),
        location: f.get("location") ?? "",
      })}
    >
      <Field label={`Start (${timeZone})`} htmlFor="startsAt">
        <Input id="startsAt" name="startsAt" type="datetime-local" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Duration (min)" htmlFor="durationMin">
          <Input id="durationMin" name="durationMin" type="number" min={15} defaultValue={60} />
        </Field>
        <Field label="Seats" htmlFor="capacity">
          <Input id="capacity" name="capacity" type="number" min={1} defaultValue={6} />
        </Field>
      </div>
      <Field label="Location" htmlFor="location">
        <Input id="location" name="location" placeholder="Main branch, room 2" />
      </Field>
    </ApiForm>
  );
}

export type ArticleValues = { id?: string; title: string; content: string; category: string; keywords: string[]; status: string };

export function KnowledgeForm({ article, onDone }: { article?: ArticleValues; onDone?: () => void }) {
  return (
    <ApiForm
      action={article?.id ? `/api/v1/knowledge/${article.id}` : "/api/v1/knowledge"}
      method={article?.id ? "PATCH" : "POST"}
      submitLabel={article?.id ? "Save" : "Create"}
      onDone={onDone}
      toBody={(f) => ({
        title: f.get("title"),
        content: f.get("content"),
        category: f.get("category") || "faq",
        keywords: splitList(f.get("keywords")),
        status: f.get("status"),
      })}
    >
      <Field label="Question / title" htmlFor="title">
        <Input id="title" name="title" required defaultValue={article?.title} placeholder="Where are you located?" />
      </Field>
      <Field label="Approved answer" htmlFor="content" hint="(sent to customers as written)">
        <Textarea id="content" name="content" required rows={5} defaultValue={article?.content} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="category">
          <Input id="category" name="category" defaultValue={article?.category ?? "faq"} />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={article?.status ?? "approved"}>
            <option value="approved">Approved — agent may use it</option>
            <option value="draft">Draft — hidden from agent</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </div>
      <Field label="Trigger keywords" htmlFor="keywords" hint="(comma separated)">
        <Input id="keywords" name="keywords" defaultValue={article?.keywords.join(", ")} placeholder="manzil, address, адрес" />
      </Field>
    </ApiForm>
  );
}
