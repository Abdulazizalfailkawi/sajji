"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { onSignedIn, enterLocalMode, mode } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "bad"; text: string } | null>(null);

  // «نسيت كلمة المرور؟» — the same neutral answer whether or not the e-mail has an account.
  const forgot = async () => {
    const sb = supabase();
    if (!sb) return;
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ tone: "bad", text: t("اكتب بريدك أول، وبعدها اضغط «نسيت كلمة المرور؟»", "Type your email first, then tap “Forgot password?”") });
    setBusy(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error && /rate limit|too many|security purposes/i.test(error.message)) throw error;
      setMsg({ tone: "info", text: t("إذا البريد مسجّل عندنا، وصلتك رسالة فيها رابط لتغيير كلمة المرور. تأكد من البريد المزعج.", "If that email has an account, we've sent a link to reset your password. Check your spam folder too.") });
    } catch (err) {
      const m = String((err as Error).message ?? err);
      setMsg({ tone: "bad", text: /rate limit|too many|security purposes/i.test(m) ? t("طلبات كثيرة — حاول بعد دقائق", "Too many requests — try again in a few minutes") : /fetch|network/i.test(m) ? t("لا يوجد اتصال بالإنترنت", "No internet connection") : m });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return;
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ tone: "bad", text: t("أدخل بريداً إلكترونياً صحيحاً", "Enter a valid email") });
    if (password.length < 8) return setMsg({ tone: "bad", text: t("كلمة المرور ٨ أحرف على الأقل", "Password must be at least 8 characters") });
    setBusy(true);
    try {
      if (tab === "up") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) {
          setMsg({
            tone: "info",
            text: t(
              "تم إنشاء الحساب. افتح الرابط المرسل إلى بريدك لتأكيده، ثم سجّل الدخول.",
              "Account created. Open the confirmation link sent to your email, then sign in.",
            ),
          });
          setTab("in");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await onSignedIn();
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && /^\/[A-Za-z0-9_\-\/]*(\?[A-Za-z0-9_=&\-]*)?$/.test(next) ? next : "/");
    } catch (err) {
      const m = String((err as Error).message ?? err);
      setMsg({
        tone: "bad",
        text: /invalid login/i.test(m)
          ? t("البريد أو كلمة المرور غير صحيحة", "Wrong email or password")
          : /not confirmed/i.test(m)
            ? t("لم يتم تأكيد البريد بعد — افتح رابط التأكيد", "Email not confirmed yet — open the confirmation link")
            : /fetch|network/i.test(m)
              ? t("لا يوجد اتصال بالإنترنت", "No internet connection")
              : m,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 py-10">
      <div className="text-center">
        <img src="/icons/sajji-mark.svg" alt="" className="mx-auto size-36" />
        <h1 className="mt-1 text-4xl font-extrabold">{t("سجي", "SAJJI")}</h1>
        <div className="mt-1 text-sm font-semibold tracking-[0.35em] text-ocean">{lang === "ar" ? "SAJJI" : "سجي"}</div>
        <p className="mt-1 text-muted">{t("سجل رحلاتك، مجموعتك، وأرقامك القياسية", "Your trips, your collection, your records")}</p>
        <button className="mt-3 text-sm text-teal underline-offset-4 hover:underline" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {lang === "ar" ? "English" : "العربية"}
        </button>
      </div>

      {supabaseConfigured ? (
        <Card className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["in", "up"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`min-h-10 rounded-lg text-sm font-medium ${tab === k ? "bg-surface-3 text-ink" : "text-muted"}`}
              >
                {k === "in" ? t("تسجيل الدخول", "Sign in") : t("حساب جديد", "Create account")}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Field label={t("البريد الإلكتروني", "Email")}>
              <Input type="email" autoComplete="email" inputMode="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("كلمة المرور", "Password")}>
              <Input
                type="password"
                autoComplete={tab === "in" ? "current-password" : "new-password"}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {tab === "in" ? t("دخول", "Sign in") : t("إنشاء الحساب", "Create account")}
            </Button>
            {tab === "in" && (
              <button type="button" onClick={forgot} disabled={busy} className="block w-full py-1 text-center text-sm font-semibold text-ocean underline-offset-4 hover:underline disabled:opacity-50">
                {t("نسيت كلمة المرور؟", "Forgot password?")}
              </button>
            )}
          </form>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {t(
              "بياناتك محفوظة في قاعدة بيانات خاصة بحسابك ومتزامنة بين أجهزتك. تعمل المسودات بدون إنترنت وتُرفع تلقائياً عند عودة الاتصال.",
              "Your data is stored privately in your account and synced across devices. Drafts work offline and upload automatically when you're back online.",
            )}
          </p>
        </Card>
      ) : (
        <Notice>
          {t(
            "لم يتم إعداد Supabase، لذلك سيعمل التطبيق على هذا الجهاز فقط.",
            "Supabase isn't configured, so the app runs on this device only.",
          )}
        </Notice>
      )}

      {!mode && (
        <Button
          variant="ghost"
          onClick={async () => {
            await enterLocalMode();
            router.replace("/");
          }}
        >
          {t("استخدام بدون حساب (على هذا الجهاز فقط)", "Use without an account (this device only)")}
        </Button>
      )}
    </div>
  );
}
