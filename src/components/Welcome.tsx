"use client";

// First-run welcome: what سجي is, that it is in beta, and how to install the
// web app on the home screen so it opens like a normal app.

import { useEffect, useState } from "react";
import { Share, SquarePlus, MoreVertical, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Choice, Sheet } from "./ui";

const KEY = "ft.intro3";

type Platform = "ios" | "android";

function detect(): Platform {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "ios";
}

export function Welcome() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [installed, setInstalled] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setPlatform(detect());
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {}
    if (!seen) setOpen(true);
    const again = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("ft:welcome", again);
    return () => window.removeEventListener("ft:welcome", again);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setOpen(false);
  };

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ocean/20 text-sm font-bold text-white">{n}</span>
      <span className="pt-0.5 text-sm leading-relaxed text-ink-2">{children}</span>
    </li>
  );

  const slides = [
    {
      icon: "🎣",
      title: t("شنو هو سجي؟", "What is Sajji?"),
      lines: [
        t("يقولك البحر زين لو لا قبل لا تطلع.", "Tells you if the sea is good before you go."),
        t("يعرض المد والجزر والريح والموج بلغة بسيطة.", "Shows tide, wind and waves in plain words."),
        t("يسجّل رحلاتك وصيدك ويحسب أفضل وقت للصيد.", "Logs your trips and catches, and finds the best fishing time."),
      ],
    },
    {
      icon: "🚦",
      title: t("شنو معنى الألوان؟", "What do the colours mean?"),
      lines: [
        t("🟢 زين: الريح هادية والموج قليل، اطلع.", "🟢 Good: light wind, small waves."),
        t("🟡 انتبه: ريح أو موج متوسط، طلعة قصيرة وقريبة.", "🟡 Careful: moderate wind or waves — stay short and close."),
        t("🔴 لا تطلع: ريح قوية أو موج عالي.", "🔴 Don't go: strong wind or high waves."),
        t("الحكم للقارب الصغير (40 حصان) ويتبع الأسوأ بين الريح والموج.", "Judged for a small 40 hp boat, by the worse of wind and waves."),
      ],
    },
    {
      icon: "🌊",
      title: t("المد والجزر والحمل والفساد", "Tide, haml and fasad"),
      lines: [
        t("الماي ياخذ = المد طالع. الماي يعطي = الجزر نازل.", "Water takes = tide rising. Water gives = tide falling."),
        t("الحمل: أيام المد القوي والتيار، والفساد: أيام المد الضعيف.", "Haml: strong tide and current days. Fasad: weak tide days."),
        t("وقت الوقفة (بين المد والجزر) غالبًا أحسن وقت للهامور والبالول.", "The slack between tides is often best for hamour and balool."),
      ],
    },
  ];
  const last = slides.length; // step index of the install page
  const sl = slides[step];

  return (
    <Sheet open={open} onClose={close} title={t("أهلاً بك في سجي", "Welcome to SAJJI")}>
      <div className="space-y-5">
        {sl ? (
          <div className="space-y-4 text-center">
            <div className="text-5xl">{sl.icon}</div>
            <h3 className="text-lg font-bold">{sl.title}</h3>
            <ul className="space-y-2 text-start text-sm leading-relaxed text-ink-2">
              {sl.lines.map((x, i) => (
                <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
                  {x}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-warn">
              <b>{t("نسخة تجريبية:", "Beta:")}</b> {t("المد والموج والرياح تقديرات وقد تختلف عن النشرة الرسمية. لا تعتمد عليها وحدها في البحر.", "Tide, waves and wind are estimates and can differ from the official bulletin. Don't rely on them alone at sea.")}
            </div>
        {installed ? (
              <p className="rounded-xl bg-good/10 px-3 py-2.5 text-sm text-good">{t("✓ التطبيق مثبّت على جهازك ويعمل بملء الشاشة.", "✓ The app is installed and runs full-screen.")}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Smartphone className="size-4 text-ocean" /> {t("ثبّته على جوالك ليشتغل مثل أي تطبيق", "Install it on your phone to use it like any app")}
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {t(
                    "سجي تطبيق ويب: يفتح أول مرة من المتصفح. أضفه إلى الشاشة الرئيسية ويصير له أيقونة ويفتح بملء الشاشة بدون شريط المتصفح، ويشتغل حتى بدون إنترنت.",
                    "SAJJI is a web app: it first opens in your browser. Add it to your home screen to get an icon, full-screen mode, and offline use.",
                  )}
                </p>
                <Choice<Platform>
                  value={platform}
                  allowClear={false}
                  onChange={(v) => v && setPlatform(v)}
                  options={[
                    { value: "ios", label: t("آيفون (Safari)", "iPhone (Safari)") },
                    { value: "android", label: t("أندرويد (Chrome)", "Android (Chrome)") },
                  ]}
                />
                {platform === "ios" ? (
                  <ol className="space-y-3">
                    <Step n={1}>{t("افتح الرابط في متصفح Safari (مو من داخل تطبيق ثاني مثل واتساب).", "Open the link in Safari (not inside another app like WhatsApp).")}</Step>
                    <Step n={2}>
                      {t("اضغط زر المشاركة ", "Tap the Share button ")}
                      <Share className="mx-1 inline size-4 align-text-bottom text-ocean" />
                      {t("(المربع اللي فوقه سهم) في الشريط السفلي.", "(the square with an arrow) in the bottom bar.")}
                    </Step>
                    <Step n={3}>
                      {t("مرّر لتحت واختر «إضافة إلى الشاشة الرئيسية» ", "Scroll down and choose “Add to Home Screen” ")}
                      <SquarePlus className="mx-1 inline size-4 align-text-bottom text-ocean" />
                    </Step>
                    <Step n={4}>{t("اضغط «إضافة» فوق. تطلع أيقونة سجي على شاشتك، افتحها منها.", "Tap “Add” at the top. The SAJJI icon appears on your home screen — open it from there.")}</Step>
                  </ol>
                ) : (
                  <ol className="space-y-3">
                    <Step n={1}>{t("افتح الرابط في متصفح Chrome.", "Open the link in Chrome.")}</Step>
                    <Step n={2}>
                      {t("اضغط قائمة النقاط الثلاث ", "Tap the three-dot menu ")}
                      <MoreVertical className="mx-1 inline size-4 align-text-bottom text-ocean" />
                      {t("أعلى المتصفح.", "at the top of the browser.")}
                    </Step>
                    <Step n={3}>{t("اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».", "Choose “Install app” or “Add to Home screen”.")}</Step>
                    <Step n={4}>{t("أكّد بزر «تثبيت». تطلع أيقونة سجي على شاشتك، افتحها منها.", "Confirm with “Install”. The SAJJI icon appears on your home screen — open it from there.")}</Step>
                  </ol>
                )}
              </div>
            )}

          </div>
        )}

        <div className="flex justify-center gap-1.5" aria-hidden>
          {[...slides, null].map((_, i) => (
            <span key={i} className={"size-2 rounded-full " + (i === step ? "bg-ocean" : "bg-line")} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {step < last && (
            <Button variant="ghost" className="shrink-0" onClick={close}>
              {t("تخطي", "Skip")}
            </Button>
          )}
          <Button size="lg" className="w-full" onClick={() => (step < last ? setStep(step + 1) : close())}>
            {step < last ? t("التالي", "Next") : t("ابدأ", "Get started")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
