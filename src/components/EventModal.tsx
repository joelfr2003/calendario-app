import { FormEvent, useState } from 'react';
import { addDays, toDateInput, toLocalInput } from '../lib/dates';
import { EVENT_COLORS, NewEvent, Recurrence, Scope, Visibility } from '../lib/types';

interface Props {
  initial: NewEvent;
  readOnly: boolean;
  ownerName?: string;
  onSave: (ev: NewEvent & { title: string }, scope: Scope) => Promise<void>;
  onDelete: (id: string, scope: Scope, occStart?: string) => Promise<void>;
  onDuplicate: (ev: NewEvent) => void;
  onClose: () => void;
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const UNIT = { daily: 'días', weekly: 'semanas', monthly: 'meses', yearly: 'años' };
type Freq = 'none' | Recurrence['freq'];

export default function EventModal({ initial, readOnly, ownerName, onSave, onDelete, onDuplicate, onClose }: Props) {
  const seriesId = initial.seriesId;
  const isSeries = !!seriesId && !!initial.recurrence;
  const r0 = initial.recurrence ?? null;

  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [color, setColor] = useState(initial.color ?? EVENT_COLORS[0]);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility ?? 'busy');
  const [reminder, setReminder] = useState(initial.reminder_min == null ? '' : String(initial.reminder_min));
  const [freq, setFreq] = useState<Freq>(r0?.freq ?? 'none');
  const [interval, setIntervalN] = useState(r0?.interval ?? 1);
  const [days, setDays] = useState<number[]>(r0?.days ?? []);
  const [until, setUntil] = useState(r0?.until ?? '');
  const [scope, setScope] = useState<Scope>('one');
  const [start, setStart] = useState(() => {
    const d = new Date(initial.start_at);
    return initial.all_day ? toDateInput(d) : toLocalInput(d);
  });
  const [end, setEnd] = useState(() => {
    const d = new Date(initial.end_at);
    return initial.all_day ? toDateInput(addDays(d, -1)) : toLocalInput(d);
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const showRepeat = !readOnly && (!isSeries || scope === 'all');

  const toggleAllDay = (v: boolean) => {
    setAllDay(v);
    if (v) {
      setStart(start.slice(0, 10));
      setEnd(end.slice(0, 10));
    } else {
      setStart(`${start.slice(0, 10)}T09:00`);
      setEnd(`${end.slice(0, 10)}T10:00`);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = allDay ? new Date(`${start}T00:00:00`) : new Date(start);
    const en = allDay ? addDays(new Date(`${end}T00:00:00`), 1) : new Date(end);
    if (!(en > s)) {
      setErr('El final debe ser posterior al inicio.');
      return;
    }
    const rec: Recurrence | null =
      (isSeries && scope === 'one') || freq === 'none'
        ? null
        : { freq, interval: Math.max(1, interval || 1), ...(freq === 'weekly' && days.length ? { days } : {}), until: until || null };
    setBusy(true);
    try {
      await onSave(
        {
          ...initial,
          id: seriesId,
          title: title.trim() || '(Sin título)',
          description: description || null,
          location: location.trim() || null,
          all_day: allDay,
          color,
          visibility,
          reminder_min: reminder === '' ? null : Number(reminder),
          recurrence: rec,
          start_at: s.toISOString(),
          end_at: en.toISOString(),
        },
        isSeries ? scope : 'all',
      );
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const del = async () => {
    if (!seriesId || !confirm(isSeries && scope === 'all' ? '¿Eliminar toda la serie?' : '¿Eliminar este evento?')) return;
    setBusy(true);
    try {
      await onDelete(seriesId, isSeries ? scope : 'all', initial.occStart);
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const dateType = allDay ? 'date' : 'datetime-local';

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        {readOnly && <div className="muted small">Evento de {ownerName ?? 'un amigo'} · solo lectura</div>}
        <input className="title-input" autoFocus placeholder="Añade un título" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />

        {isSeries && !readOnly && (
          <div className="frow">
            <span className="lbl">Aplicar a</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="one">Solo este evento</option>
              <option value="all">Toda la serie</option>
            </select>
          </div>
        )}

        <div className="frow">
          <span className="lbl">Fecha</span>
          <div className="fcol">
            <label className="chk">
              <input type="checkbox" checked={allDay} disabled={readOnly} onChange={(e) => toggleAllDay(e.target.checked)} /> Todo el día
            </label>
            <div className="row">
              <input type={dateType} value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} required />
              <span className="muted">→</span>
              <input type={dateType} value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
        </div>

        {showRepeat && (
          <div className="frow">
            <span className="lbl">Repetir</span>
            <div className="fcol">
              <div className="row">
                <select value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
                  <option value="none">No se repite</option>
                  <option value="daily">Cada día</option>
                  <option value="weekly">Cada semana</option>
                  <option value="monthly">Cada mes</option>
                  <option value="yearly">Cada año</option>
                </select>
                {freq !== 'none' && (
                  <>
                    <span className="muted">cada</span>
                    <input type="number" min={1} max={99} value={interval} onChange={(e) => setIntervalN(Number(e.target.value))} style={{ width: 64 }} />
                    <span className="muted">{UNIT[freq]}</span>
                  </>
                )}
              </div>
              {freq === 'weekly' && (
                <div className="row">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <button
                      type="button"
                      key={d}
                      className={'dow-btn' + (days.includes(d) ? ' on' : '')}
                      onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              )}
              {freq !== 'none' && (
                <label className="row small muted">
                  Hasta <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /> (vacío = sin fin)
                </label>
              )}
            </div>
          </div>
        )}

        {(!readOnly || location) && (
          <div className="frow">
            <span className="lbl">Lugar</span>
            <div className="row">
              <input style={{ flex: 1 }} placeholder="Lugar o enlace de videollamada" value={location} disabled={readOnly} onChange={(e) => setLocation(e.target.value)} />
              {/^https?:\/\//.test(location) && (
                <a className="btn small" href={location} target="_blank" rel="noreferrer">
                  Abrir
                </a>
              )}
            </div>
          </div>
        )}

        {(!readOnly || description) && (
          <div className="frow">
            <span className="lbl">Notas</span>
            <textarea rows={3} placeholder="Descripción" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}

        {!readOnly && (
          <>
            <div className="frow">
              <span className="lbl">Aviso</span>
              <select value={reminder} onChange={(e) => setReminder(e.target.value)}>
                <option value="">Sin aviso</option>
                <option value="0">Al empezar</option>
                <option value="5">5 minutos antes</option>
                <option value="10">10 minutos antes</option>
                <option value="30">30 minutos antes</option>
                <option value="60">1 hora antes</option>
                <option value="1440">1 día antes</option>
              </select>
            </div>
            <div className="frow">
              <span className="lbl">Color</span>
              <div className="row">
                {EVENT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={'swatch' + (c === color ? ' on' : '')}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="frow">
              <span className="lbl">Visible para</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                <option value="private">Solo yo</option>
                <option value="busy">Amigos: solo ven “Ocupado”</option>
                <option value="friends">Amigos: ven título y detalles</option>
              </select>
            </div>
          </>
        )}

        {err && <div className="error">{err}</div>}
        <div className="row end">
          {!readOnly && seriesId && (
            <>
              <button type="button" className="btn danger" onClick={() => void del()} disabled={busy}>
                Eliminar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => onDuplicate({ ...initial, id: undefined, seriesId: undefined, occStart: undefined })}
                disabled={busy}
              >
                Duplicar
              </button>
            </>
          )}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button type="submit" className="btn primary" disabled={busy}>
              Guardar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
