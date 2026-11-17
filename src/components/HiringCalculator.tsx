/**
 * Сравнительный калькулятор: Робот Рекрутер vs Человек Рекрутер.
 * Используется на лендинге и на странице "Тарифы" в кабинете.
 */
import { useState } from "react";

const HR_HOURLY = 80000 / 160; // 500 RR/час

function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** Тарифная сетка: цена за 1 ИИ-интервью или 1 ИИ-обучение в RR в зависимости от объёма пакета. */
function tierPrice(qty: number): number {
  if (qty <= 9) return 200;
  if (qty <= 49) return 150;
  if (qty <= 199) return 100;
  return 50;
}

function tierLabel(qty: number): string {
  if (qty <= 9) return "1–9 шт";
  if (qty <= 49) return "10–49 шт";
  if (qty <= 199) return "50–199 шт";
  return "200+ шт";
}

export default function HiringCalculator() {
  const [n, setN] = useState(5);

  // Робот Рекрутер (масштабируется от ТЗ при N=5)
  const regCount = n * 10;          // зарегистрировалось
  const intCount = n * 6;           // прошло интервью
  const intPrice = tierPrice(intCount);
  const intRR = intCount * intPrice;
  const okCount = round(n * 2.4, 1);
  const trnCount = n * 2;           // вышли на обучение
  const trnPrice = tierPrice(trnCount);
  const trnRR = trnCount * trnPrice;
  const passCount = n;              // прошли обучение
  const totalRR = intRR + trnRR;
  const totalMin = regCount + intCount + Math.round(okCount) + trnCount + passCount;
  const perUnitRR = round(totalRR / n);

  // Человек Рекрутер (часы)
  const hrInvited = n * 12;
  const hrInvitedH = round(hrInvited * 0.05, 1);  // 3 минуты на приглашение
  const hrShowH = intCount;             // 1 час на интервью
  const hrTrnH = trnCount;
  const hrPassH = passCount;
  const hrTotalH = round(hrInvitedH + hrShowH + hrTrnH + hrPassH, 1);
  const hrCost = round(hrTotalH * HR_HOURLY);
  const hrPerUnit = round(hrCost / n);

  const ratioMoney = round(hrPerUnit / Math.max(perUnitRR, 1), 1);
  const ratioTime = round((hrTotalH * 60) / Math.max(totalMin, 1), 0);

  return (
    <div className="bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl p-6 md:p-8 shadow-2xl text-left space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl md:text-2xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
          Калькулятор «Робот vs Рекрутер»
        </h3>
        <p className="text-slate-300 text-sm">
          Выберите, сколько готовых обученных сотрудников вам нужно
        </p>
      </div>

      {/* Slider */}
      <div className="space-y-2 max-w-xl mx-auto">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-white">Нужно сотрудников на выходе:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-20 bg-transparent backdrop-blur-md border border-[#E7C768]/50 text-[#E7C768] font-bold text-center rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-[#E7C768]"
          />
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          className="w-full accent-[#E7C768] cursor-pointer bg-white/15 h-2 rounded-lg appearance-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* RR */}
        <div className="bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-5 space-y-3 text-sm text-white">
          <div className="font-extrabold text-base flex items-center gap-2 pb-2.5 border-b border-white/20 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            🤖 Робот Рекрутер
          </div>
          <Row label="Зарегистрировалось" value={`${regCount}`} sub={`${regCount} мин`} />
          <Row label="Прошло интервью" value={`${intCount}`} sub={`${intCount}×${intPrice} = ${intRR.toLocaleString()} RR · ${intCount} мин`} />
          <Row label="Успешно" value={`${okCount}`} />
          <Row label="Вышли на обучение" value={`${trnCount}`} sub={`${trnCount}×${trnPrice} = ${trnRR.toLocaleString()} RR · ${trnCount} мин`} />
          <Row label="Прошли обучение" value={`${passCount}`} sub={`${passCount} мин`} />
          <div className="pt-3.5 mt-2 border-t border-white/20 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Итого:</span>
              <span className="font-mono font-extrabold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{totalRR.toLocaleString()} RR · {totalMin} мин</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white">За одного готового сотрудника:</span>
              <span className="font-mono font-extrabold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{perUnitRR.toLocaleString()} RR</span>
            </div>
            <div className="flex justify-between items-center text-sm text-white/90 pt-1">
              <span className="text-white">Тариф интервью / обучения:</span>
              <span className="font-mono font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{tierLabel(intCount)} · {intPrice} / {tierLabel(trnCount)} · {trnPrice} RR</span>
            </div>
          </div>
        </div>

        {/* HR */}
        <div className="bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-5 space-y-3 text-sm text-white">
          <div className="font-extrabold text-base flex items-center gap-2 pb-2.5 border-b border-white/20 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            👤 Человек Рекрутер
          </div>
          <Row label="Пригласили на интервью" value={`${hrInvited}`} sub={`${hrInvitedH} ч`} />
          <Row label="Пришло на интервью" value={`${intCount}`} sub={`${hrShowH} ч`} />
          <Row label="Успешно" value={`${okCount}`} />
          <Row label="Вышли на обучение" value={`${trnCount}`} sub={`${hrTrnH} ч`} />
          <Row label="Прошли обучение" value={`${passCount}`} sub={`${hrPassH} ч`} />
          <div className="pt-3.5 mt-2 border-t border-white/20 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Итого:</span>
              <span className="font-mono font-extrabold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{hrTotalH} ч · {hrCost.toLocaleString()} RR</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white">За одного готового сотрудника:</span>
              <span className="font-mono font-extrabold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{hrPerUnit.toLocaleString()} RR</span>
            </div>
            <div className="text-sm text-white/90 pt-1">
              * Рекрутер со средней зарплатой <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">80&nbsp;000 RR</span> за <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">160 часов</span> в месяц
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-transparent backdrop-blur-md border border-[#E7C768]/40 rounded-3xl p-6 text-center space-y-4">
        <div className="text-[18px] md:text-[20px] text-white font-mono leading-snug">
          {hrPerUnit.toLocaleString()} RR / {perUnitRR.toLocaleString()} RR = <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold">×{ratioMoney}</span> по деньгам
          {" · "}
          {hrTotalH}×60 / {totalMin} = <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold">×{ratioTime}</span> по времени
        </div>
        <div className="text-[20px] md:text-[24px] font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight">
          В {ratioMoney} раза дешевле и в {ratioTime} раз производительнее
        </div>
        <div className="pt-4 border-t border-white/20">
          <p className="text-base text-white font-medium mb-3">
            Чтобы нанять и обучить {n} {n === 1 ? "сотрудника" : "сотрудников"}, купите:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-transparent backdrop-blur-md rounded-2xl p-4 border border-[#E7C768]/40">
              <div className="text-base text-white font-bold mb-1">Баланс RR</div>
              <div className="text-[18px] md:text-[20px] font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {totalRR.toLocaleString("ru-RU")} RR
              </div>
            </div>
            <div className="bg-transparent backdrop-blur-md rounded-2xl p-4 border border-[#E7C768]/40">
              <div className="text-base text-white font-bold mb-1">ИИ-Интервью</div>
              <div className="text-[18px] md:text-[20px] font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {intCount} шт ×{intPrice} RR
              </div>
            </div>
            <div className="bg-transparent backdrop-blur-md rounded-2xl p-4 border border-[#E7C768]/40">
              <div className="text-base text-white font-bold mb-1">ИИ-Обучений</div>
              <div className="text-[18px] md:text-[20px] font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {trnCount} шт ×{trnPrice} RR
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-white text-sm">{label}:</span>
      <span className="text-right">
        <span className="font-mono font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{value}</span>
        {sub && <span className="text-sm text-white/80 ml-2 font-mono">{sub}</span>}
      </span>
    </div>
  );
}