"use client";

// كلمة مرور جديدة — opened from the recovery e-mail link (Supabase signs the
// user in with a short recovery session) or from حسابي → تغيير كلمة المرور.
// The password is only ever sent to Supabase; nothing is stored by the app.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The recovery link carries tokens in the URL; supabase-js turns them into a session on load.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return setState("invalid");
    let alive = true;
    const { data: sub } = sb.auth.onAuthStateChange((ev, session) => {
      if (alive && session && (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN")) setState((s) => (s === "done" ? s : "ready"));
    });
    void sb.auth.getSession().then(({ data }) => {
      if (alive) setState((s) => (s === "checking" ? (data.session ? "ready" : "invalid") : s));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr(t("كلمة المرور ٨ أحرف على الأقل", "Password must be at least 8 characters"));
    if (pw !== pw2) return setErr(t("كلمتا المرور غير متطابقتين", "The two passwords don't match"));
    const sb = supabase();
    if (!sb) return;
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw("");
      setPw2("");
      setState("done");
      setTimeout(() => router.replace("/"), 1800);
    } catch (e2) {
      const m = String((e2 as Error).message ?? e2);
      setErr(
        /different from the old/i.test(m)
          ? t("اختر كلمة مرور مختلفة عن القديمة", "Choose a password different from the old one")
          : /weak|easy to guess|pwned|compromised/i.test(m)
            ? t("كلمة المرور ضعيفة أو مسرّبة — اختر غيرها", "That password is weak or has leaked — choose another")
            : /fetch|network/i.test(m)
              ? t("لا يوجد اتصال بالإنترنت", "No internet connection")
              : m,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 py-10">
      <div className="text-center">
        <img src="/icons/sajji-mark.svg" alt="" className="mx-auto size-28" />
        <h1 className="mt-1 text-3xl font-extrabold">{t("كلمة مرور جديدة", "New password")}</h1>
      </div>

      {!supabaseConfigured || state === "invalid" ? (
        <Card className="space-y-3 p-5 text-center">
          <Notice tone="warn">
            {t("الرابط منتهي أو غير صحيح. اطلب رابط جديد من صفحة الدخول.", "This link has expired or isn't valid. Request a new one from the sign-in page.")}
          </Notice>
          <Link href="/login" className="inline-block text-sm font-semibold text-ocean underline-offset-4 hover:underline">
            {t("الذهاب لتسجيل الدخول", "Go to sign in")}
          </Link>
        </Card>
      ) : state === "checking" ? (
        <div className="text-center text-sm text-muted">…</div>
      ) : state === "done" ? (
        <Card className="p-5 text-center">
          <Notice tone="info">{t("تم تغيير كلمة المرور ✓ جاري تحويلك…", "Password changed ✓ taking you in…")}</Notice>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <Field label={t("كلمة المرور الجديدة", "New password")}>
              <Input type="password" autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label={t("أعد كتابتها", "Repeat it")}>
              <Input type="password" autoComplete="new-password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            {err && <Notice tone="bad">{err}</Notice>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {t("حفظ كلمة المرور", "Save password")}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
