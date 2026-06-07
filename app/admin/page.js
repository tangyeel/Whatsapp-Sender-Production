"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4 fade-in">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input {...props} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase().auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const res = await fetch("/api/auth/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const { profile: p } = await res.json();
      if (p?.role !== "admin") { router.replace("/dashboard"); return; }
      fetchUsers();
    });
  }, []);

  async function fetchUsers() {
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    setUsers(json.data || []);
    setLoading(false);
  }

  const f = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error); setSaving(false); return; }
    setShowCreate(false); setForm({});
    fetchUsers(); setSaving(false);
  }

  async function handleEdit(e) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editUser.id, ...form }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error); setSaving(false); return; }
    setEditUser(null); setForm({});
    fetchUsers(); setSaving(false);
  }

  async function toggleActive(user) {
    await fetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    });
    fetchUsers();
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">Admin Panel</span>
          </div>
          <button onClick={async () => { await supabase().auth.signOut(); router.replace("/login"); }}
            className="text-xs text-gray-400 hover:text-white transition-colors">Sign out</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8 fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">School Accounts</h1>
            <p className="text-gray-500 text-sm mt-0.5">{users.filter(u => u.role !== "admin").length} accounts</p>
          </div>
          <button onClick={() => { setShowCreate(true); setForm({}); setError(""); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Account
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
          ) : users.filter(u => u.role !== "admin").length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">No accounts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {["School", "Email", "Template", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.filter(u => u.role !== "admin").map((user, idx) => (
                  <tr key={user.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors slide-in"
                    style={{ animationDelay: `${idx * 40}ms` }}>
                    <td className="px-5 py-3.5 font-medium">{user.school_name || "—"}</td>
                    <td className="px-5 py-3.5 text-gray-400">{user.email}</td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{user.template_name || "marks_update"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-green-400" : "bg-red-400"}`} />
                        {user.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setEditUser(user); setForm({ school_name: user.school_name, whatsapp_token: user.whatsapp_token, phone_number_id: user.phone_number_id, template_name: user.template_name }); setError(""); }}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors">Edit</button>
                        <button onClick={() => toggleActive(user)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${user.is_active ? "text-red-400 hover:bg-red-400/10" : "text-green-400 hover:bg-green-400/10"}`}>
                          {user.is_active ? "Revoke" : "Restore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showCreate && (
        <Modal title="Create Account" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="School Name" placeholder="St. Mary's High School" onChange={f("school_name")} required />
            <Field label="Email" type="email" placeholder="school@example.com" onChange={f("email")} required />
            <Field label="Password" type="password" placeholder="Min. 6 characters" onChange={f("password")} required minLength={6} />
            <Field label="WhatsApp Token" placeholder="EAAxxxxx…" onChange={f("whatsapp_token")} required />
            <Field label="Phone Number ID" placeholder="1234567890" onChange={f("phone_number_id")} required />
            <Field label="Template Name" placeholder="marks_update" onChange={f("template_name")} />
            {error && <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-all">
              {saving ? "Creating…" : "Create Account"}
            </button>
          </form>
        </Modal>
      )}

      {editUser && (
        <Modal title="Edit Account" onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-3">
            <Field label="School Name" defaultValue={editUser.school_name} onChange={f("school_name")} />
            <Field label="WhatsApp Token" defaultValue={editUser.whatsapp_token} onChange={f("whatsapp_token")} />
            <Field label="Phone Number ID" defaultValue={editUser.phone_number_id} onChange={f("phone_number_id")} />
            <Field label="Template Name" defaultValue={editUser.template_name} onChange={f("template_name")} />
            {error && <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-all">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
