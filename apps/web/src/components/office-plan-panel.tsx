"use client";
import { useEffect, useState } from "react";
import { displayMoney } from "@legal/contracts/platform";
import { api, ApiError } from "../lib/api";

type Plan = {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  currencyDecimals: number;
  interval: string;
  maxUsers: number;
  maxMatters: number;
  maxStorageMiB: number;
  maxAiOperations: number;
};
type Subscription = {
  status: string;
  currentPeriodEnd: string;
  plan: { name: string };
};

export function OfficePlanPanel({
  locale,
  canManage,
}: {
  locale: "ar" | "en";
  canManage: boolean;
}) {
  const ar = locale === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Plan[]>("public/plans")
      .then(setPlans)
      .catch(() => setPlans([]));
    void api<{ subscription: Subscription | null }>("billing/subscription")
      .then((row) => setCurrent(row.subscription))
      .catch(() => setCurrent(null));
  }, []);

  return (
    <section className="panel">
      <h3>{ar ? "اشتراك المكتب" : "Office subscription"}</h3>
      {current ? (
        <p>
          {current.plan.name} · {current.status} ·{" "}
          {new Date(current.currentPeriodEnd).toLocaleDateString(ar ? "ar-OM" : "en-GB")}
        </p>
      ) : (
        <p>
          {ar
            ? "لا يوجد اشتراك. التجربة 14 يوماً بلا بطاقة. الدفع الإلكتروني غير موصول."
            : "No subscription yet. The trial is 14 days and does not take a card. Electronic payment is not connected."}
        </p>
      )}
      {message && <p>{message}</p>}
      {canManage && !current && (
        <div className="practice-records">
          {plans.map((plan) => (
            <article key={plan.id} className="panel quiet">
              <h4>{plan.name}</h4>
              <p>
                {displayMoney(plan.priceMinor, plan.currencyDecimals)} {plan.currency} ·{" "}
                {plan.interval === "YEARLY" ? (ar ? "سنوي" : "Yearly") : ar ? "شهري" : "Monthly"}
              </p>
              <p>
                {plan.maxUsers} {ar ? "مستخدمين" : "users"} · {plan.maxMatters}{" "}
                {ar ? "قضايا" : "matters"} · {plan.maxAiOperations}{" "}
                {ar ? "عمليات ذكاء" : "AI operations"}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setMessage("");
                  void api<Subscription>("billing/trial", "POST", { planId: plan.id })
                    .then((row) => {
                      setCurrent({ ...row, plan: { name: plan.name } });
                      setMessage(ar ? "بدأت التجربة." : "The trial has started.");
                    })
                    .catch((error: unknown) => {
                      const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
                      setMessage(
                        code === "TRIAL_ALREADY_USED"
                          ? ar
                            ? "استُخدمت التجربة من قبل."
                            : "This office already used its trial."
                          : code === "PAYMENT_UNAVAILABLE"
                            ? ar
                              ? "الدفع الإلكتروني غير موصول."
                              : "Electronic payment is not connected."
                            : code,
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                {ar ? "بدء تجربة 14 يوماً" : "Start a 14-day trial"}
              </button>
            </article>
          ))}
          {!plans.length && (
            <p>{ar ? "لم يُنشر أي باقة بعد." : "No plan has been published yet."}</p>
          )}
        </div>
      )}
    </section>
  );
}
