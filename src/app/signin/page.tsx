import { redirect } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { Field } from "@/components/ui";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await currentUser()) redirect("/today");
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0D5C45] p-12 text-white md:flex md:flex-col md:justify-between">
        <Logo light />
        <div aria-hidden className="absolute -right-24 top-16 h-[30rem] w-96 rotate-12 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-[#F5B301]" />
        <div className="relative max-w-sm">
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">Every bird, every egg, every cedi.</h1>
          <p className="mt-4 text-lg text-white/80">Run your whole farm from one place, even where the signal drops.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
          <p className="mb-6 mt-1 text-ink-soft">Sign in with your phone number.</p>
          <ActionForm action={signIn}>
            <Field label="Phone number">
              <input className="input" name="phone" type="tel" inputMode="tel" autoComplete="username" required placeholder="024 000 0000" />
            </Field>
            <Field label="Password">
              <input className="input" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
          </ActionForm>
        </div>
      </section>
    </main>
  );
}
