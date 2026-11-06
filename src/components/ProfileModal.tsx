import { FormEvent, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export default function ProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('display_name,username')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setName((data?.display_name as string | null) ?? '');
        setUsername((data?.username as string | null) ?? '');
      });
  }, [user.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const u = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return setErr('El usuario debe tener 3–20 caracteres: letras, números o guion bajo.');
    if (pw && pw.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() || u, username: u }).eq('id', user.id);
    if (error) {
      setBusy(false);
      return setErr(error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : error.message);
    }
    if (pw) {
      const { error: e2 } = await supabase.auth.updateUser({ password: pw });
      if (e2) {
        setBusy(false);
        return setErr(e2.message);
      }
      setPw('');
    }
    setUsername(u);
    setBusy(false);
    setMsg('Perfil actualizado.');
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)}>
        <h3>Mi perfil</h3>
        <div className="frow">
          <span className="lbl">Email</span>
          <span className="muted lbl-val">{user.email}</span>
        </div>
        <label className="frow">
          <span className="lbl">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te verán tus amigos" />
        </label>
        <label className="frow">
          <span className="lbl">Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="usuario" />
        </label>
        <label className="frow">
          <span className="lbl">Contraseña</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Déjalo vacío para no cambiarla" autoComplete="new-password" />
        </label>
        {err && <div className="error">{err}</div>}
        {msg && <div className="notice">{msg}</div>}
        <div className="row end">
          <button type="button" className="btn danger" onClick={() => void supabase.auth.signOut()}>
            Cerrar sesión
          </button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
