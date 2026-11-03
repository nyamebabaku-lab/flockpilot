import { saveSettings } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePage("settings.manage");
  const [settings, logs] = await Promise.all([getSettings(), db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 })]);

  return (
    <>
      <PageHeader title="Settings" subtitle={`Payments: ${getProvider().name === "paystack" ? "Paystack" : "Simulator (no real money)"}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Business and limits">
          <ActionForm action={saveSettings}>
            <Field label="Business name"><input className="input" name="businessName" defaultValue={settings.businessName} required /></Field>
            <Field label="Daily withdrawal limit (GH₵)"><input className="input" name="dailyWithdrawalLimit" inputMode="decimal" defaultValue={(settings.dailyWithdrawalLimit / 100).toFixed(2)} required /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="SSNIT worker %"><input className="input" name="ssnitEmployee" inputMode="decimal" defaultValue={(settings.ssnitEmployeeBps / 100).toFixed(2)} /></Field>
              <Field label="SSNIT employer %"><input className="input" name="ssnitEmployer" inputMode="decimal" defaultValue={(settings.ssnitEmployerBps / 100).toFixed(2)} /></Field>
              <Field label="Hen-day target %"><input className="input" name="henDayTarget" inputMode="decimal" defaultValue={(settings.henDayTargetBps / 100).toFixed(2)} /></Field>
            </div>
            <Field label="PAYE monthly bands" hint="width in pesewas (null for the top band), bps = rate × 100. Confirm these with an accountant.">
              <textarea className="input min-h-40 py-3 font-mono text-xs" name="payeBands" defaultValue={settings.payeBandsJson} />
            </Field>
            <SubmitButton className="btn-primary w-full">Save settings</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Activity log">
          <ul className="max-h-[36rem] overflow-y-auto text-sm">
            {logs.map((log) => (
              <li key={log.id} className="border-b border-line/60 py-2">
                <span className="font-medium">{log.action.replaceAll("_", " ").toLowerCase()}</span> · {log.detail}
                <span className="block text-xs text-ink-faint">{log.actor?.name ?? "System"} · {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
