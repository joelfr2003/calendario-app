import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPendingInvite } from '../lib/invite';

type Mode = 'in' | 'up';

const translate = (m: string) =>
  /invalid login/i.test(m)
    ? 'Email o contraseña incorrectos.'
    : /already registered/i.test(m)
      ? 'Ya existe una cuenta con ese email. Inicia sesión.'
      : /email not confirmed/i.test(m)
        ? 'Confirma tu email antes de entrar (revisa tu correo).'
        : m;

export default function Auth() {
  const invited = !!getPendingInvite();
  const [mode, setMode] = useState<Mode>(invited ? 'up' : 'in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErr(translate(error.message));
        return;
      }
      const u = username.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]{3,20}$/.test(u)) {
        setErr('El usuario debe tener 3–20 caracteres: letras, números o guion bajo.');
        return;
      }
      if (password.length < 8) {
        setErr('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      const { data: free } = await supabase.rpc('username_available', { p: u });
      if (free === false) {
        setErr('Ese nombre de usuario ya está en uso.');
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() || u, username: u },
          emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      });
      if (error) setErr(translate(error.message));
      else if (!data.session) setInfo('Cuenta creada. Revisa tu correo y confirma el email para entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <div className="logo">31</div>
        <h1>Calendario</h1>
        <p>Compara agendas con tus amigos y encuentra el momento en que todos estáis libres.</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          {invited && <div className="banner-inline">Te han invitado. Crea tu cuenta y podrás aceptar la invitación.</div>}
          <div className="tabs" role="tablist">
            <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')} type="button">
              Iniciar sesión
            </button>
            <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')} type="button">
              Crear cuenta
            </button>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            {mode === 'up' && (
              <>
                <label className="field">
                  Nombre
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te verán tus amigos" autoComplete="name" />
                </label>
                <label className="field">
                  Usuario
                  <input
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="por ejemplo, marta_r"
                    autoCapitalize="none"
                    autoComplete="username"
                  />
                </label>
              </>
            )}
            <label className="field">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="field">
              Contraseña
              <input
                type="password"
                required
                minLength={mode === 'up' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              />
            </label>
            {err && <div className="error">{err}</div>}
            {info && <div className="notice">{info}</div>}
            <button className="btn primary big" type="submit" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
